import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocationRequester, locationFailureMessage } from '../src/app/geolocation.ts';

test('concurrent location consumers share one browser request', async () => {
  let success, calls = 0, options;
  const request = createLocationRequester(() => ({ getCurrentPosition: (ok, _fail, opts) => { success = ok; calls++; options = opts; } }));
  const map = request(), concierge = request();
  assert.equal(map, concierge); assert.equal(calls, 1);
  assert.deepEqual(options, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  success({ coords: { latitude: 59.31, longitude: 18.06 } });
  assert.deepEqual(await map, { status: 'acquired', location: { latitude: 59.31, longitude: 18.06 } });
});

test('timeout, denial and unavailable responses remain distinct and allow explicit retry', async () => {
  let calls = 0;
  const request = createLocationRequester(() => ({ getCurrentPosition: (_ok, fail) => { calls++; fail({ code: calls === 1 ? 3 : 1 }); } }));
  assert.deepEqual(await request(), { status: 'timeout' });
  assert.equal(calls, 1); // No automatic retry.
  assert.deepEqual(await request(), { status: 'denied' });
  assert.deepEqual(await createLocationRequester(() => undefined)(), { status: 'unsupported' });
  assert.deepEqual(await createLocationRequester(() => { throw new Error('unavailable'); })(), { status: 'unavailable' });
  assert.match(locationFailureMessage('timeout', 'sv'), /lång tid/);
  assert.doesNotMatch(locationFailureMessage('timeout', 'en'), /blocked|allow/i);
});

test('client deadline bounds unresponsive browser requests and ignores late callbacks', async () => {
  const callbacks = [];
  const request = createLocationRequester(() => ({ getCurrentPosition: (ok) => callbacks.push(ok) }), 5);
  assert.deepEqual(await request(), { status: 'timeout' });
  const retry = request();
  callbacks[0]({ coords: { latitude: 0, longitude: 0 } });
  callbacks[1]({ coords: { latitude: 59.31, longitude: 18.06 } });
  assert.deepEqual(await retry, { status: 'acquired', location: { latitude: 59.31, longitude: 18.06 } });
});

test('invalid browser coordinate responses cannot become a user location', async () => {
  const request = createLocationRequester(() => ({ getCurrentPosition: (ok) => ok({ coords: { latitude: NaN, longitude: 18 } }) }));
  assert.deepEqual(await request(), { status: 'unavailable' });
});
