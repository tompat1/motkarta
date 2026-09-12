import { test, expect } from "@playwright/test";

test.describe("Sync Devices Real QR Code & Favorites URL Flow", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("motkarta_preloader_seen", "true");
      window.localStorage.setItem("motkarta_onboarded", "true");
    });
  });

  test("renders real scannable QR code pointing to https://motkarta.rynell.org/ when places are saved", async ({
    page,
  }) => {
    // Seed localStorage with saved places
    await page.addInitScript(() => {
      window.localStorage.setItem("motkarta_saved_places", JSON.stringify([1, 3, 14]));
    });

    await page.goto("/");

    // Open SyncDevicesModal via quick-filter-pill
    const syncBtn = page.locator(".quick-filter-pill", { hasText: /synka|sync/i }).first();
    await expect(syncBtn).toBeVisible();
    await syncBtn.click();

    // Verify modal and QR code wrapper exist
    const modalTitle = page.locator(".sync-modal-title");
    await expect(modalTitle).toBeVisible();

    const qrWrapper = page.locator(".sync-qr-code-wrapper svg");
    await expect(qrWrapper).toBeVisible();

    // Verify canonical URL badge points to https://motkarta.rynell.org/
    const urlBadge = page.locator(".sync-qr-url-badge");
    await expect(urlBadge).toBeVisible();
    await expect(urlBadge).toContainText("https://motkarta.rynell.org");
    await expect(urlBadge).toContainText("places=");

    // Verify copy link button
    const copyBtn = page.locator(".sync-copy-btn");
    await expect(copyBtn).toBeVisible();

    await page.screenshot({
      path: "/Users/thomasrynell/.gemini/antigravity-ide/brain/72a70bf3-d6b1-4a28-a1fb-a71bcfa751db/sync_modal_real_qr.png",
    });
  });

  test("importing favorites via URL parameter displays sync toast and merges saved places", async ({
    page,
  }) => {
    // Seed initial place in localStorage
    await page.addInitScript(() => {
      window.localStorage.setItem("motkarta_saved_places", JSON.stringify([99]));
    });

    // Navigate with direct places query parameter as if scanned from QR code
    await page.goto("/?places=1,3,14");

    // Verify sync toast appears with confirmation
    const toast = page.locator(".sync-toast-banner");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(/sparade|saved/i);

    await page.screenshot({
      path: "/Users/thomasrynell/.gemini/antigravity-ide/brain/72a70bf3-d6b1-4a28-a1fb-a71bcfa751db/sync_toast_banner.png",
    });

    // Verify URL parameters are cleaned up
    await expect(page).not.toHaveURL(/places=/);

    // Verify merged saved places in localStorage
    const savedInStorage = await page.evaluate(() => {
      return JSON.parse(window.localStorage.getItem("motkarta_saved_places") || "[]");
    });
    expect(savedInStorage).toContain(1);
    expect(savedInStorage).toContain(3);
    expect(savedInStorage).toContain(14);
    expect(savedInStorage).toContain(99);

    // Click "Visa sparade ★" button in toast
    const filterBtn = toast.locator(".sync-toast-action-btn");
    await expect(filterBtn).toBeVisible();
    await filterBtn.click();

    // Toast should dismiss
    await expect(toast).not.toBeVisible();
  });
});
