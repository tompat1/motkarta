import json
import pytest
from execution.run_concierge_trial import TrialClient, EMBEDDING, SYNTHESIS


def client(path):
    return TrialClient('a' * 32, 'test-secret', 'motkarta-concierge-preview-v1', path)


def test_budget_counts_attempts_before_network_and_survives_resume(tmp_path):
    trial = client(tmp_path)
    trial.phase = 'queries'
    trial.reserve('/ai/run/' + EMBEDDING, {'text': ['coffee']})
    resumed = client(tmp_path)
    assert resumed.ledger['queryCalls'] == 1
    assert resumed.ledger['reservedModelUsd'] > 0
    assert 'test-secret' not in (tmp_path / 'usage.json').read_text()
    assert 'coffee' not in (tmp_path / 'usage.json').read_text()
    resumed.phase = 'queries'
    resumed.ledger['queryCalls'] = 128
    with pytest.raises(ValueError, match='call budget'):
        resumed.reserve('/ai/run/' + EMBEDDING, {'text': ['coffee']})


def test_synthesis_packet_and_spending_limits_fail_before_network(tmp_path):
    trial = client(tmp_path)
    for body in [{'max_tokens': 501}, {'max_tokens': 500, 'messages': ['x' * 16001]}]:
        with pytest.raises(ValueError, match='packet'):
            trial.reserve('/ai/run/' + SYNTHESIS, body)
    trial.ledger['reservedModelUsd'] = 0.5
    with pytest.raises(ValueError, match='spending'):
        trial.reserve('/ai/run/' + SYNTHESIS, {'max_tokens': 500})
    assert trial.ledger['synthesisCalls'] == 0


def test_trial_cannot_switch_destination_or_model(tmp_path):
    trial = client(tmp_path)
    with pytest.raises(ValueError, match='scope'):
        trial.request('/vectorize/v2/indexes/production/upsert')
    with pytest.raises(ValueError, match='not allowed'):
        trial.reserve('/ai/run/another-model', {})
    trial.reserve(trial.path + '/info', None)
    with pytest.raises(ValueError, match='destination'):
        TrialClient('b' * 32, 'test-secret', trial.ledger['index'], tmp_path)


def test_query_embeddings_are_not_read_from_venue_cache(tmp_path, monkeypatch):
    from execution.index_concierge import Cloudflare
    calls = []
    monkeypatch.setattr(Cloudflare, 'embed', lambda _, texts, model: calls.append(texts) or [[0.1]])
    trial = client(tmp_path)
    assert trial.embed(['venue'], EMBEDDING) == [[0.1]]
    trial.embed(['venue'], EMBEDDING)
    assert len(calls) == 1
    trial.phase = 'queries'
    trial.embed(['venue'], EMBEDDING)
    assert len(calls) == 2
    assert len(list((tmp_path / 'venue-embeddings').glob('*.json'))) == 1
