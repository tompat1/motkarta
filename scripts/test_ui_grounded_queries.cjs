const { chromium } = require("@playwright/test");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  await context.addInitScript(() => {
    window.localStorage.setItem("motkarta_preloader_seen", "true");
    window.localStorage.setItem("motkarta_onboarded", "true");
  });

  const page = await context.newPage();

  console.log("=== 1. Testing 'bästa pizza i stan' ===");
  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });

  const search = page.locator("#desktop-discovery-search");
  await search.fill("bästa pizza i stan");
  const askBtn = page.locator("button", { hasText: /FRÅGA CONCIERGE/i }).last();
  await askBtn.click();
  await page.waitForTimeout(2000);

  const answer1 = await page.locator("#concierge-answer").first().innerText();
  console.log("Answer 1:\n", answer1);

  const chips1 = await page.locator("#concierge-answer .concierge-follow-up-chips button").allInnerTexts();
  console.log("Follow-up chips 1:", chips1);

  // Get first 5 visible place names in the list
  const places1 = await page.locator(".place-card h3").allInnerTexts();
  const topPlaces1 = places1.slice(0, 5);
  console.log("Top place cards (Batch 1):", topPlaces1);

  await page.screenshot({ path: "/Users/thomasrynell/.gemini/antigravity/brain/3e0607fd-1603-45dc-9c42-cc925028b299/test_pizza_batch1.png" });

  console.log("\n=== 2. Testing follow-up 'Fler förslag' (visa fler) ===");
  const flerBtn = page.locator("#concierge-answer .concierge-follow-up-chips button", { hasText: /Fler förslag/i }).first();
  await flerBtn.click();
  await page.waitForTimeout(2000);

  const answer2 = await page.locator("#concierge-answer").first().innerText();
  console.log("Answer 2 (after Fler förslag):\n", answer2);

  const places2 = await page.locator(".place-card h3").allInnerTexts();
  const topPlaces2 = places2.slice(0, 5);
  console.log("Top place cards (Batch 2):", topPlaces2);

  const overlap = topPlaces1.filter(p => topPlaces2.includes(p));
  console.log("Overlap between Batch 1 and Batch 2:", overlap);

  await page.screenshot({ path: "/Users/thomasrynell/.gemini/antigravity/brain/3e0607fd-1603-45dc-9c42-cc925028b299/test_pizza_batch2.png" });

  console.log("\n=== 3. Testing 'Specialkaffe i Vasastan' ===");
  await search.fill("Specialkaffe i Vasastan");
  await askBtn.click();
  await page.waitForTimeout(2000);

  const answer3 = await page.locator("#concierge-answer").first().innerText();
  console.log("Answer 3:\n", answer3);

  const chips3 = await page.locator("#concierge-answer .concierge-follow-up-chips button").allInnerTexts();
  console.log("Follow-up chips 3:", chips3);

  const places3 = await page.locator(".place-card h3").allInnerTexts();
  console.log("Specialty coffee places in Vasastan:", places3.slice(0, 5));

  await page.screenshot({ path: "/Users/thomasrynell/.gemini/antigravity/brain/3e0607fd-1603-45dc-9c42-cc925028b299/test_specialty_vasastan.png" });

  console.log("\n=== 4. Testing 'specialty coffee och kardemummabulle på Södermalm' ===");
  await search.fill("specialty coffee och kardemummabulle på Södermalm");
  await askBtn.click();
  await page.waitForTimeout(2000);

  const chips4 = await page.locator("#concierge-answer .concierge-follow-up-chips button").allInnerTexts();
  console.log("Follow-up chips 4 (adaptive district check):", chips4);

  await page.screenshot({ path: "/Users/thomasrynell/.gemini/antigravity/brain/3e0607fd-1603-45dc-9c42-cc925028b299/test_specialty_sodermalm_chips.png" });

  await browser.close();
  console.log("\nAll queries tested successfully!");
})();
