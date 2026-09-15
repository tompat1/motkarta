import test from 'node:test';
import assert from 'node:assert/strict';
import { firstAvailablePhoto, canLoadPhoto } from '../lib/photo-loading.ts';

const photo = (url, thumbnailUrl = url) => ({ id: url, placeId: 1, url, thumbnailUrl, caption: 'Venue' });

test('photo fallback skips broken URLs, avoids duplicate probes, and tries thumbnails', async (t) => {
  const requests = [];
  const previous = globalThis.Image;
  globalThis.Image = class {
    set src(url) {
      if (!url) return;
      requests.push(url);
      queueMicrotask(() => url === 'working-thumb' ? this.onload?.() : this.onerror?.());
    }
  };
  t.after(() => { globalThis.Image = previous; });
  const result = await firstAvailablePhoto([
    photo('broken'), photo('broken'), photo('second', 'working-thumb'), photo('unneeded'),
  ], new AbortController().signal);
  assert.equal(result.url, 'working-thumb');
  assert.deepEqual(requests, ['broken', 'second', 'working-thumb']);
});

test('photo timeouts and cancellation settle without hanging or returning stale photos', async (t) => {
  const previous = globalThis.Image;
  globalThis.Image = class { set src(_) {} };
  t.after(() => { globalThis.Image = previous; });
  assert.equal(await canLoadPhoto('hung', new AbortController().signal, 5), false);
  const controller = new AbortController();
  const pending = firstAvailablePhoto([photo('hung')], controller.signal);
  controller.abort();
  assert.equal(await pending, null);
});

test('concurrent photo requests share dataset loading and failures remain retryable', async (t) => {
  const { fetchPlacePhotos } = await import('../lib/lazy-media.ts?photo-loading-test');
  let staticRequests = 0;
  let fail = true;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url) === '/data/place_photos.json') {
      staticRequests++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (fail) throw new Error('temporary offline');
      return Response.json({ photosByPlace: { 90001: [photo('https://venue.se/one.jpg')], 90002: [photo('https://venue.se/two.jpg')] } });
    }
    return new Response('', { status: 503 });
  });
  assert.deepEqual(await Promise.all([fetchPlacePhotos(90001), fetchPlacePhotos(90002)]), [[], []]);
  assert.equal(staticRequests, 1);
  fail = false;
  const photos = await Promise.all([fetchPlacePhotos(90001), fetchPlacePhotos(90001), fetchPlacePhotos(90002)]);
  assert.equal(staticRequests, 2);
  assert.ok(photos.every((items) => items.length === 1));
});
