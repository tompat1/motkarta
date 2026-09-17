import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as login } from '../functions/api/admin/login.ts';
import { fetchAdminSession } from '../lib/admin-session-client.ts';
import { getAdminSession } from '../lib/admin-auth.ts';

const team = 'https://login-test.cloudflareaccess.com';
const audience = 'cms-audience';
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'cms-test-key' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
async function jwt(overrides = {}) {
  const header = encode({ alg: 'RS256', kid: jwk.kid });
  const body = encode({ iss: team, aud: [audience], email: 'owner@example.test', exp: Math.floor(Date.now() / 1000) + 60, ...overrides });
  const data = `${header}.${body}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(data));
  return `${data}.${Buffer.from(signature).toString('base64url')}`;
}
const env = { MOTKARTA_ACCESS_TEAM_DOMAIN: team, MOTKARTA_ACCESS_AUD: audience, MOTKARTA_ADMIN_EMAILS: 'owner@example.test' };
const request = token => new Request('https://motkarta.test/api/admin/login?return_to=https://attacker.test', { headers: { cookie: `CF_Authorization=${token}` } });

test('Cloudflare login verifies a signed session and returns to the fixed CMS location', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url, `${team}/cdn-cgi/access/certs`);
    return Response.json({ keys: [jwk] });
  });
  const response = await login({ request: request(await jwt()), env });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://motkarta.test/?cms_login=success');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('Cloudflare login rejects unconfigured, expired, wrong issuer/audience, tampered and non-allowlisted sessions', async () => {
  for (const overrides of [ { exp: 0 }, { exp: undefined }, { iss: undefined }, { iss: 'https://other.cloudflareaccess.com' }, { aud: 'other' }, { email: 'other@example.test' } ]) {
    const response = await login({ request: request(await jwt(overrides)), env });
    assert.equal(response.headers.get('location'), 'https://motkarta.test/?cms_login=failed');
  }
  const valid = await jwt();
  const parts = valid.split('.');
  parts[1] = encode({ iss: team, aud: audience, email: 'owner@example.test', exp: Math.floor(Date.now() / 1000) + 9999 });
  assert.equal((await getAdminSession(request(parts.join('.')), env)).admin, false);
  assert.equal((await getAdminSession(request(`${valid}.extra`), env)).admin, false);
  assert.equal((await getAdminSession(request('%broken-cookie'), env)).admin, false);
  assert.equal((await login({ request: request(valid), env: {} })).headers.get('location'), 'https://motkarta.test/?cms_login=failed');
});

test('CMS client trusts only successful server authorization and preserves token case', async t => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, '/api/admin/session');
    assert.equal(init.headers['x-motkarta-admin-token'], 'CaseSensitiveToken');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.cache, 'no-store');
    return Response.json({ admin: true, authMode: 'token' });
  });
  assert.equal((await fetchAdminSession('CaseSensitiveToken')).admin, true);
});

test('CMS client rejects unauthorized, malformed and redirected responses', async t => {
  for (const response of [Response.json({ admin: true }, { status: 401 }), Response.json({ admin: false }), new Response('<html>Cloudflare login</html>'), new Response(null, { status: 302, headers: { location: 'https://login.test' } })]) {
    t.mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(fetchAdminSession('motkarta'));
  }
});
