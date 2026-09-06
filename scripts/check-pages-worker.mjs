import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Importing also rejects multipart payloads accidentally named _worker.js.
const { default: worker } = await import('../dist/_worker.js');
const routes = JSON.parse(await readFile(new URL('../dist/_routes.json', import.meta.url), 'utf8'));
const routed = (pathname) => routes.include.some((rule) => rule === pathname || (rule.endsWith('*') && pathname.startsWith(rule.slice(0, -1))));
const env = { ASSETS: { fetch: async () => new Response('test-static-asset') } };
const context = { waitUntil() {}, passThroughOnException() {} };
const request = (pathname, init = {}) => worker.fetch(new Request('https://build-check.invalid' + pathname, init), env, context);
for (const pathname of ['/', '/api/concierge', '/api/places', '/api/reviews', '/api/admin/session', '/admin']) assert.ok(routed(pathname), `${pathname} missing from worker routes`);
assert.equal(await (await request('/')).text(), 'test-static-asset');
assert.equal(await (await request('/assets/test.js')).text(), 'test-static-asset');
const malformed = await request('/api/concierge', { method: 'POST', body: '{}' });
assert.equal(malformed.status, 400);
assert.equal((await malformed.json()).error, 'invalid_request');
const crossOrigin = await request('/api/concierge', { method: 'POST', headers: { origin: 'https://other.invalid' }, body: '{"query":"coffee"}' });
assert.equal(crossOrigin.status, 403);
const unavailable = await request('/api/concierge?query=coffee');
assert.equal(unavailable.status, 503);
assert.equal((await unavailable.json()).source, 'unavailable');
const admin = await request('/api/admin/session');
assert.ok([401, 503].includes(admin.status));
assert.equal((await admin.json()).admin, false);
console.log('Compiled Pages worker passes asset, API validation, missing-D1 and admin-auth checks.');
