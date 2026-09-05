import copy
import json
from pathlib import Path
import pytest
from execution.index_concierge import build_plan, sync, Cloudflare
from execution.evaluate_concierge import metrics, report
from motkarta.rag import eligible_place, place_to_rag_document
from motkarta.concierge import answer_query, synthesize_concierge_response

FIXTURES = Path(__file__).resolve().parents[1] / 'tests/fixtures/concierge'
PLACES = json.loads((FIXTURES / 'places.json').read_text())['places']


def corpus():
    return {'corpusVersion': 'v1', 'model': 'model-v1', 'dimensions': 2, 'metric': 'cosine',
            'inputCount': 1, 'admittedCount': 1, 'rejectedCount': 0,
            'documents': [{'id': '1', 'document': 'name: Test', 'metadata': {'documentHash': 'abc'}}]}


class Index:
    def __init__(self, ready=True):
        self.values = {}
        self.ready = ready
        self.embedded = 0
        self.deleted = []

    def info(self):
        return {'vectorCount': len(self.values)}

    def check_configuration(self, data):
        assert data['dimensions'] == 2

    def embed(self, texts, model):
        self.embedded += len(texts)
        return [[0.1, 0.2] for _ in texts]

    def upsert(self, vectors):
        self.values.update({v['id']: v for v in vectors})
        return {'mutationId': 'upsert'}

    def delete(self, ids):
        self.deleted.extend(ids)
        for id in ids:
            self.values.pop(id, None)
        return {'mutationId': 'delete'}

    def get(self, ids):
        return [self.values[id] for id in ids if id in self.values] if self.ready else []


def test_incremental_sync_skips_unchanged_and_deletes_removed():
    data = corpus()
    client = Index()
    initial = sync(data, build_plan(data, None, 'preview'), client, sleep=lambda _: None)
    assert initial['status'] == 'verified'
    plan = build_plan(data, initial, 'preview')
    assert plan['changedIds'] == []
    assert plan['unchangedCount'] == 1
    sync(data, plan, client, sleep=lambda _: None)
    assert client.embedded == 1
    removed = {**data, 'documents': []}
    result = sync(removed, build_plan(removed, initial, 'preview'), client, sleep=lambda _: None)
    assert client.deleted == ['1']
    assert result['hashes'] == {}


def test_unready_mutation_never_reports_verified():
    data = corpus()
    with pytest.raises(RuntimeError, match='not ready'):
        sync(data, build_plan(data, None, 'preview'), Index(ready=False), sleep=lambda _: None, attempts=2)


def test_index_requires_same_model_dimensions_corpus_and_manifest():
    data = corpus()
    old = {**build_plan(data, None, 'preview'), 'status': 'verified'}
    for key, value in [('model', 'new-model'), ('dimensions', 3), ('corpusVersion', 'new-v')]:
        with pytest.raises(ValueError):
            build_plan({**data, key: value}, old, 'preview')
    with pytest.raises(ValueError):
        build_plan(data, old, 'another-index')
    with pytest.raises(ValueError):
        build_plan(data, {**old, 'status': 'dry_run'}, 'preview')


def test_invalid_embeddings_do_not_upsert():
    data = corpus()
    for embeddings in [[], [[1]], [[float('nan'), 1]], [[0, 0]], [[True, 1]]]:
        client = Index()
        client.embed = lambda *_, result=embeddings: result
        with pytest.raises(ValueError):
            sync(data, build_plan(data, None, 'preview'), client)
        assert not client.values


def test_transport_identifiers_cannot_change_api_host_or_path():
    with pytest.raises(ValueError):
        Cloudflare('x', 'secret', '../another')


def test_python_and_typescript_share_exclusion_policy_fixtures():
    for p in PLACES:
        assert eligible_place(p) is (p['id'] not in {14, 15, 16, 17, 18})
    docs = [vars(place_to_rag_document(p)) for p in PLACES]
    for query in ['Starbucks', 'Kahls', 'unicorn stew', 'pierogi near me', 'pierogi open now']:
        assert answer_query(query, docs) == []
    for query in ['pierogi', 'ramen not sushi']:
        assert answer_query(query, docs)


def test_python_never_calls_provider_from_environment_or_invents_verified_claims(monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY', 'unused-test-key')
    doc = vars(place_to_rag_document(PLACES[0]))
    assert 'verified independent' not in doc['text']
    result = synthesize_concierge_response('pierogi', [doc])
    assert result['source'] == 'deterministic'
    assert 'Unknown' in result['synthesized_answer']
    assert 'Recently verified' not in result['synthesized_answer']


def test_metrics_use_independent_labels_and_no_satisfaction_proxy():
    q = {'q': {'relevance': {'1': 1}, 'exactName': True}}
    result = metrics([{'id': 'q', 'corrected': [2, 1]}], q, 'corrected', {'1': {}, '2': {}})
    assert result['recallAt50'] == 1
    assert 0 < result['ndcgAt5'] < 1
    assert result['exactNameSuccess'] == 0
    assert result['satisfaction'] is None


def test_query_set_has_120_cases_and_no_family_leakage():
    data = json.loads((FIXTURES / 'queries.json').read_text())
    assert len(data['queries']) >= 120
    families = {}
    for q in data['queries']:
        assert q['family'] not in families or families[q['family']] == q['split']
        families[q['family']] = q['split']
    bad = copy.deepcopy(data)
    bad['queries'][1]['split'] = 'holdout'
    with pytest.raises(ValueError, match='leakage'):
        report({'results': []}, bad, {str(p['id']): p for p in PLACES})
