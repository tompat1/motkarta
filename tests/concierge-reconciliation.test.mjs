import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { planRepairs, repairSql } from '../execution/reconcile_concierge_catalog.mjs';
import { parseCsv, numericOrNull } from '../lib/import-utils.ts';
import { resolveConciergeMapPlace } from '../lib/concierge/map-identity.ts';
import { eligiblePlace } from '../lib/concierge/gates.ts';
import { rowsToPlaceInputs } from '../lib/place-records.ts';

const stamp = '2026-09-06T12:00:00.000Z';
const row = { id: 1, name: "Test's Café", type: 'Café', district: 'Stockholm', address: null, latitude: 0, longitude: 0, lifecycle_state: 'baseline', validation_label: null, validation_notes: null };
const identity = { id: 1, osm_type: 'node', osm_id: '123', updated_at: '2026-09-01' };
const source = { osm_type: 'node', osm_id: '123', name: row.name, latitude: '59.31', longitude: '18.06', street: 'Test Street', house_number: '1' };
const publicPlace = { id: 4153755288, name: row.name, kind: 'Café', area: 'Stockholm', latitude: 59.31, longitude: 18.06, tags: [] };
const raw = (record = row) => [[record], [], [], [identity]].map((results) => ({ success: true, results }));

test('CSV importer retains multiline fields and never converts missing numbers to zero', () => {
  assert.deepEqual(parseCsv('name,hours,lat\r\n"Test, Café","Mo 9-5\nTu 9-5",59.31\r\n'), [{ name: 'Test, Café', hours: 'Mo 9-5\nTu 9-5', lat: '59.31' }]);
  for (const value of ['', ' ', null, undefined]) assert.equal(numericOrNull(value), 'NULL');
  assert.equal(numericOrNull('0'), '0');
  assert.throws(() => parseCsv('a,b\n1,2,3'), /column count/);
  assert.throws(() => parseCsv('a,b\n"unclosed,2'), /Unclosed/);
});

test('repair derives only missing facts, leaves source inputs and numeric IDs intact', () => {
  const before = raw(), pub = { places: [publicPlace] };
  const result = planRepairs(before, pub, [source], stamp);
  assert.deepEqual(result.plan.changes[0].after, { latitude: 59.31, longitude: 18.06, address: 'Test Street 1' });
  assert.equal(result.publicPayload.places[0].id, publicPlace.id);
  assert.equal(result.publicPayload.places[0].osmIdentity, 'node:123');
  assert.equal(result.projected[0].results[0].id, 1);
  assert.equal(before[0].results[0].latitude, 0);
  assert.equal(pub.places[0].osmIdentity, undefined);
  assert.doesNotMatch(repairSql(result.plan), /\b(INSERT|DELETE|REPLACE|DROP)\b/);
  assert.throws(() => repairSql({ changes: [{ ...result.plan.changes[0], guard: {} }] }), /Incomplete repair guard/);
});

test('guarded repair and rollback work in SQLite and preserve foreign-key references', () => {
  const plan = planRepairs(raw(), [publicPlace], [source], stamp).plan;
  const result = execFileSync('python3', ['-c', `
import sqlite3,json,sys
p=json.load(sys.stdin);db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')
db.execute('CREATE TABLE establishments(id INTEGER PRIMARY KEY,name TEXT,osm_type TEXT,osm_id TEXT,updated_at TEXT,lifecycle_state TEXT,validation_label TEXT,validation_notes TEXT,address TEXT,latitude REAL,longitude REAL)')
db.execute('CREATE TABLE reference(establishment_id INTEGER REFERENCES establishments(id))')
r=p['row'];db.execute('INSERT INTO establishments VALUES(?,?,?,?,?,?,?,?,?,?,?)',[r[k] for k in ['id','name','osm_type','osm_id','updated_at','lifecycle_state','validation_label','validation_notes','address','latitude','longitude']]);db.execute('INSERT INTO reference VALUES(1)');db.commit()
original=db.execute('SELECT * FROM establishments').fetchall()
db.executescript(p['sql']);assert db.execute('SELECT latitude,address FROM establishments').fetchone()==(59.31,'Test Street 1')
db.executescript(p['rollback']);assert db.execute('SELECT * FROM establishments').fetchall()==original
db.execute("UPDATE establishments SET updated_at='newer-review'");db.commit();db.executescript(p['sql'])
assert db.execute('SELECT latitude,address FROM establishments').fetchone()==(0,None)
assert db.execute('SELECT * FROM reference').fetchall()==[(1,)]
print('guarded repair and rollback pass')
`], { input: JSON.stringify({ row: { ...row, ...identity }, sql: repairSql(plan), rollback: repairSql(plan, true) }), encoding: 'utf8' });
  assert.match(result, /pass/);
});

