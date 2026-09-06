"""Private, bounded provider trial. Requires --apply; never deploys or promotes AI."""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import time
import urllib.error
import urllib.request

from execution.index_concierge import Cloudflare, build_plan, sync, write_json

EMBEDDING = '@cf/baai/bge-m3'
SYNTHESIS = '@cf/google/gemma-3-12b-it'


class TrialClient(Cloudflare):
    def __init__(self, account, token, index, directory):
        super().__init__(account, token, index)
        self.directory = Path(directory)
        self.ledger_path = self.directory / 'usage.json'
        self.ledger = json.loads(self.ledger_path.read_text()) if self.ledger_path.exists() else {
            'version': 'concierge-trial-v1', 'index': index, 'account': account,
            'budgetUsd': 1, 'reservedModelUsd': 0,
            'indexCalls': 0, 'queryCalls': 0, 'synthesisCalls': 0, 'vectorQueries': 0,
            'attempts': [],
        }
        if self.ledger['index'] != index or self.ledger['account'] != account:
            raise ValueError('Trial ledger destination changed')
        self.phase = 'index'

    def reserve(self, path, body):
        kind, cost = None, 0
        size = len(json.dumps(body, ensure_ascii=False).encode()) if body is not None else 0
        if path == '/ai/run/' + EMBEDDING:
            kind = 'indexCalls' if self.phase == 'index' else 'queryCalls'
            texts = body.get('text', [])
            if not isinstance(texts, list) or not texts or any(not isinstance(t, str) for t in texts):
                raise ValueError('Invalid embedding packet')
            if size > 32000 or (kind == 'queryCalls' and len(texts) != 1):
                raise ValueError('Embedding packet exceeds trial limits')
            # UTF-8 bytes plus per-input allowance intentionally overestimate token use.
            cost = (size + 128 * len(texts)) * 0.012 / 1_000_000
        elif path == '/ai/run/' + SYNTHESIS:
            kind = 'synthesisCalls'
            if size > 16000 or body.get('max_tokens') != 500:
                raise ValueError('Synthesis packet exceeds trial limits')
            cost = (size + 1024) * 0.345 / 1_000_000 + 500 * 0.556 / 1_000_000
        elif path.startswith('/ai/'):
            raise ValueError('Trial model is not allowed')
        elif path == self.path + '/query':
            kind = 'vectorQueries'
        limits = {'indexCalls': 591, 'queryCalls': 128, 'synthesisCalls': 32, 'vectorQueries': 128}
        if kind and self.ledger[kind] >= limits[kind]:
            raise ValueError('Trial call budget exhausted')
        # Reserve $0.50 for model usage; leave the rest of the approved $1 for index/compute.
        if self.ledger['reservedModelUsd'] + cost > 0.5:
            raise ValueError('Trial model spending reserve exhausted')
        if kind:
            self.ledger[kind] += 1
        self.ledger['reservedModelUsd'] += cost
        self.ledger['attempts'].append({'operation': path, 'reservedUsd': cost, 'startedAt': time.time()})
        write_json(self.ledger_path, self.ledger)

    def request(self, path, body=None, method='POST', raw=None):
        if not (path.startswith(self.path + '/') or path == self.path or path in ['/ai/run/' + EMBEDDING, '/ai/run/' + SYNTHESIS]):
            raise ValueError('Operation is outside trial scope')
        self.reserve(path, body)
        data = raw if raw is not None else json.dumps(body).encode() if body is not None else None
        headers = {'Authorization': f'Bearer {self.token}', 'Content-Type': 'application/x-ndjson' if raw is not None else 'application/json'}
        started = time.monotonic()
        try:
            with urllib.request.urlopen(urllib.request.Request(self.base + path, data=data, headers=headers, method=method), timeout=30) as response:
                payload = json.load(response)
            if not payload.get('success', True):
                raise RuntimeError('Provider returned an unsuccessful result')
            self.ledger['attempts'][-1]['status'] = 'ok'
            return payload.get('result', payload)
        except urllib.error.HTTPError as error:
            self.ledger['attempts'][-1]['status'] = error.code
            raise RuntimeError(f'Cloudflare HTTP {error.code}') from None
        finally:
            self.ledger['attempts'][-1]['durationMs'] = round((time.monotonic() - started) * 1000)
            write_json(self.ledger_path, self.ledger)

    def embed(self, texts, model):
        digest = hashlib.sha256(json.dumps([model, texts]).encode()).hexdigest()
        cache = self.directory / 'venue-embeddings' / (digest + '.json')
        if self.phase == 'index' and cache.exists():
            return json.loads(cache.read_text())['data']
        result = super().embed(texts, model)
        if self.phase == 'index':
            write_json(cache, {'data': result})
            print(f'Embedded venue batch {self.ledger["indexCalls"]}', flush=True)
        return result


