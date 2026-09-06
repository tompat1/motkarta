import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { parseCsv } from '../lib/import-utils.ts';
import { normalize } from '../lib/concierge/facts.ts';
import { coordinates, distanceKm } from '../lib/concierge/gates.ts';
import { osmPublicId, parseD1Export } from './audit_concierge_catalog.mjs';

const FIELDS = new Set(['address', 'latitude', 'longitude', 'lifecycle_state', 'validation_label', 'validation_notes']);
const localCoordinates = (p) => coordinates(p) && p.latitude >= 59.20 && p.latitude <= 59.47 && p.longitude >= 17.75 && p.longitude <= 18.25;
const sha = (text) => createHash('sha256').update(text).digest('hex');

function uniqueMap(rows, key, label) {
  const map = new Map();
  for (const row of rows) {
    const id = key(row);
    if (map.has(id)) throw new Error(`Ambiguous ${label}: ${id}`);
    map.set(id, row);
  }
  return map;
}

export function planRepairs(raw, publicPayload, sourceRows, repairedAt, inputs = {}, duplicateRows = []) {
  parseD1Export(raw);
  if (!Number.isFinite(Date.parse(repairedAt))) throw new Error('Invalid repair timestamp');
  const publicPlaces = structuredClone(publicPayload.places ?? publicPayload);
  const publicById = uniqueMap(publicPlaces, (p) => p.id, 'public ID');
  const sources = uniqueMap(sourceRows, (p) => `${p.osm_type}:${p.osm_id}`, 'source OSM identity');
  const identities = uniqueMap(raw[3].results, (p) => p.id, 'D1 ID');
  uniqueMap(raw[3].results.filter((p) => p.osm_type && p.osm_id), (p) => `${p.osm_type}:${p.osm_id}`, 'D1 OSM identity');
  const changes = [], review = [], claimedPublicIds = new Set();
  let publicIdentitiesAdded = 0;
  for (const row of raw[0].results) {
    const identity = identities.get(row.id), key = `${identity.osm_type}:${identity.osm_id}`;
    const source = sources.get(key);
    const publicId = osmPublicId(identity.osm_type, identity.osm_id), pub = publicById.get(publicId);
    const sourcePoint = source ? { latitude: source.latitude?.trim() ? Number(source.latitude) : NaN, longitude: source.longitude?.trim() ? Number(source.longitude) : NaN } : {};
    const sourceMatches = source && normalize(source.name) === normalize(row.name) && localCoordinates(sourcePoint);
    const publicMatches = sourceMatches && pub && normalize(pub.name) === normalize(row.name) && localCoordinates(pub) && distanceKm(pub, sourcePoint) <= 0.15;
    if (publicMatches) {
      if (claimedPublicIds.has(pub.id) || (pub.osmIdentity && pub.osmIdentity !== key)) throw new Error(`Conflicting public identity: ${pub.id}`);
      claimedPublicIds.add(pub.id);
      if (!pub.osmIdentity) publicIdentitiesAdded++;
      pub.osmIdentity = key; pub.idNamespace = 'public';
    }
    if (!sourceMatches || (localCoordinates(row) && distanceKm(row, sourcePoint) > 0.15)) {
      review.push({ id: row.id, name: row.name, reason: 'source_identity_or_location_not_corroborated' }); continue;
    }
    const after = {}, reasons = [];
    if (!localCoordinates(row)) {
      if (publicMatches) { Object.assign(after, sourcePoint); reasons.push('coordinates_from_matching_osm_and_public_record'); }
      else { review.push({ id: row.id, name: row.name, reason: 'invalid_coordinates_need_second_source' }); continue; }
    }
    if (!row.address && source.street?.trim() && source.house_number?.trim()) {
      after.address = `${source.street.trim()} ${source.house_number.trim()}`;
      reasons.push('missing_street_address_from_osm_fields');
    }
    if (publicMatches && pub.validationLabel === 'closed_wrong_category' && row.validation_label !== 'closed_wrong_category') {
      if (row.lifecycle_state === 'baseline' && !row.validation_label && !row.validation_notes && pub.validationNotes?.trim()) {
        Object.assign(after, { lifecycle_state: 'candidate', validation_label: 'closed_wrong_category', validation_notes: `${pub.validationNotes.trim()} [Catalog reconciliation; public ID ${pub.id}; source snapshot ${inputs.publicSha256 ?? 'test'}]` });
        reasons.push('existing_public_closure_label');
      } else review.push({ id: row.id, name: row.name, reason: 'existing_d1_review_requires_manual_resolution' });
    }
    if (!Object.keys(after).length) continue;
    const before = Object.fromEntries(Object.keys(after).map((field) => [field, row[field] ?? null]));
    changes.push({ id: row.id, name: row.name, osmIdentity: key, reasons, before, after,
      guard: { id: row.id, name: row.name, osm_type: identity.osm_type, osm_id: identity.osm_id, updated_at: identity.updated_at,
        lifecycle_state: row.lifecycle_state ?? null, validation_label: row.validation_label ?? null, validation_notes: row.validation_notes ?? null }, repairedAt });
  }
  const projected = structuredClone(raw);
  let publicAliasesAdded = 0;
  for (const duplicate of duplicateRows) {
    const removed = sourceRows[Number(duplicate.duplicate_index)], kept = sourceRows[Number(duplicate.kept_index)];
    if (!removed || !kept || removed.name !== duplicate.duplicate_name || kept.name !== duplicate.kept_name) throw new Error('Duplicate mapping no longer matches source rows');
    const keptPublic = publicById.get(osmPublicId(kept.osm_type, kept.osm_id));
    if (!keptPublic) continue; // The kept venue may itself be excluded from public data.
    const removedPoint = { latitude: Number(removed.latitude), longitude: Number(removed.longitude) };
    const keptPoint = { latitude: Number(kept.latitude), longitude: Number(kept.longitude) };
    const compact = (name) => normalize(name).replaceAll(' ', '');
    if (compact(removed.name) !== compact(keptPublic.name) || !localCoordinates(keptPublic) || !localCoordinates(removedPoint) || !localCoordinates(keptPoint) || distanceKm(removedPoint, keptPublic) > 0.15 || distanceKm(keptPoint, keptPublic) > 0.15) {
      review.push({ name: removed.name, reason: 'duplicate_mapping_not_corroborated' }); continue;
    }
    const alias = `${removed.osm_type}:${removed.osm_id}`;
    if (publicPlaces.some((p) => p !== keptPublic && (p.osmIdentity === alias || p.osmAliases?.includes(alias)))) throw new Error('Ambiguous duplicate alias');
    if (!keptPublic.osmAliases?.includes(alias)) {
      keptPublic.osmAliases = [...(keptPublic.osmAliases ?? []), alias].sort(); publicAliasesAdded++;
    }
  }
  for (const change of changes) {
    Object.assign(projected[0].results.find((r) => r.id === change.id), change.after);
    projected[3].results.find((r) => r.id === change.id).updated_at = repairedAt;
  }
  return { plan: { version: 'concierge-reconciliation-v1', inputs, repairedAt, changes, review,
    summary: { updatedRecords: changes.length, publicIdentitiesAdded, publicAliasesAdded, addresses: changes.filter((c) => 'address' in c.after).length, coordinates: changes.filter((c) => 'latitude' in c.after).length, closureLabels: changes.filter((c) => 'validation_label' in c.after).length } },
    publicPayload: Array.isArray(publicPayload) ? publicPlaces : { ...publicPayload, places: publicPlaces }, projected };
}

