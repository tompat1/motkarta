"""Offline source-labeled retrieval evaluation. Never invokes a model or network.

Use --semantic-results for previously authorized provider captures. Without
captures, hybrid quality is not evaluated; mock tests are not quality evidence.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def metrics(rows: list[dict], queries: dict, method: str, catalog: dict) -> dict:
    recalls, ndcgs, abstentions, exacts = [], [], [], []
    exposure = Counter()
    for row in rows:
        q = queries[row['id']]
        ids = list(dict.fromkeys(map(str, row[method])))
        labels = q['relevance']
        relevant = {key for key, grade in labels.items() if grade > 0}
        if relevant:
            recalls.append(len(set(ids[:50]) & relevant) / len(relevant))
            dcg = sum((2 ** labels.get(key, 0) - 1) / math.log2(i + 2) for i, key in enumerate(ids[:5]))
            ideal = sum((2 ** grade - 1) / math.log2(i + 2) for i, grade in enumerate(sorted(labels.values(), reverse=True)[:5]))
            ndcgs.append(dcg / ideal if ideal else 0)
        else:
            abstentions.append(not ids)
        if q.get('exactName'):
            exacts.append(bool(ids) and ids[0] in relevant)
        exposure.update(ids[:5])
    mean = lambda values: sum(values) / len(values) if values else None
    counts = sorted(exposure.get(key, 0) for key in catalog)
    total = sum(counts)
    gini = sum((2 * i - len(counts) - 1) * count for i, count in enumerate(counts, 1)) / (len(counts) * total) if total else 0
    independent = sum(count for key, count in exposure.items() if catalog.get(key, {}).get('chainStatus') == 'independent')
    return {'queryCount': len(rows), 'recallAt50': mean(recalls), 'ndcgAt5': mean(ndcgs),
            'unsupportedAbstention': mean(abstentions), 'exactNameSuccess': mean(exacts),
            'catalogCoverage': len(exposure) / len(catalog), 'exposureGini': gini,
            'independentExposureShare': independent / total if total else None,
            'exposureCounts': dict(exposure), 'satisfaction': None}


def report(results: dict, query_data: dict, catalog: dict) -> dict:
    queries = {q['id']: q for q in query_data['queries']}
    if len(queries) != len(query_data['queries']):
        raise ValueError('Duplicate query IDs')
    family_splits = defaultdict(set)
    for query in queries.values():
        family_splits[query['family']].add(query['split'])
        if not set(query['relevance']).issubset(catalog):
            raise ValueError('Label references missing catalog ID')
    if any(len(splits) != 1 for splits in family_splits.values()):
        raise ValueError('Intent-family leakage across splits')
    methods = {}
    for method in ['legacy', 'corrected', 'hybrid']:
        if not all(method in row for row in results['results']):
            continue
        slices = defaultdict(list)
        for row in results['results']:
            query = queries[row['id']]
            for key in ['split', 'language', 'cuisine', 'geography', 'venueType', 'chainStatus', 'metadataRichness']:
                slices[f'{key}:{query.get(key, "unknown")}'].append(row)
        methods[method] = {'aggregate': metrics(results['results'], queries, method, catalog),
                           'slices': {key: metrics(rows, queries, method, catalog) for key, rows in slices.items()}}
    return {'fixtureVersion': query_data['version'], 'labelProvenance': query_data['labelProvenance'],
            'corpusHash': results['corpusHash'], 'semanticMeasured': results['semanticMeasured'],
            'methods': methods, 'productionReady': False,
            'limitations': ['Synthetic source-based judgments; no independent human outcomes.',
                           'Small slices are descriptive, not statistically reliable.',
                           'Hybrid quality, provider latency and cost require authorized captures.',
                           'No promotion decision is made by this local runner.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog', type=Path, default=ROOT / 'tests/fixtures/concierge/places.json')
    parser.add_argument('--queries', type=Path, default=ROOT / 'tests/fixtures/concierge/queries.json')
    parser.add_argument('--output', type=Path, default=ROOT / '.tmp/concierge/evaluation.json')
    parser.add_argument('--baseline-revision', help='Immutable local git commit containing historical concierge')
    parser.add_argument('--semantic-results', type=Path)
    parser.add_argument('--split', choices=['development', 'holdout', 'all'], default='development')
    args = parser.parse_args()
    query_data = json.loads(args.queries.read_text())
    if args.split != 'all':
        query_data['queries'] = [q for q in query_data['queries'] if q['split'] == args.split]
    temp_root = ROOT / '.tmp'
    temp_root.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=temp_root) as temporary:
        temp = Path(temporary)
        legacy = '-'
        if args.baseline_revision:
            if not re.fullmatch(r'[0-9a-f]{40}', args.baseline_revision):
                raise ValueError('Use a full immutable commit hash')
            source = subprocess.run(['git', 'show', f'{args.baseline_revision}:functions/api/concierge.ts'], cwd=ROOT, text=True, capture_output=True, check=True).stdout
            if 'candidatePool.slice(0, 3)' not in source:
                raise ValueError('Unsupported baseline; expected original lexical retriever')
            # Evaluation-only result budget; retain the historical scoring/gates.
            source = source.replace('candidatePool.slice(0, 3)', 'candidatePool.slice(0, 50)')
            legacy_file = temp / 'baseline.ts'
            legacy_file.write_text(source)
            legacy = str(legacy_file)
        queries = temp / 'queries.json'
        queries.write_text(json.dumps(query_data))
        output = temp / 'results.json'
        subprocess.run(['node', str(ROOT / 'execution/run_concierge_evaluation.mjs'), str(args.catalog.resolve()), str(queries), str(output), legacy, str(args.semantic_results.resolve()) if args.semantic_results else '-'], cwd=ROOT, check=True)
        raw = json.loads(output.read_text())
    catalog = {str(p['id']): p for p in json.loads(args.catalog.read_text())['places']}
    result = report(raw, query_data, catalog)
    result['baselineRevision'] = args.baseline_revision
    result['queriesHash'] = hashlib.sha256(args.queries.read_bytes()).hexdigest()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({method: value['aggregate'] for method, value in result['methods'].items()}))


if __name__ == '__main__':
    main()
