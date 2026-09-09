import { test, expect } from "@playwright/test";

test.describe("Mobile Rank Controls & Counter", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("motkarta_preloader_seen", "true");
      window.localStorage.setItem("motkarta_onboarded", "true");
    });
  });

  test("displays live result counter and opens VISA/SORTERA sheets", async ({ page }) => {
    await page.goto("/");

    // 1. Verify mobile header bar renders
    const headerBar = page.locator(".mobile-results-header-bar");
    await expect(headerBar).toBeVisible();

    // 2. Verify "ställen i vyn" counter is present
    const counterTitle = page.locator(".mobile-results-count");
    await expect(counterTitle).toContainText(/ställen i vyn/i);

    // 3. Test opening VISA bottom sheet
    const visaPill = page.locator(".mobile-ddl-pill", { hasText: "VISA" });
    await expect(visaPill).toBeVisible();
    await visaPill.click();

    const visaSheetTitle = page.locator(".mobile-rank-sheet-title");
    await expect(visaSheetTitle).toContainText(/VISA URVAL|SELECT SCOPE/);

    // Close VISA sheet
    const closeBtn = page.locator(".filter-sheet-close");
    await closeBtn.click();

    // 4. Test opening Formula modal
    const formulaBtn = page.locator(".mobile-formula-trigger-btn");
    await formulaBtn.click();

    const formulaTitle = page.locator(".mobile-rank-sheet-title");
    await expect(formulaTitle).toContainText(/HUR RANKAS STÄLLEN|HOW RANKING WORKS/);
  });
});