function literal(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('Invalid SQL number'); return String(value); }
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function repairSql(plan, rollback = false) {
  return plan.changes.map((change) => {
    if (Object.keys(change.after).some((field) => !FIELDS.has(field))) throw new Error('Forbidden repair field');
    const guardFields = ['id', 'name', 'osm_type', 'osm_id', 'updated_at', 'lifecycle_state', 'validation_label', 'validation_notes'].sort();
    if (JSON.stringify(Object.keys(change.guard).sort()) !== JSON.stringify(guardFields) || !Number.isSafeInteger(change.guard.id) || change.guard.id !== change.id || !change.guard.updated_at) throw new Error('Incomplete repair guard');
    if (JSON.stringify(Object.keys(change.before).sort()) !== JSON.stringify(Object.keys(change.after).sort())) throw new Error('Rollback fields do not match repair');
    const desired = rollback ? change.before : change.after;
    const expected = rollback ? { ...change.guard, ...change.after, updated_at: change.repairedAt } : { ...change.guard, ...change.before };
    const updatedAt = rollback ? change.guard.updated_at : change.repairedAt;
    const assignments = Object.entries({ ...desired, updated_at: updatedAt }).map(([field, value]) => `${field} = ${literal(value)}`).join(', ');
    const condition = Object.entries(expected).map(([field, value]) => `${field} IS ${literal(value)}`).join(' AND ');
    return `UPDATE establishments SET ${assignments} WHERE ${condition} RETURNING id;`;
  }).join('\n') + '\n';
}

async function main() {
  const { values } = parseArgs({ options: { 'd1-export': { type: 'string' }, public: { type: 'string', default: 'public/data/places.json' }, osm: { type: 'string', default: 'data/stockholm_food_places.csv' }, duplicates: { type: 'string', default: 'data/stockholm_food_duplicates.csv' }, output: { type: 'string', default: '.tmp/concierge-repair' } } });
  if (!values['d1-export']) throw new Error('Supply --d1-export FILE');
  const [d1, pub, osm] = await Promise.all([readFile(values['d1-export'], 'utf8'), readFile(values.public, 'utf8'), readFile(values.osm, 'utf8')]);
  const duplicates = await readFile(values.duplicates, 'utf8');
  const result = planRepairs(JSON.parse(d1), JSON.parse(pub), parseCsv(osm), new Date().toISOString(), { d1Sha256: sha(d1), publicSha256: sha(pub), osmSha256: sha(osm), duplicateSha256: sha(duplicates) }, parseCsv(duplicates));
  await mkdir(values.output, { recursive: true });
  for (const [name, data] of Object.entries({ 'repair-plan.json': result.plan, 'public-identities.json': result.publicPayload, 'projected-d1.json': result.projected })) await writeFile(resolve(values.output, name), JSON.stringify(data, null, 2) + '\n');
  await writeFile(resolve(values.output, 'repair.sql'), repairSql(result.plan));
  await writeFile(resolve(values.output, 'rollback.sql'), repairSql(result.plan, true));
  console.log(JSON.stringify(result.plan.summary));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
