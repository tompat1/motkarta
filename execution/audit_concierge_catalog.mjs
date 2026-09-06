import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { placeQuery, evidenceQuery, tagQuery, rowsToPlaceInputs } from '../lib/place-records.ts';
import { eligiblePlace, coordinates, distanceKm } from '../lib/concierge/gates.ts';
import { placeFacts, documentHash, normalize } from '../lib/concierge/facts.ts';
import { VERSIONS } from '../lib/concierge/contracts.ts';
import { resolveConciergeMapPlace } from '../lib/concierge/map-identity.ts';

export const auditSql = [placeQuery, evidenceQuery, tagQuery,
  'SELECT id, osm_type, osm_id, updated_at FROM establishments ORDER BY id'].join(';\n') + ';\n';

function uniqueIds(rows, label) {
  const map = new Map();
  for (const row of rows) {
    if (!row || !Number.isSafeInteger(row.id) || row.id < 0 || map.has(row.id)) throw new Error(`Invalid or duplicate ${label} ID`);
    map.set(row.id, row);
  }
  return map;
}

export function parseD1Export(value) {
  if (!Array.isArray(value) || value.length !== 4 || value.some((part) => part.success !== true || !Array.isArray(part.results))) throw new Error('Expected four successful D1 query result sets');
  const [rows, evidence, tags, identities] = value.map((part) => part.results);
  const ids = uniqueIds(rows, 'D1'), identityIds = uniqueIds(identities, 'OSM identity');
  if (ids.size !== identityIds.size || [...ids.keys()].some((id) => !identityIds.has(id))) throw new Error('Incomplete identity snapshot');
  for (const row of rows) {
    if (typeof row.name !== 'string' || typeof row.type !== 'string' || typeof row.district !== 'string') throw new Error('Missing D1 venue fields');
  }
  if ([...evidence, ...tags].some((row) => !ids.has(row.establishment_id))) throw new Error('Orphan evidence or tags');
  return { places: rowsToPlaceInputs(rows.map((row) => ({ ...identityIds.get(row.id), ...row })), evidence, tags), identities };
}

