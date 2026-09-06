import test from 'node:test';
import assert from 'node:assert/strict';
import { auditCatalog, parseD1Export, osmPublicId, auditSql } from '../execution/audit_concierge_catalog.mjs';

const place = (overrides = {}) => ({ id: 1, name: 'Test Café', kind: 'Café', area: 'Södermalm', tags: ['coffee'], latitude: 59.31, longitude: 18.06, ...overrides });
const identity = { id: 1, osm_type: 'node', osm_id: '123' };
const snapshot = (places = [place()], identities = [identity]) => ({ places, identities });

test('audit query is read-only and requests the runtime record contract', () => {
  assert.equal(auditSql.split(';').filter((part) => part.trim()).length, 4);
  assert.doesNotMatch(auditSql, /\b(insert|update|delete|replace|drop|alter|create)\b/i);
  assert.match(auditSql, /e\.validation_label/);
  assert.match(auditSql, /FROM evidence_sources/);
});

test('public OSM identity calculation matches Python zlib convention', () => {
  assert.equal(osmPublicId('node', '123'), 4153755288);
  assert.equal(osmPublicId('node', 'bad'), undefined);
  assert.equal(osmPublicId('bogus', '123'), undefined);
});

test('D1 parser rejects failed, incomplete, orphaned and duplicate snapshots', () => {
  const row = { id: 1, name: 'Test Café', type: 'Café', district: 'Södermalm' };
  const valid = [[row], [], [], [identity]].map((results) => ({ results, success: true }));
  assert.equal(parseD1Export(valid).places[0].id, 1);
  for (const invalid of [[], valid.slice(0, 3), [{ ...valid[0], success: false }, ...valid.slice(1)], [{ results: [row, row], success: true }, ...valid.slice(1)], [...valid.slice(0, 3), { results: [], success: true }], [valid[0], valid[1], { results: [{ establishment_id: 999, tag: 'coffee' }], success: true }, valid[3]]]) assert.throws(() => parseD1Export(invalid));
});

test('audit separates mapping candidates from usable runtime IDs and hash parity', async () => {
  const publicPlace = place({ id: osmPublicId('node', '123'), address: 'Street 1' });
  const report = await auditCatalog([publicPlace], snapshot());
  assert.equal(report.counts.sameIds, 0);
  assert.equal(report.counts.corroboratedOsmCandidates, 1);
  assert.equal(report.counts.mappedHashMatches, 0);
  assert.deepEqual(report.mappingCandidates[0].differingFields, ['address']);
  assert.ok(report.blockers.includes('public_map_ids_do_not_cover_d1'));
  assert.equal(publicPlace.id, 4153755288); // Audit never applies mappings.
});

test('coordinate/name conflicts and CRC collisions never establish readiness', async () => {
  const publicPlace = place({ id: osmPublicId('node', '123'), latitude: 0, longitude: 0 });
  const report = await auditCatalog([publicPlace], snapshot());
  assert.equal(report.counts.identityConflicts, 1);
  assert.equal(report.counts.corroboratedOsmCandidates, 0);
  assert.ok(report.blockers.includes('mapped_identity_conflicts'));
  const duplicate = await auditCatalog([publicPlace], snapshot([place(), place({ id: 2 })], [identity, { ...identity, id: 2 }]));
  assert.ok(duplicate.blockers.includes('ambiguous_derived_osm_ids'));
  const renamed = await auditCatalog([place({ id: 4153755288, name: 'Different Café' })], snapshot());
  assert.equal(renamed.counts.identityConflicts, 1);
});

test('empty and ambiguous input cannot pass catalog audit', async () => {
  await assert.rejects(auditCatalog([place(), place()], snapshot()), /duplicate/);
  const empty = await auditCatalog([], snapshot([], []));
  assert.ok(empty.blockers.includes('empty_eligible_d1_catalog'));
  const uncorroborated = await auditCatalog([place({ latitude: undefined, longitude: undefined })], snapshot([place({ latitude: undefined, longitude: undefined })]));
  assert.equal(uncorroborated.counts.corroboratedEligibleSameIds, 0);
});

test('matching catalogs still do not constitute production approval; closure drift is reported', async () => {
  const matching = await auditCatalog([place()], snapshot());
  assert.equal(matching.counts.sameIdHashes, 1);
  assert.deepEqual(matching.blockers, []);
  assert.equal(matching.productionReady, false);
  const drift = await auditCatalog([place({ id: 4153755288 })], snapshot([place({ lifecycleState: 'candidate' })]));
  assert.equal(drift.counts.eligibilityDisagreements, 1);
  assert.ok(drift.blockers.includes('mapped_eligibility_disagreements'));
  const closure = await auditCatalog([place({ id: 4153755288, validationLabel: 'closed_wrong_category' })], snapshot());
  assert.equal(closure.counts.closureConflicts, 1);
  assert.ok(closure.blockers.includes('public_closure_missing_from_d1'));
});

test('audit validates the deployed identity bridge and D1 index contract separately', async () => {
  const d1 = place({ idNamespace: 'd1', osmIdentity: 'node:123' });
  const pub = place({ id: 4153755288, idNamespace: 'public', osmIdentity: 'node:123', address: 'Static-only address' });
  const report = await auditCatalog([pub], snapshot([d1]), [d1]);
  assert.equal(report.counts.sameIds, 0);
  assert.equal(report.counts.resolvedMapRecords, 1);
  assert.equal(report.counts.compatibleIndexRecords, 1);
  assert.deepEqual(report.blockers, []);
  const stale = await auditCatalog([pub], snapshot([d1]), [{ ...d1, name: 'Old name' }]);
  assert.ok(stale.blockers.includes('index_input_does_not_match_d1'));
});
