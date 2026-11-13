import { test, expect } from "@playwright/test";

test.describe("Mobile Rank Controls & Counter", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("motkarta_preloader_seen", "true");
      window.localStorage.setItem("motkarta_onboarded", "true");
    });
  });

  test("displays live result counter in bottom sheet and opens VISA/SORTERA & Formula sheets", async ({ page }) => {
    await page.goto("/");

    // 1. Verify mobile bottom sheet peek bar renders
    const headerBar = page.locator(".mobile-results-header-bar");
    await expect(headerBar).toBeVisible();

    // 2. Verify counter is present in collapsed peek bar ("X ställen (Visa lista)")
    const counterTitle = page.locator(".mobile-results-count");
    await expect(counterTitle).toContainText(/ställen|places|i listan/i);

    // 3. Expand bottom sheet to access VISA / SORTERA pills
    const peekBtn = page.locator(".floating-view-toggle-btn");
    await peekBtn.click();

    const visaPill = page.locator(".mobile-ddl-pill", { hasText: "VISA" });
    await expect(visaPill).toBeVisible();
    await visaPill.click();

    const visaSheetTitle = page.locator(".mobile-rank-sheet-title");
    await expect(visaSheetTitle).toContainText(/VISA URVAL|SELECT SCOPE/);

    // Close VISA sheet
    const closeBtn = page.locator(".filter-sheet-close");
    await closeBtn.click();

    // 4. Test opening Formula modal from inside the Hamburger Menu (Zone 1)
    const hamburgerBtn = page.locator(".mobile-hamburger-btn");
    await expect(hamburgerBtn).toBeVisible();
    await hamburgerBtn.click();

    const formulaBtn = page.locator(".mobile-menu-drawer .mobile-formula-trigger-btn");
    await expect(formulaBtn).toBeVisible();
    await formulaBtn.click();

    const formulaTitle = page.locator(".mobile-rank-sheet-title");
    await expect(formulaTitle).toContainText(/HUR RANKAS STÄLLEN|HOW RANKING WORKS/);
  });
});
