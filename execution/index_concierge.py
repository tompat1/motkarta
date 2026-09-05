"""Dry-run by default. --apply uses paid AI and mutates an EXISTING preview index.

The Node exporter is the production fact/gate authority, ensuring byte-identical
hashes. This script does not create resources or promote an index.
"""
from __future__ import annotations
import argparse
import json
import math
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def build_plan(corpus: dict, previous: dict | None, index: str) -> dict:
    previous = previous or {}
    if previous:
        for key in ['corpusVersion', 'model', 'dimensions', 'metric']:
            if previous.get(key) != corpus[key]:
                raise ValueError(f'{key} changed: use a new index and manifest')
        if previous.get('index') != index:
            raise ValueError('Manifest belongs to a different index')
        if previous.get('status') != 'verified':
            raise ValueError('Previous manifest is not verified')
    old = previous.get('hashes', {})
    hashes = {d['id']: d['metadata']['documentHash'] for d in corpus['documents']}
    changed = [d for d in corpus['documents'] if old.get(d['id']) != hashes[d['id']]]
    return {**{k: v for k, v in corpus.items() if k != 'documents'}, 'index': index,
            'hashes': hashes, 'changedIds': [d['id'] for d in changed],
            'deletedIds': sorted(set(old) - set(hashes)), 'unchangedCount': len(hashes) - len(changed),
            'estimatedInputTokens': sum(math.ceil(len(d['document']) / 3) for d in changed),
            'storedDimensions': len(hashes) * corpus['dimensions'], 'status': 'dry_run'}


class Cloudflare:
    def __init__(self, account: str, token: str, index: str):
        if not re.fullmatch(r'[a-fA-F0-9]{32}', account) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}', index):
            raise ValueError('Invalid account or index identifier')
        self.base = f'https://api.cloudflare.com/client/v4/accounts/{account}'
        self.path = f'/vectorize/v2/indexes/{index}'
        self.token = token

    def request(self, path: str, body=None, method='POST', raw: bytes | None = None):
        data = raw if raw is not None else json.dumps(body).encode() if body is not None else None
        headers = {'Authorization': f'Bearer {self.token}', 'Content-Type': 'application/x-ndjson' if raw is not None else 'application/json'}
        # Bound retries; never print credentials or provider bodies.
        for attempt in range(3):
            try:
                with urllib.request.urlopen(urllib.request.Request(self.base + path, data=data, headers=headers, method=method), timeout=20) as response:
                    payload = json.load(response)
                if not payload.get('success', True):
                    raise RuntimeError('Cloudflare operation failed')
                return payload.get('result', payload)
            except urllib.error.HTTPError as error:
                if error.code not in {429, 502, 503, 504} or attempt == 2:
                    raise RuntimeError(f'Cloudflare HTTP {error.code}') from None
                time.sleep(2 ** attempt)
        raise RuntimeError('Cloudflare retries exhausted')

    def embed(self, texts: list[str], model: str):
        return self.request('/ai/run/' + model, {'text': texts})['data']

    def upsert(self, vectors: list[dict]):
        return self.request(self.path + '/upsert', raw=('\n'.join(json.dumps(v) for v in vectors) + '\n').encode())

    def delete(self, ids: list[str]):
        return self.request(self.path + '/delete_by_ids', {'ids': ids})

    def get(self, ids: list[str]):
        return self.request(self.path + '/get_by_ids', {'ids': ids})

    def info(self):
        return self.request(self.path + '/info', method='GET')

    def check_configuration(self, corpus: dict):
        description = self.request(self.path, method='GET')
        config = description.get('config', {})
        if config.get('dimensions') != corpus['dimensions'] or config.get('metric') != corpus['metric']:
            raise ValueError('Index dimensions/metric mismatch')
        metadata = self.request(self.path + '/metadata_index/list', method='GET')
        actual = {entry['propertyName']: entry['indexType'] for entry in metadata.get('metadataIndexes', [])}
        if any(actual.get(key) != kind for key, kind in {'corpusVersion': 'string', 'eligible': 'boolean', 'area': 'string'}.items()):
            raise ValueError('Create required metadata indexes before upserting')


def sync(corpus: dict, plan: dict, client, *, sleep=time.sleep, attempts=10) -> dict:
    client.check_configuration(corpus)
    changed = set(plan['changedIds'])
    documents = [d for d in corpus['documents'] if d['id'] in changed]
    mutations = []
    for start in range(0, len(documents), 16):
        batch = documents[start:start + 16]
        embeddings = client.embed([d['document'] for d in batch], corpus['model'])
        if not isinstance(embeddings, list) or len(embeddings) != len(batch):
            raise ValueError('Embedding batch size mismatch')
        vectors = []
        for doc, values in zip(batch, embeddings):
            if not isinstance(values, list) or len(values) != corpus['dimensions'] or any(type(v) not in (float, int) or not math.isfinite(v) for v in values) or not any(values):
                raise ValueError('Invalid embedding dimensions or values')
            vectors.append({'id': doc['id'], 'values': values, 'metadata': doc['metadata']})
        mutations.append(client.upsert(vectors))
    for start in range(0, len(plan['deletedIds']), 100):
        mutations.append(client.delete(plan['deletedIds'][start:start + 100]))
    # Verify every expected hash and every deleted ID; an accepted mutation is not completion.
    expected = plan['hashes']
    ids = list(expected) + plan['deletedIds']
    for attempt in range(attempts):
        observed = {}
        for start in range(0, len(ids), 100):
            for vector in client.get(ids[start:start + 100]):
                observed[vector['id']] = vector.get('metadata', {}).get('documentHash')
        info = client.info()
        if observed == expected and info.get('vectorCount') == len(expected):
            return {**plan, 'status': 'verified', 'mutations': mutations,
                    'verifiedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                    'promotion': 'not_promoted; preview query smoke test still required'}
        if attempt + 1 < attempts:
            sleep(2)
    raise RuntimeError('Index is not ready; retain prior manifest and retry. No promotion performed.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=ROOT / 'public/data/places.json')
    parser.add_argument('--index', required=True)
    parser.add_argument('--previous', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / '.tmp/concierge/index-plan.json')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--max-input-tokens', type=int, default=0, help='Required explicit budget with --apply')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as temporary:
        exported = Path(temporary) / 'corpus.json'
        subprocess.run(['node', str(ROOT / 'execution/export_concierge.mjs'), str(args.input.resolve()), str(exported)], check=True, cwd=ROOT)
        corpus = json.loads(exported.read_text())
    previous = json.loads(args.previous.read_text()) if args.previous else None
    plan = build_plan(corpus, previous, args.index)
    if args.apply:
        if args.max_input_tokens <= 0 or plan['estimatedInputTokens'] > args.max_input_tokens:
            raise ValueError('Estimated tokens exceed explicit budget; review dry-run first')
        client = Cloudflare(os.environ['CLOUDFLARE_ACCOUNT_ID'], os.environ['CLOUDFLARE_API_TOKEN'], args.index)
        plan = sync(corpus, plan, client)
    write_json(args.output, plan)
    print(json.dumps({k: plan[k] for k in ['status', 'admittedCount', 'rejectedCount', 'unchangedCount', 'estimatedInputTokens']}))


if __name__ == '__main__':
    main()