test('existing review labels and nonempty addresses are never overwritten', () => {
  const pub = { ...publicPlace, validationLabel: 'closed_wrong_category', validationNotes: 'Closed source note' };
  const existing = { ...row, latitude: 59.31, longitude: 18.06, address: 'Reviewed street 2', lifecycle_state: 'verified', validation_label: 'known_hidden_gem' };
  const result = planRepairs(raw(existing), [pub], [source], stamp);
  assert.deepEqual(result.plan.changes, []);
  assert.equal(result.plan.review[0].reason, 'existing_d1_review_requires_manual_resolution');
  const allowed = planRepairs(raw(), [pub], [source], stamp);
  assert.equal(allowed.plan.changes[0].after.validation_label, 'closed_wrong_category');
});

test('conflicting source IDs, names and valid locations require review', () => {
  assert.throws(() => planRepairs(raw(), [publicPlace], [source, source], stamp), /Ambiguous/);
  const mismatch = planRepairs(raw(), [publicPlace], [{ ...source, name: 'Another Café' }], stamp);
  assert.deepEqual(mismatch.plan.changes, []);
  const moved = planRepairs(raw({ ...row, latitude: 59.4, longitude: 18.1 }), [publicPlace], [source], stamp);
  assert.deepEqual(moved.plan.changes, []);
});

test('map bridge uses full OSM identity without changing public or D1 IDs', () => {
  const card = { ...publicPlace, id: 1, idNamespace: 'd1', osmIdentity: 'node:123' };
  const pub = { ...publicPlace, idNamespace: 'public', osmIdentity: 'node:123' };
  assert.equal(resolveConciergeMapPlace(card, [pub])?.id, 4153755288);
  assert.equal(resolveConciergeMapPlace(card, [{ ...pub, osmIdentity: 'node:456' }]), undefined);
  assert.equal(resolveConciergeMapPlace(card, [pub, { ...pub, id: 2 }]), undefined);
  assert.equal(resolveConciergeMapPlace(card, [{ ...pub, latitude: 59.4 }]), undefined);
  assert.equal(resolveConciergeMapPlace(card, [{ ...pub, validationLabel: 'closed_wrong_category' }]), undefined);
  assert.equal(resolveConciergeMapPlace(card, [{ ...pub, id: 1, osmIdentity: undefined }]), undefined);
});

test('source locality survives derived region labels but never overrides exclusions or impossible coordinates', () => {
  const loaded = rowsToPlaceInputs([{ ...row, latitude: 59.36, longitude: 18.08, osm_type: 'node', osm_id: '123' }])[0];
  assert.equal(loaded.idNamespace, 'd1'); assert.equal(loaded.osmIdentity, 'node:123');
  assert.equal(loaded.area, 'Norrort'); assert.equal(loaded.sourceArea, 'Stockholm');
  assert.equal(eligiblePlace(loaded), true);
  assert.equal(eligiblePlace({ ...loaded, address: 'Solna, Stockholm' }), false);
  assert.equal(eligiblePlace({ ...loaded, latitude: 0, longitude: 0 }), false);
  for (const name of ["McDonald's", 'Max', 'Sibylla']) assert.equal(eligiblePlace({ ...loaded, name }), false, name);
  assert.equal(eligiblePlace({ ...loaded, name: "Max's Café" }), true);
});

test('existing duplicate mappings support spacing aliases but not arbitrary name or location guesses', () => {
  const removed = { ...source, osm_id: '456', name: "Tests Café" };
  const kept = { ...source, name: 'TestsCafé' };
  const pub = { ...publicPlace, name: 'TestsCafé' };
  const duplicates = [{ duplicate_index: '1', duplicate_name: removed.name, kept_index: '0', kept_name: kept.name }];
  const result = planRepairs(raw(), [pub], [kept, removed], stamp, {}, duplicates);
  assert.deepEqual(result.publicPayload[0].osmAliases, ['node:456']);
  const card = { ...pub, id: 7, idNamespace: 'd1', osmIdentity: 'node:456', name: 'Tests Café' };
  assert.equal(resolveConciergeMapPlace(card, result.publicPayload)?.id, pub.id);
  assert.equal(resolveConciergeMapPlace({ ...card, name: 'Different Café' }, result.publicPayload), undefined);
  assert.throws(() => planRepairs(raw(), [pub], [kept, removed], stamp, {}, [{ ...duplicates[0], duplicate_name: 'changed' }]), /no longer matches/);
});
