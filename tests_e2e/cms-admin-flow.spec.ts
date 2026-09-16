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
    await page.locator(".topbar .lang-toggle-btn").dispatchEvent("click");
    await expect(methodHeading).toContainText("OUR REVOLUTIONARY MAPPING METHOD 2026");

    // 11. Verify persistence after page reload
    await page.reload();
    await expect(methodHeading).toContainText("OUR REVOLUTIONARY MAPPING METHOD 2026");
  });

  test("admin can add and remove merch product cards with instant reactivity and persistence", async ({ page }) => {
    // Enable dialog auto-accept for delete confirmation
    page.on("dialog", (dialog) => dialog.accept());

    // Pre-authenticate CMS
    await page.addInitScript(() => {
      window.localStorage.setItem("motkarta_cms_auth", "true");
      window.localStorage.setItem("motkarta_cms_edit_mode", "true");
    });

    await page.goto("/");

    // 1. Verify admin merch toolbar is visible
    const merchAdminBar = page.locator(".cms-merch-admin-bar");
    await expect(merchAdminBar).toBeVisible();

    // 2. Open Add Product Modal
    const addProductBtn = page.locator('[data-testid="cms-add-product-btn"]');
    await expect(addProductBtn).toBeVisible();
    await addProductBtn.click();

    const productModal = page.locator(".cms-product-modal-card");
    await expect(productModal).toBeVisible();

    // 3. Fill product form fields
    await page.locator('[data-testid="cms-input-product-name-sv"]').fill("Egen Motkarta Hoodie");
    await page.locator('[data-testid="cms-input-product-name-en"]').fill("Custom Motkarta Hoodie");
    await page.locator('[data-testid="cms-input-product-price-sek"]').fill("750");

    // 4. Submit product
    await page.locator('[data-testid="cms-add-product-submit-btn"]').click();
    await expect(productModal).not.toBeVisible();

    // 5. Verify the new product appears in the merch grid with title and price
    const merchSection = page.locator("#merch");
    await expect(merchSection).toContainText("Egen Motkarta Hoodie");
    await expect(merchSection).toContainText("750 SEK");

    // 6. Delete a product card (e.g. the stickers-pack)
    const stickersCard = page.locator('[data-testid="merch-card-stickers-pack"]');
    await expect(stickersCard).toBeVisible();
    const deleteStickersBtn = page.locator('[data-testid="cms-delete-product-stickers-pack"]');
    await deleteStickersBtn.click();

    // 7. Verify stickers card is removed
    await expect(stickersCard).not.toBeVisible();

    // 8. Reload page and verify persistence of added item and deleted item
    await page.reload();
    await expect(page.locator("#merch")).toContainText("Egen Motkarta Hoodie");
    await expect(page.locator('[data-testid="merch-card-stickers-pack"]')).not.toBeVisible();

    // 9. Reset products to defaults
    const resetBtn = page.locator('[data-testid="cms-reset-products-btn"]');
    await resetBtn.click();

    // 10. Verify standard items are restored
    await expect(page.locator('[data-testid="merch-card-stickers-pack"]')).toBeVisible();
  });
});

