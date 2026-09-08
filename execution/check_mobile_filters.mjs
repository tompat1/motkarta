// Run against a local dev server: node execution/check_mobile_filters.mjs [URL]
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const output = '.tmp/mobile-filter-parity';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Keep the check local; map tiles and remote images are unnecessary for filtering.
  await page.route(/^https?:\/\//, (route) => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5174', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Skip intro', exact: true }).click();
  const onboarding = page.getByRole('button', { name: 'Close onboarding', exact: true });
  if (await onboarding.isVisible()) await onboarding.click();
  await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
  const types = page.locator('.mobile-type-filters');
  const desktopTypes = page.locator('.controls .chips:not(.cuisine-chips):not(.feature-chips) .chip-row');
  const openFilters = page.locator('.mobile-filter-actions button[aria-haspopup="dialog"]');
  const dialog = page.getByRole('dialog', { name: 'Cuisine', exact: true });
  const count = async () => Number((await page.locator('.filter-apply-btn').innerText()).match(/\d+/)[0]);
  const labels = ['All places', 'Saved ★', '⚡ Latest added', 'Restaurant', 'Bakery', 'Café', 'Specialty coffee'];
  assert.deepEqual(await types.getByRole('button').allTextContents(), labels);
  assert.deepEqual(await desktopTypes.locator('button').allTextContents(), labels);
  await openFilters.click();
  await page.waitForFunction(() => Number(document.querySelector('.filter-apply-btn')?.textContent?.match(/\d+/)?.[0]) > 0);
  const allCount = await count();
  const mobileCuisines = await dialog.locator('.filter-sheet-grid button').allTextContents();
  assert.deepEqual(mobileCuisines, await page.locator('.cuisine-chips button').allTextContents());
  assert.equal(await dialog.getByRole('button', { name: /Open now|Batch Brew|Hand Brew|Laptop/ }).count(), 0);
  await page.keyboard.press('Escape');
  assert.equal(await openFilters.evaluate((el) => el === document.activeElement), true);
  const typeCounts = {};
  for (const label of labels.slice(2)) {
    await types.getByRole('button', { name: label, exact: true }).click();
    assert.equal(await desktopTypes.getByRole('button', { name: label, exact: true, includeHidden: true }).getAttribute('aria-pressed'), 'true');
    await openFilters.click();
    typeCounts[label] = await count();
    assert.ok(typeCounts[label] > 0 && typeCounts[label] < allCount, `${label} filters the catalog`);
    await page.keyboard.press('Escape');
  }
  await types.getByRole('button', { name: 'Restaurant', exact: true }).click();
  await openFilters.click();
  await dialog.getByRole('button', { name: 'Pizza', exact: true }).click();
  const pizzaCount = await count();
  assert.ok(pizzaCount > 0 && pizzaCount < typeCounts.Restaurant);
  assert.equal(await page.locator('.quick-filter-badge').innerText(), '2');
  await page.screenshot({ path: `${output}/cuisines-en.png` });
  // Focus cycles inside the modal, including backwards from its initial focus.
  await dialog.focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.locator('.filter-apply-btn').evaluate((el) => el === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.filter-sheet-close').evaluate((el) => el === document.activeElement), true);
  await page.locator('.filter-apply-btn').click();
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.equal(await page.locator('.cuisine-chips').getByRole('button', { name: 'Pizza', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.locator('.cuisine-chips').getByRole('button', { name: 'Italian', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await openFilters.click();
  assert.equal(await dialog.getByRole('button', { name: 'Italian', exact: true }).getAttribute('aria-pressed'), 'true');
  await dialog.getByRole('button', { name: 'Reset all filters', exact: true }).click();
  assert.equal(await count(), allCount);
  assert.equal(await dialog.getByRole('button', { name: 'Reset all filters', exact: true }).isDisabled(), true);
  await page.keyboard.press('Escape');
  await types.getByRole('button', { name: 'Saved ★', exact: true }).click();
  await openFilters.click();
  assert.equal(await count(), 0);
  await page.keyboard.press('Escape');
  await types.getByRole('button', { name: 'Café', exact: true }).click();
  await openFilters.click();
  assert.equal(await count(), typeCounts['Café'], 'Saved must not remain a hidden restriction');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Byt till svenska', exact: true }).click();
  await page.screenshot({ path: `${output}/types-sv.png` });
  await openFilters.click();
  assert.equal(await page.getByRole('dialog', { name: 'Kök', exact: true }).count(), 1);
  assert.equal(await count(), typeCounts['Café']);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 640 });
    const bounds = await page.locator('.filter-sheet-content').boundingBox();
    const footer = await page.locator('.filter-sheet-footer').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    assert.ok(footer.y + footer.height <= 641, JSON.stringify({ width, bounds, footer }));
    assert.equal(await page.locator('.filter-sheet-content').evaluate((el) => el.scrollWidth <= el.clientWidth), true);
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await page.screenshot({ path: `${output}/cuisines-320-sv.png` });
  await page.keyboard.press('Escape');
  assert.equal(await types.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
  await page.screenshot({ path: `${output}/types-320-sv.png` });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', allCount, typeCounts, pizzaCount, cuisineOptions: mobileCuisines.length, screenshots: output }, null, 2));
} finally {
  await browser.close();
}
