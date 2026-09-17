import json
import sqlite3
from pathlib import Path
from execution.repair_enrichment import repair_catalog, sync_sql


def test_repair_removes_unsourced_prices_and_wrong_branch_facts():
    p = {'id': 7, 'name': 'Cafe', 'osmIdentity': 'node:7', 'openingHours': 'Mo-Sa 17:00-23:00', 'priceSEK': '145', 'sourceFacts': [{'id': '7:osm:openingHours', 'field': 'openingHours', 'value': 'Mo-Sa 17:00-23:00', 'source': 'OpenStreetMap', 'url': 'https://www.openstreetmap.org/node/8'}]}
    fixed = repair_catalog({'places': [p]}, {'elements': [{'type': 'node', 'id': 7, 'tags': {'name': 'Cafe', 'opening_hours': '24/7', 'internet_access': 'wlan', 'internet_access:fee': 'no'}}]}, '2026-09-17T00:00:00Z')['places'][0]
    assert fixed['openingHours'] == '24/7'
    assert 'priceSEK' not in fixed
    assert 'Free Wi-Fi' in fixed['tags']
    assert fixed['sourceFacts'][0]['capturedAt'] == '2026-09-17T00:00:00Z'


def test_sync_is_guarded_idempotent_and_preserves_admin_fields():
    db = sqlite3.connect(':memory:')
    db.executescript('CREATE TABLE establishments (id INTEGER PRIMARY KEY, name TEXT, osm_type TEXT, osm_id TEXT, latitude REAL, longitude REAL, updated_at TEXT, opening_hours TEXT, price_sek TEXT, address TEXT, lifecycle_state TEXT, validation_label TEXT); CREATE TABLE establishment_tags(establishment_id INTEGER,tag TEXT);')
    db.executescript(Path('drizzle/0012_place_source_facts.sql').read_text())
    row = dict(id=42, name='Cafe', osm_type='node', osm_id='7', latitude=59.3, longitude=18, updated_at='a', opening_hours=None, price_sek='250', address=None, lifecycle_state='baseline', validation_label=None)
    db.execute('INSERT INTO establishments VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', tuple(row.values()))
    fact = dict(id='7:osm:openingHours', placeId=7, field='openingHours', value='24/7', source='OpenStreetMap', url='https://www.openstreetmap.org/node/7', capturedAt='2026-09-17T00:00:00Z')
    wifi = {**fact, 'id': '7:osm:wifi', 'field': 'tags', 'value': 'Free Wi-Fi'}
    place = dict(id=7, name='Cafe', osmIdentity='node:7', latitude=59.3, longitude=18, openingHours='24/7', sourceFacts=[fact, wifi])
    sql, review = sync_sql({'places': [place]}, [row])
    assert not review
    db.executescript(sql)
    db.executescript(sql)
    assert db.execute('SELECT opening_hours,price_sek FROM establishments').fetchone() == ('24/7', '250')
    assert db.execute('SELECT count(*) FROM place_source_facts').fetchone()[0] == 2
    assert db.execute('SELECT count(*) FROM establishment_tags').fetchone()[0] == 2
    stored = json.loads(db.execute('SELECT fact_json FROM place_source_facts WHERE id=?', ('42:osm:wifi',)).fetchone()[0])
    assert stored['placeId'] == 42
    place['sourceFacts'][1] = {**wifi, 'value': 'No Wi-Fi', 'capturedAt': '2026-09-18T00:00:00Z'}
    newer, _ = sync_sql({'places': [place]}, [row])
    db.executescript(newer)
    db.executescript(sql)  # A stale retry cannot restore free Wi-Fi.
    assert db.execute('SELECT tag FROM establishment_tags').fetchall() == [('No Wi-Fi',)]
    db.execute("UPDATE establishments SET updated_at='admin', opening_hours='Mo 12:00-14:00'")
    db.executescript(sql)
    assert db.execute('SELECT opening_hours FROM establishments').fetchone()[0] == 'Mo 12:00-14:00'
    place['longitude'] = 19
    assert sync_sql({'places': [place]}, [row])[0] == '\n'


def test_osm_extraction_does_not_redate_cached_facts():
    from execution.enrich_catalog import extract_osm_facts
    element = {'type': 'node', 'id': 7, 'timestamp': '2025-01-01T00:00:00Z', 'tags': {'name': 'Cafe', 'opening_hours': '24/7'}}
    index = {'node:7': [{'id': 7, 'name': 'Cafe'}]}
    assert extract_osm_facts([element], index)[7][0]['capturedAt'] == element['timestamp']
    assert extract_osm_facts([element], index, '2026-09-17T00:00:00Z')[7][0]['capturedAt'] == '2026-09-17T00:00:00Z'