def run_index(client, corpus):
    if corpus['model'] != EMBEDDING or corpus['dimensions'] != 1024:
        raise ValueError('Unexpected corpus model/dimensions')
    previous_path = client.directory / 'index-manifest.json'
    previous = json.loads(previous_path.read_text()) if previous_path.exists() else None
    plan = build_plan(corpus, previous, client.ledger['index'])
    if plan['estimatedInputTokens'] > 150000 or plan['admittedCount'] > 3143:
        raise ValueError('Corpus exceeds approved scope')
    result = sync(corpus, plan, client)
    write_json(previous_path, result)
    print(json.dumps({'status': result['status'], 'vectors': len(result['hashes'])}), flush=True)


def run_cases(client, cases, phase):
    client.phase = phase
    for row in cases:
        if not isinstance(row['id'], str) or not row['id'].replace('-', '').replace('_', '').isalnum():
            raise ValueError('Invalid diagnostic case ID')
        output = client.directory / phase / (row['id'] + '.json')
        if output.exists():
            continue
        started = time.monotonic()
        result = {'id': row['id']}
        try:
            if phase == 'queries':
                vector = client.embed([row['query']], EMBEDDING)[0]
                if len(vector) != 1024 or not any(vector) or not all(type(v) in (int, float) and math.isfinite(v) for v in vector):
                    raise ValueError('Invalid real query embedding')
                embedded_ms = round((time.monotonic() - started) * 1000)
                matches = client.request(client.path + '/query', {'vector': vector, 'topK': 50, 'returnMetadata': 'all', 'returnValues': False, 'filter': row['filter']})
                result.update({'embeddingMs': embedded_ms, 'matches': matches, 'embeddingValidated': True})
            else:
                result['output'] = client.request('/ai/run/' + SYNTHESIS, row['input'])
        except (RuntimeError, ValueError, OSError) as error:
            result['error'] = str(error)
        result['totalMs'] = round((time.monotonic() - started) * 1000)
        write_json(output, result)
        print(f'{phase}: {row["id"]}: {"error" if "error" in result else "captured"}', flush=True)
        if 'error' in result:
            # Inspect the first provider failure before spending on more similar calls.
            raise RuntimeError(f'Trial stopped at {row["id"]}; inspect saved result')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['index', 'queries', 'synthesis'])
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--index', default='motkarta-concierge-preview-v1')
    parser.add_argument('--apply', action='store_true', required=True)
    args = parser.parse_args()
    if args.index != 'motkarta-concierge-preview-v1':
        raise ValueError('Only the approved preview index is allowed')
    client = TrialClient(os.environ['CLOUDFLARE_ACCOUNT_ID'], os.environ['CLOUDFLARE_API_TOKEN'], args.index, args.output)
    data = json.loads(args.input.read_text())
    if args.phase == 'index':
        run_index(client, data)
    else:
        run_cases(client, data, args.phase)


if __name__ == '__main__':
    main()