// Existing public pipeline identity convention (zlib.crc32 of OSM type:id).
// A 32-bit hash alone does not prove venue identity; corroboration follows below.
export function osmPublicId(type, id) {
  if (!['node', 'way', 'relation'].includes(type) || !/^\d+$/.test(String(id))) return undefined;
  let crc = 0xffffffff;
  for (const byte of new TextEncoder().encode(`${type}:${id}`)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function identityCheck(a, b) {
  const sameName = normalize(a.name) === normalize(b.name);
  const separationKm = coordinates(a) && coordinates(b) ? distanceKm(a, b) : null;
  const sameAddress = Boolean(a.address && b.address && normalize(a.address) === normalize(b.address));
  const conflict = !sameName || (separationKm !== null && separationKm > 0.15);
  return { sameName, separationKm, sameAddress, conflict, corroborated: !conflict && (sameAddress || separationKm !== null) };
}

function fieldDifferences(a, b) {
  const fields = (place) => {
    const result = {};
    for (const fact of placeFacts(place).facts.filter((f) => f.field !== 'evidenceRecord')) (result[fact.field] ??= []).push(fact.value);
    return result;
  };
  const left = fields(a), right = fields(b);
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((field) => JSON.stringify(left[field]) !== JSON.stringify(right[field])).sort();
}

export async function auditCatalog(publicPlaces, snapshot, indexPlaces = publicPlaces) {
  const publicIds = uniqueIds(publicPlaces, 'public'), d1Ids = uniqueIds(snapshot.places, 'D1');
  const identities = new Map(snapshot.identities.map((row) => [row.id, row]));
  const mapping = [], missing = [], sameIds = [], fieldCounts = {}, usedPublic = new Set(), derivedOwners = new Map();
  for (const place of snapshot.places) {
    const identity = identities.get(place.id);
    const derivedId = osmPublicId(identity?.osm_type, identity?.osm_id);
    if (derivedId !== undefined) {
      const owners = derivedOwners.get(derivedId) ?? [];
      owners.push(place.id); derivedOwners.set(derivedId, owners);
    }
    const same = publicIds.get(place.id);
    if (same) sameIds.push({ d1Id: place.id, ...identityCheck(place, same), hashMatches: await documentHash(placeFacts(place).document) === await documentHash(placeFacts(same).document), eligible: eligiblePlace(place) });
    const candidate = derivedId === undefined ? undefined : publicIds.get(derivedId);
    if (!candidate) { missing.push({ d1Id: place.id, name: place.name, eligible: eligiblePlace(place) }); continue; }
    usedPublic.add(candidate.id);
    const differences = fieldDifferences(place, candidate);
    for (const field of differences) fieldCounts[field] = (fieldCounts[field] ?? 0) + 1;
    mapping.push({ d1Id: place.id, publicId: candidate.id, name: place.name,
      osmIdentity: `${identity.osm_type}:${identity.osm_id}`, ...identityCheck(place, candidate),
      d1Eligible: eligiblePlace(place), publicEligible: eligiblePlace(candidate),
      d1Lifecycle: place.lifecycleState ?? 'baseline', publicLifecycle: candidate.lifecycleState ?? 'baseline',
      d1Validation: place.validationLabel ?? null, publicValidation: candidate.validationLabel ?? null,
      hashMatches: await documentHash(placeFacts(place).document) === await documentHash(placeFacts(candidate).document), differingFields: differences });
  }
  const collisions = [...derivedOwners].filter(([, ids]) => ids.length > 1).map(([publicId, d1Ids]) => ({ publicId, d1Ids }));
  const eligibleD1 = snapshot.places.filter(eligiblePlace).length;
  const unresolvedMapRecords = snapshot.places.filter((place) => eligiblePlace(place) && !resolveConciergeMapPlace(place, publicPlaces));
  const indexIds = uniqueIds(indexPlaces.filter(eligiblePlace), 'index');
  let indexMatches = 0;
  for (const place of snapshot.places.filter(eligiblePlace)) {
    const indexed = indexIds.get(place.id);
    if (indexed && await documentHash(placeFacts(indexed).document) === await documentHash(placeFacts(place).document)) indexMatches++;
  }
  const corroboratedSameIds = sameIds.filter((row) => row.eligible && row.corroborated);
  const blockers = [];
  if (!eligibleD1) blockers.push('empty_eligible_d1_catalog');
  if (unresolvedMapRecords.length) blockers.push('public_map_ids_do_not_cover_d1');
  if (indexMatches !== eligibleD1 || indexIds.size !== eligibleD1) blockers.push('index_input_does_not_match_d1');
  if (collisions.length) blockers.push('ambiguous_derived_osm_ids');
  if (mapping.some((row) => row.conflict)) blockers.push('mapped_identity_conflicts');
  if (mapping.some((row) => row.d1Eligible !== row.publicEligible)) blockers.push('mapped_eligibility_disagreements');
  const closureConflicts = mapping.filter((row) => row.d1Eligible && row.publicValidation === 'closed_wrong_category');
  if (closureConflicts.length) blockers.push('public_closure_missing_from_d1');
  return {
    auditVersion: 'concierge-catalog-audit-v2', corpusVersion: VERSIONS.corpus, productionReady: false,
    blockers, counts: { public: publicIds.size, d1: d1Ids.size, publicEligible: publicPlaces.filter(eligiblePlace).length, d1Eligible: eligibleD1,
      sameIds: sameIds.length, corroboratedEligibleSameIds: corroboratedSameIds.length,
      resolvedMapRecords: eligibleD1 - unresolvedMapRecords.length, unresolvedMapRecords: unresolvedMapRecords.length,
      compatibleIndexRecords: indexMatches,
      sameIdHashes: sameIds.filter((row) => row.hashMatches).length,
      osmDerivedCandidates: mapping.length, corroboratedOsmCandidates: mapping.filter((row) => row.corroborated).length,
      identityConflicts: mapping.filter((row) => row.conflict).length,
      mappedHashMatches: mapping.filter((row) => row.hashMatches).length,
      eligibilityDisagreements: mapping.filter((row) => row.d1Eligible !== row.publicEligible).length,
      closureConflicts: closureConflicts.length,
      publicWithoutOsmCandidate: publicPlaces.filter((row) => !usedPublic.has(row.id)).length, d1WithoutOsmCandidate: missing.length },
    differingFieldCounts: fieldCounts, sameIds, mappingCandidates: mapping, derivedIdCollisions: collisions,
    closureConflicts,
    unresolvedMapRecords: unresolvedMapRecords.map(({ id, name, osmIdentity }) => ({ id, name, osmIdentity })),
    d1WithoutOsmCandidate: missing,
    publicWithoutOsmCandidate: publicPlaces.filter((row) => !usedPublic.has(row.id)).map(({ id, name }) => ({ id, name })),
  };
}

async function main() {
  const { values } = parseArgs({ options: { 'write-sql': { type: 'string' }, 'd1-export': { type: 'string' }, 'index-input': { type: 'string' }, public: { type: 'string', default: 'public/data/places.json' }, output: { type: 'string', default: '.tmp/concierge-readiness' } } });
  if (values['write-sql']) { await writeFile(values['write-sql'], auditSql); return; }
  if (!values['d1-export']) throw new Error('Supply --d1-export FILE (four query result sets), or --write-sql FILE');
  const [rawPublic, rawD1] = await Promise.all([readFile(values.public, 'utf8'), readFile(values['d1-export'], 'utf8')]);
  const parsed = JSON.parse(rawPublic), publicPlaces = parsed.places ?? parsed;
  if (!Array.isArray(publicPlaces)) throw new Error('Expected a public places array');
  const snapshot = parseD1Export(JSON.parse(rawD1));
  const rawIndex = values['index-input'] ? await readFile(values['index-input'], 'utf8') : undefined;
  const parsedIndex = rawIndex ? JSON.parse(rawIndex) : undefined;
  const report = await auditCatalog(publicPlaces, snapshot, parsedIndex?.places ?? parsedIndex);
  report.inputs = { publicSha256: createHash('sha256').update(rawPublic).digest('hex'), d1ExportSha256: createHash('sha256').update(rawD1).digest('hex') };
  if (rawIndex) report.inputs.indexSha256 = createHash('sha256').update(rawIndex).digest('hex');
  report.auditedAt = new Date().toISOString();
  await mkdir(values.output, { recursive: true });
  await writeFile(resolve(values.output, 'catalog-audit.json'), JSON.stringify(report, null, 2) + '\n');
  const canonicalPath = resolve(values.output, 'canonical-d1.json');
  // Do not overwrite the input whose hash this audit just recorded.
  if (!values['index-input'] || resolve(values['index-input']) !== canonicalPath) {
    await writeFile(canonicalPath, JSON.stringify({ source: 'd1', auditInputs: { publicSha256: report.inputs.publicSha256, d1ExportSha256: report.inputs.d1ExportSha256 }, places: snapshot.places }, null, 2) + '\n');
  }
  console.log(JSON.stringify({ counts: report.counts, blockers: report.blockers, differingFieldCounts: report.differingFieldCounts }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
