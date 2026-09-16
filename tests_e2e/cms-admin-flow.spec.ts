import { test, expect } from "@playwright/test";

test.describe("Admin Light CMS and Live Copy Editing Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("motkarta_preloader_seen", "true");
      window.localStorage.setItem("motkarta_onboarded", "true");
      window.sessionStorage.clear();
    });
  });

  test("unauthenticated visitors do not see edit flags; footer has Admin Light CMS trigger", async ({ page }) => {
    await page.goto("/");

    // Verify footer login button is visible
    const footerLoginBtn = page.locator('[data-testid="footer-cms-login-btn"]');
    await expect(footerLoginBtn).toBeVisible();

    // Verify edit flags are hidden
    const flagCount = await page.locator(".cms-edit-flag").count();
    expect(flagCount).toBe(0);
  });

  test("logging in via footer enables edit flags, live copy editing in SV & EN, and instant reactive updates", async ({ page }) => {
    await page.goto("/");

    // 1. Click footer login button
    const footerLoginBtn = page.locator('[data-testid="footer-cms-login-btn"]');
    await expect(footerLoginBtn).toBeVisible();
    await footerLoginBtn.click();

    // 2. Login modal should appear
    const loginModal = page.locator(".cms-login-card");
    await expect(loginModal).toBeVisible();

    // 3. Login using the passcode
    const passcodeInput = page.locator('[data-testid="cms-login-passcode-input"]');
    await passcodeInput.fill("motkarta");
    await page.locator('[data-testid="cms-login-submit-btn"]').click();

    // 4. Modal closes and edit mode is activated
    await expect(loginModal).not.toBeVisible();
    await expect(page.locator(".cms-floating-bar")).toBeVisible();

    // 5. Edit flags should now be visible across navigation, hero, method, and merch
    const methodFlag = page.locator('[data-testid="cms-flag-methodHeadingMain"]').first();
    await expect(methodFlag).toBeVisible();

    // 6. Click edit flag on method heading to open editor modal
    await methodFlag.click();

    const editorModal = page.locator(".cms-modal-card");
    await expect(editorModal).toBeVisible();

    // 7. Update both Swedish and English copy
    const inputSv = page.locator('[data-testid="cms-input-sv"]');
    const inputEn = page.locator('[data-testid="cms-input-en"]');
    await expect(inputSv).toBeVisible();
    await expect(inputEn).toBeVisible();

    await inputSv.fill("VÅR REVOLUTIONERANDE KARTMETOD 2026");
    await inputEn.fill("OUR REVOLUTIONARY MAPPING METHOD 2026");

    // 8. Save
    await page.locator('[data-testid="cms-save-btn"]').click();
    await expect(editorModal).not.toBeVisible();

    // 9. Verify Swedish heading updated immediately on the live page
    const methodHeading = page.locator("#method h2");
    await expect(methodHeading).toContainText("VÅR REVOLUTIONERANDE KARTMETOD 2026");

    // 10. Switch language to English and verify English heading updated immediately
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(100);
    const langToggleBtn = page.locator(".topbar .lang-toggle-btn");
    await langToggleBtn.click();
    await expect(methodHeading).toContainText("OUR REVOLUTIONARY MAPPING METHOD 2026");

    // 11. Verify persistence after page reload
    await page.reload();
    await expect(methodHeading).toContainText("OUR REVOLUTIONARY MAPPING METHOD 2026");
  });
});
