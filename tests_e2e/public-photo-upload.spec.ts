import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const source = JSON.parse(readFileSync('public/data/places.json', 'utf8')).places[0];
const place = { ...source, id: 800001, name: 'Upload test venue', kind: 'Restaurant', tags: [], osmIdentity: 'node:456' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFEcAAAAASUVORK5CYII=', 'base64');
const photo = { id: 'upload-test', placeId: place.id, url: '/api/photo-upload?id=upload-test', thumbnailUrl: '/api/photo-upload?id=upload-test', caption: 'My photo' };

async function openCard(page: Page) {
  await page.goto('/');
  const marker = page.locator('.leaflet-marker-icon').first();
  await marker.waitFor({ state: 'attached' });
  await marker.dispatchEvent('click');
  await expect(page.locator('article.map-card')).toBeVisible();
}

test('map upload waits for server, supports retry, and survives a fresh browser session', async ({ page, context, browser }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'Map-card photo uploads are desktop-only.');
  let saved = false;
  let attempts = 0;
  let submittedData: Record<string, unknown> | null = null;
  const configure = async (target: typeof context) => {
    await target.addInitScript(() => {
      localStorage.setItem('motkarta_preloader_seen', 'true');
      localStorage.setItem('motkarta_onboarded', 'true');
    });
    await target.route('**/data/places.json', route => route.fulfill({ json: { places: [place] } }));
    await target.route('**/api/place-visibility', route => route.fulfill({ json: { blocked: [] } }));
    await target.route('**/data/place_photos.json', route => route.fulfill({ json: { photosByPlace: { [place.id]: [{ ...photo, id: 'website', url: '/test-website.png', thumbnailUrl: '/test-website.png' }] } } }));
    await target.route('**/test-website.png', route => route.fulfill({ contentType: 'image/png', body: png }));
    await target.route('**/api/photos?*', route => route.fulfill({ json: { source: 'd1', photos: saved ? [photo] : [] } }));
    await target.route('**/api/photo-upload*', async route => {
      if (route.request().method() === 'POST') {
        attempts++;
        submittedData = route.request().postDataJSON();
        if (attempts === 1) return route.fulfill({ status: 503, json: { error: 'Storage unavailable' } });
        saved = true;
        return route.fulfill({ status: 201, json: { photo } });
      }
      return route.fulfill({ contentType: 'image/png', body: png });
    });
  };
  await configure(context);
  await openCard(page);
  await page.locator('.map-card-add-photo-btn').click();
  const dialog = page.locator('.user-photo-upload-modal');
  await dialog.locator('input[type=file]').setInputFiles({ name: 'terrace.png', mimeType: 'image/png', buffer: png });
  await expect(dialog.locator('.user-photo-upload-preview')).toBeVisible();
  await dialog.locator('.user-photo-upload-submit').click();
  await expect(dialog.locator('[role=alert]')).toBeVisible();
  await expect(dialog.locator('[role=status]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('motkarta_user_photos'))).toBeNull();
  await dialog.locator('.user-photo-upload-submit').click();
  await expect(dialog.locator('[role=status]')).toBeVisible();
  await expect(page.locator('.map-card-hero-photo')).toHaveAttribute('src', photo.url);
  expect(submittedData).toMatchObject({ placeId: place.id, osmIdentity: place.osmIdentity });
  expect(await page.evaluate(() => localStorage.getItem('motkarta_user_photos'))).toBeNull();
  await expect(dialog).toBeHidden();
  await page.locator('article.map-card').screenshot({ path: testInfo.outputPath('persisted-upload.png') });

  const freshContext = await browser.newContext();
  try {
    await configure(freshContext);
    const freshPage = await freshContext.newPage();
    await openCard(freshPage);
    await expect(freshPage.locator('.map-card-hero-photo')).toHaveAttribute('src', photo.url);
    // Simulate Admin deleting the row: reopening must not restore it from static/local caches.
    saved = false;
    await openCard(freshPage);
    await expect(freshPage.locator('.map-card-hero-photo')).toHaveAttribute('src', '/test-website.png');
  } finally {
    await freshContext.close();
  }
});
