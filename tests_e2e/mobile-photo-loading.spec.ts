import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const sourcePlace = JSON.parse(readFileSync('public/data/places.json', 'utf8')).places[0];
const places = Array.from({ length: 40 }, (_, index) => ({
  ...sourcePlace, id: 800000 + index, name: `Photo venue ${String(index).padStart(2, '0')}`,
  kind: 'Restaurant', cuisine: 'italian', tags: [], latitude: 59.33 + index * 0.0001, longitude: 18.06,
}));
const photosByPlace = Object.fromEntries(places.map((place) => [place.id, [
  { id: `broken-${place.id}`, placeId: place.id, url: `/test-media/broken-${place.id}.png`, caption: 'Broken' },
  { id: `working-${place.id}`, placeId: place.id, url: `/test-media/working-${place.id}.svg`, caption: 'Venue' },
]]));

test.use({ viewport: { width: 390, height: 844 } });

test('loads photos past result 25 on scroll and falls back from broken images', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('motkarta_preloader_seen', 'true');
    localStorage.setItem('motkarta_onboarded', 'true');
  });
  let datasetRequests = 0;
  const imageRequests: string[] = [];
  await page.route('**/data/places.json', (route) => route.fulfill({ json: { places } }));
  await page.route('**/data/place_photos.json', (route) => {
    datasetRequests++;
    return route.fulfill({ json: { photosByPlace } });
  });
  await page.route('**/test-media/**', (route) => {
    imageRequests.push(route.request().url());
    return route.request().url().includes('broken-')
      ? route.fulfill({ status: 404, body: '' })
      : route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#925229"/></svg>' });
  });
  await page.goto('/');
  await expect(page.locator('.floating-view-toggle-btn')).toBeVisible({ timeout: 10000 });
  await page.locator('.floating-view-toggle-btn').click();
  const cards = page.locator('.mobile-photo-card');
  await expect(cards).toHaveCount(40);
  const firstId = await cards.first().getAttribute('data-place-id');
  await expect(cards.first().locator('.mobile-photo-card-bg')).toHaveCSS('background-image', new RegExp(`working-${firstId}`));
  const later = cards.nth(30);
  const laterId = await later.getAttribute('data-place-id');
  expect(imageRequests.some((url) => url.includes(`working-${laterId}`))).toBe(false);
  await later.scrollIntoViewIfNeeded();
  await expect(later.locator('.mobile-photo-card-bg')).toHaveCSS('background-image', new RegExp(`working-${laterId}`));
  expect(datasetRequests).toBe(1);
  await later.screenshot({ path: testInfo.outputPath("loaded-card-after-25.png") });
  // Opening a card uses the working photo; returning to the map uses the slide-up card.
  await later.locator('h2').click();
  await expect(page.locator('.place-detail-hero-photo')).toHaveAttribute('src', new RegExp(`working-${laterId}`));
  await page.locator('.place-detail-primary-cta').click();
  await expect(page.locator('article.map-card')).toBeHidden();
  const slideUp = page.locator('.mobile-place-slide-up');
  await expect(slideUp).toBeVisible();
  await expect(slideUp).toContainText(`Photo venue ${String(Number(laterId) - 800000).padStart(2, '0')}`);
  await slideUp.screenshot({ path: testInfo.outputPath('mobile-map-slide-up.png') });
});
