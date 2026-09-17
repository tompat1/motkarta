import { test, expect } from "@playwright/test";

test.describe("Admin Light CMS and Live Copy Editing Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("motkarta_preloader_seen", "true");
      window.localStorage.setItem("motkarta_onboarded", "true");
    });
    await page.route("**/api/admin/session", route => route.fulfill({ status: 401, json: { admin: false } }));
  });

  test("unauthenticated visitors do not see edit flags or footer login button", async ({ page }) => {
    await page.goto("/");

    // Verify footer login button is not visible
    const footerLoginBtn = page.locator('[data-testid="footer-cms-login-btn"]');
    await expect(footerLoginBtn).toHaveCount(0);

    // Verify edit flags are hidden
    const flagCount = await page.locator(".cms-edit-flag").count();
    expect(flagCount).toBe(0);
  });

  test("navigating to /cms triggers Admin Light CMS login, enables edit flags, live copy editing in SV & EN, and instant reactive updates", async ({ page }) => {
    // 1. Navigate to /cms route
    await page.goto("/cms");

    // 2. Login modal should appear
    const loginModal = page.locator(".cms-login-card");
    await expect(loginModal).toBeVisible();

    // The server validates the exact token; a client-side password is insufficient.
    await page.route("**/api/admin/session", route => {
      const valid = route.request().headers()["x-motkarta-admin-token"] === "test-admin-token";
      return route.fulfill({ status: valid ? 200 : 401, json: { admin: valid, authMode: valid ? "token" : "none" } });
    });
    // 3. Login using the configured token
    const passcodeInput = page.locator('[data-testid="cms-login-passcode-input"]');
    await passcodeInput.fill("test-admin-token");
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

    // 12. Verify new editorial hero and header edit flags exist
    await expect(page.locator('[data-testid="cms-flag-heroTitle"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="cms-flag-heroKicker"]').first()).toBeVisible();

    // 13. Test logout from floating CMS bar
    const logoutBtn = page.locator('[data-testid="cms-floating-logout-btn"]');
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();
    await expect(page.locator(".cms-floating-bar")).toHaveCount(0);
    await expect(page.locator(".cms-edit-flag")).toHaveCount(0);
  });

  test("admin can add and remove merch product cards with instant reactivity and persistence", async ({ page }) => {
    // Enable dialog auto-accept for delete confirmation
    page.on("dialog", (dialog) => dialog.accept());

    // A verified server session authorizes editing; localStorage only remembers edit mode.
    await page.route("**/api/admin/session", route => route.fulfill({ json: { admin: true, authMode: "access_jwt", email: "editor@example.test" } }));
    await page.addInitScript(() => {
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


test("CMS ignores forged local auth and demo passwords, and exposes Cloudflare login", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("motkarta_preloader_seen", "true");
    localStorage.setItem("motkarta_onboarded", "true");
    localStorage.setItem("motkarta_cms_auth", "true");
    localStorage.setItem("motkarta_cms_edit_mode", "true");
    sessionStorage.setItem("motkarta_admin_token", "forged");
  });
  await page.route("**/api/admin/session", route => route.fulfill({ status: 401, json: { admin: false } }));
  await page.goto("/cms");
  await expect(page.locator(".cms-edit-flag")).toHaveCount(0);
  const loginModal = page.locator(".cms-login-card");
  await expect(loginModal).toBeVisible();
  await expect(page.getByTestId("cms-quick-login-btn")).toHaveCount(0);
  await page.getByTestId("cms-login-passcode-input").fill("motkarta");
  await page.getByTestId("cms-login-submit-btn").click();
  await expect(page.locator(".cms-login-card [role=alert]")).toBeVisible();
  await expect(page.locator(".cms-edit-flag")).toHaveCount(0);
  await page.route("**/api/admin/login", route => route.fulfill({ contentType: "text/html", body: "Cloudflare sign-in fixture" }));
  await page.getByTestId("cms-cloudflare-login-btn").click();
  await expect(page).toHaveURL(/\/api\/admin\/login$/);
});

test("verified Cloudflare return enables editing and expired sessions do not restore it", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem("motkarta_preloader_seen", "true");
    localStorage.setItem("motkarta_onboarded", "true");
  });
  let authenticated = true;
  await page.route("**/api/admin/session", route => route.fulfill({ status: authenticated ? 200 : 401, json: { admin: authenticated, authMode: "access_jwt" } }));
  await page.goto("/?cms_login=success");
  await expect(page.locator(".cms-floating-bar")).toBeVisible();
  await expect(page).not.toHaveURL(/cms_login/);
  authenticated = false;
  await page.reload();
  await expect(page.getByTestId("footer-cms-login-btn")).toHaveCount(0);
  await expect(page.locator(".cms-edit-flag")).toHaveCount(0);
  await page.goto("/cms");
  await expect(page.locator(".cms-login-card")).toBeVisible();
  await page.locator(".cms-login-card").screenshot({ path: testInfo.outputPath("cloudflare-cms-login.png") });
});
