import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const seed = JSON.parse(readFileSync('public/data/places.json', 'utf8')).places[0];

test('venue card displays explicit price symbols and free Wi-Fi without inventing unknown prices', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'The large map card is desktop-only.');
  let price: string | undefined = '$$$$';
  await page.addInitScript(() => {
    localStorage.setItem('motkarta_preloader_seen', 'true');
    localStorage.setItem('motkarta_onboarded', 'true');
  });
  await page.route('**/api/place-visibility', route => route.fulfill({ json: { blocked: [] } }));
  await page.route('**/data/places.json', route => route.fulfill({ json: { source: 'osm', places: [{ ...seed, priceSEK: price, priceLevel: 2, tags: ['Wi-Fi', 'Free Wi-Fi'] }] } }));
  const open = async () => {
    await page.goto('/');
    const marker = page.locator('.leaflet-marker-icon').first();
    await marker.waitFor({ state: 'attached' });
    await marker.dispatchEvent('click');
    await expect(page.locator('article.map-card')).toBeVisible();
  };
  await open();
  await expect(page.locator('article.map-card').getByText('$$$$', { exact: true })).toBeVisible();
  await expect(page.locator('article.map-card').getByText('Free Wi-Fi', { exact: true })).toBeAttached();
  await expect(page.locator('article.map-card')).not.toContainText('$$$$ SEK');
  await page.screenshot({ path: testInfo.outputPath('sourced-price-wifi.png') });
  price = undefined;
  await open();
  await expect(page.locator('article.map-card [title^="Prisnivå"], article.map-card [title^="Price tier"]')).toHaveCount(0);
});
