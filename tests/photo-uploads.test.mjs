import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequestPost as upload, onRequestGet as image } from '../functions/api/photo-upload.ts';
import { onRequestGet as photos } from '../functions/api/photos.ts';
import { onRequestGet as adminPhotos, onRequestDelete as remove } from '../functions/api/admin/photos.ts';
import { MAX_UPLOAD_BODY_BYTES, decodePhoto } from '../lib/photo-uploads.ts';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFEcAAAAASUVORK5CYII=';
const payload = { placeId: 123, osmIdentity: 'node:456', dataUrl: `data:image/png;base64,${png}`, caption: 'Venue terrace' };
const token = 'test-admin-token';
const request = (path, body, method = body ? 'POST' : 'GET', admin = false) => new Request(`https://motkarta.test${path}`, {
  method, headers: { 'content-type': 'application/json', ...(admin ? { 'x-motkarta-admin-token': token } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE establishments (id INTEGER PRIMARY KEY, osm_type TEXT, osm_id TEXT);
    INSERT INTO establishments VALUES (42, 'node', '456');
    CREATE TABLE place_photos (id TEXT, place_id INTEGER, url TEXT, thumbnail_url TEXT, caption TEXT, credit TEXT, width INTEGER, height INTEGER);`);
  sqlite.exec(readFileSync(new URL('../drizzle/0011_public_photo_uploads.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../drizzle/0013_photo_hero_frame.sql', import.meta.url), 'utf8'));
  const DB = { prepare(sql) {
    const statement = sqlite.prepare(sql);
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async all() { return { results: statement.all(...values) }; },
      async run() { return { meta: { changes: statement.run(...values).changes } }; },
    };
  } };
  return { env: { DB, MOTKARTA_ADMIN_TOKEN: token }, sqlite };
}

test('public upload persists bytes, appears for public and canonical Admin IDs, and deletion removes bytes', async (t) => {
  const { env, sqlite } = database(t);
  const response = await upload({ request: request('/api/photo-upload', payload), env });
  assert.equal(response.status, 201);
  const { photo } = await response.json();
  assert.equal(photo.placeId, 123);
  assert.ok(!photo.url.startsWith('data:'));
  const storedImage = await image({ request: request(photo.url), env });
  assert.equal(storedImage.headers.get('content-type'), 'image/png');
  assert.equal(storedImage.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await storedImage.arrayBuffer()), Buffer.from(png, 'base64'));
  // Independent requests have no browser/session data.
  const publicList = await photos({ request: request('/api/photos?place_id=123&osm_identity=node%3A456'), env });
  assert.equal((await publicList.json()).photos[0].id, photo.id);
  const adminList = await adminPhotos({ request: request('/api/admin/photos?place_id=42', null, 'GET', true), env });
  assert.equal((await adminList.json()).photos[0].id, photo.id);
  const deletePath = `/api/admin/photos?place_id=42&photo_id=${photo.id}`;
  assert.equal((await remove({ request: request(deletePath, null, 'DELETE'), env })).status, 401);
  assert.equal((await remove({ request: request(deletePath.replace('42', '999'), null, 'DELETE', true), env })).status, 404);
  // Scraped-photo regeneration cannot delete community images.
  sqlite.exec('DELETE FROM place_photos');
  assert.equal(sqlite.prepare('SELECT count(*) n FROM place_photo_uploads').get().n, 1);
  assert.equal((await remove({ request: request(deletePath, null, 'DELETE', true), env })).status, 200);
  assert.equal((await image({ request: request(photo.url), env })).status, 404);
  assert.deepEqual((await (await photos({ request: request('/api/photos?place_id=123&osm_identity=node%3A456'), env })).json()).photos, []);
});

test('uploads reject invalid input, unknown identities, cross-origin requests, and oversized streams', async (t) => {
  const { env, sqlite } = database(t);
  for (const body of [null, {}, { ...payload, placeId: -1 }, { ...payload, caption: 'x'.repeat(161) }, { ...payload, dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }, { ...payload, dataUrl: 'data:image/png;base64,aGVsbG8=' }]) {
    const response = await upload({ request: new Request('https://motkarta.test/api/photo-upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env });
    assert.equal(response.status, 400);
  }
  assert.equal((await upload({ request: request('/api/photo-upload', { ...payload, osmIdentity: 'way:456' }), env })).status, 404);
  const foreign = request('/api/photo-upload', payload); foreign.headers.set('origin', 'https://foreign.test');
  assert.equal((await upload({ request: foreign, env })).status, 403);
  const huge = new Request('https://motkarta.test/api/photo-upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(MAX_UPLOAD_BODY_BYTES + 1) });
  assert.equal((await upload({ request: huge, env })).status, 413);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM place_photo_uploads').get().n, 0);
});

test('daily per-venue limit is enforced by persistent SQL across requests', async (t) => {
  const { env } = database(t);
  for (let i = 0; i < 20; i++) assert.equal((await upload({ request: request('/api/photo-upload', payload), env })).status, 201);
  assert.equal((await upload({ request: request('/api/photo-upload', payload), env })).status, 429);
});

test('storage unavailable never reports success', async (t) => {
  t.mock.method(console, 'error', () => {});
  for (const env of [{}, { DB: { prepare() { throw new Error('storage failed'); } } }]) {
    assert.equal((await upload({ request: request('/api/photo-upload', payload), env })).status, 503);
  }
});

test('signature validator rejects malformed and oversized image data', () => {
  assert.ok(decodePhoto(payload.dataUrl));
  assert.equal(decodePhoto('data:image/png;base64,abcd==='), null);
  assert.equal(decodePhoto(`data:image/jpeg;base64,${Buffer.alloc(1024 * 1024 + 1).toString('base64')}`), null);
});

test('client uploads use server result only and merge persistent photos with static photos without duplication', async (t) => {
  const { uploadUserPhoto, fetchPlacePhotos } = await import('../lib/lazy-media.ts?persistent-uploads');
  const serverPhoto = { id: 'upload-test', placeId: 123, url: '/api/photo-upload?id=upload-test', thumbnailUrl: '/api/photo-upload?id=upload-test', caption: 'Terrace' };
  const staticPhoto = { id: 'static', placeId: 123, url: 'https://venue.test/photo.jpg', caption: 'Website' };
  let exists = false;
  let fail = true;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (url === '/api/photo-upload') {
      assert.equal(JSON.parse(init.body).dataUrl, payload.dataUrl);
      if (fail) return Response.json({ error: 'Unavailable' }, { status: 503 });
      exists = true;
      return Response.json({ photo: serverPhoto }, { status: 201 });
    }
    if (url === '/data/place_photos.json') return Response.json({ photosByPlace: { 123: [staticPhoto] } });
    return Response.json({ source: 'd1', photos: exists ? [serverPhoto, staticPhoto] : [staticPhoto] });
  });
  await assert.rejects(uploadUserPhoto(123, payload.dataUrl, 'Terrace'), /Unavailable/);
  assert.deepEqual(await fetchPlacePhotos(123), [staticPhoto]);
  fail = false;
  assert.deepEqual(await uploadUserPhoto(123, payload.dataUrl, 'Terrace'), serverPhoto);
  assert.deepEqual(await fetchPlacePhotos(123), [serverPhoto, staticPhoto]);
  exists = false; // Admin deletion must not linger in a module cache.
  assert.deepEqual(await fetchPlacePhotos(123), [staticPhoto]);
});
