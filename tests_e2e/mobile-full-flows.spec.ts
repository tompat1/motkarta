import { test, expect } from "@playwright/test";

test.describe("Mobile Full User Flows", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("motkarta_preloader_seen", "true");
      window.localStorage.setItem("motkarta_onboarded", "true");
    });
  });

  test("1. Initial mobile page render", async ({ page }) => {
    await page.goto("/");

    // Verify main brand logo / nav elements
    const logo = page.locator("header .brand-logo");
    await expect(logo).toBeVisible();

    // Verify search bar is visible
    const searchInput = page.locator('input[aria-label*="Sök"], input[aria-label*="Search"]');
    await expect(searchInput).toBeVisible();

    // Verify workspace mobile header controls bar
    const mobileHeaderBar = page.locator(".mobile-results-header-bar");
    await expect(mobileHeaderBar).toBeVisible();

    // Verify counter heading
    const counter = page.locator(".mobile-results-count");
    await expect(counter).toContainText(/ställen i vyn/i);
  });

  test("2. Mobile search flow & clear query", async ({ page }) => {
    await page.goto("/");

    const searchInput = page.locator('input[aria-label*="Sök"], input[aria-label*="Search"]');
    await searchInput.focus();
    await searchInput.fill("Solkant");

    // Verify search clear button appears
    const clearBtn = page.locator(".search-clear-btn");
    await expect(clearBtn).toBeVisible();

    // Clear search
    await clearBtn.click();
    await expect(searchInput).toHaveValue("");
  });

  test("3. Mobile filter chips & cuisine bottom sheet", async ({ page }) => {
    await page.goto("/");

    // Click establishment filter pill (e.g. Bageri)
    const bageriPill = page.locator('.mobile-type-filters button, .chip-row button', { hasText: /bageri/i }).first();
    await expect(bageriPill).toBeVisible();
    await bageriPill.click();

    // Open Cuisine Filter Bottom Sheet
    const filterBtn = page.locator(".quick-filter-pill", { hasText: /filter/i }).first();
    await expect(filterBtn).toBeVisible();
    await filterBtn.click();

    // Verify filter sheet title
    const sheetTitle = page.locator("#filter-sheet-title");
    await expect(sheetTitle).toBeVisible();

    // Close bottom sheet
    const applyBtn = page.locator(".filter-apply-btn");
    await expect(applyBtn).toBeVisible({ timeout: 10000 });
    await applyBtn.click();
    await expect(sheetTitle).not.toBeVisible({ timeout: 10000 });
  });

  test("4. Mobile map/list view toggle", async ({ page }) => {
    await page.goto("/");

    const viewToggleBtn = page.locator(".floating-view-toggle-btn");
    await expect(viewToggleBtn).toBeVisible();

    // Toggle to List view
    await viewToggleBtn.click();

    // Verify mobile place card list container appears
    const cardList = page.locator(".mobile-place-card-list");
    await expect(cardList).toBeVisible();

    // Toggle back to Map view
    await viewToggleBtn.click();
    await expect(cardList).not.toBeVisible();
  });

  test("5. Mobile place detail sheet flow", async ({ page }) => {
    await page.goto("/");

    // Switch to list view to access place cards directly
    const viewToggleBtn = page.locator(".floating-view-toggle-btn");
    await viewToggleBtn.click();

    // Click first photo card in mobile list (target heading or card body for reliable click in mobile WebKit)
    const firstCard = page.locator(".mobile-photo-card").first();
    await expect(firstCard).toBeVisible();
    const cardTitle = firstCard.locator("h2").first();
    if (await cardTitle.isVisible()) {
      await cardTitle.click();
    } else {
      await firstCard.click();
    }

    // Verify PlaceDetailSheet opens
    const detailSheet = page.locator(".place-detail-sheet");
    await expect(detailSheet).toBeVisible({ timeout: 10000 });

    // Close detail sheet
    const closeBtn = page.locator(".place-detail-back-btn");
    await expect(closeBtn).toBeVisible({ timeout: 10000 });
    await closeBtn.click();
    await expect(detailSheet).not.toBeVisible({ timeout: 10000 });
  });

  test("5b. Mobile place detail 'View on Map' centers and opens popup", async ({ page }) => {
    page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
    await page.goto("/");

    // Switch to list view
    const viewToggleBtn = page.locator(".floating-view-toggle-btn");
    await viewToggleBtn.click();

    // Click first photo card in mobile list
    const firstCard = page.locator(".mobile-photo-card").first();
    await expect(firstCard).toBeVisible();
    const cardTitle = firstCard.locator("h2").first();
    const expectedName = (await cardTitle.textContent())?.trim() || "";
    if (await cardTitle.isVisible()) {
      await cardTitle.click();
    } else {
      await firstCard.click();
    }

    // Verify PlaceDetailSheet opens
    const detailSheet = page.locator(".place-detail-sheet");
    await expect(detailSheet).toBeVisible({ timeout: 10000 });

    // Click "VISA PÅ KARTAN" CTA
    const viewOnMapBtn = page.locator(".place-detail-primary-cta");
    await expect(viewOnMapBtn).toBeVisible();
    await viewOnMapBtn.click();

    // Detail sheet should close
    await expect(detailSheet).not.toBeVisible({ timeout: 10000 });

    // Map panel should be visible
    const mapPanel = page.locator(".map-panel");
    await expect(mapPanel).toBeVisible({ timeout: 10000 });

    // Active marker and popup should be visible and match selected venue
    const activeMarker = page.locator(".motkarta-map-marker.active");
    await expect(activeMarker).toBeVisible({ timeout: 10000 });

    const leafletPopup = page.locator(".leaflet-popup");
    await expect(leafletPopup).toBeVisible({ timeout: 10000 });
    if (expectedName) {
      await expect(leafletPopup).toContainText(expectedName);
    }
  });

  test("6. Device sync modal flow", async ({ page }) => {
    await page.goto("/");

    // Click "Synka enheter" quick pill
    const syncBtn = page.locator(".quick-filter-pill", { hasText: /synka|sync/i }).first();
    await expect(syncBtn).toBeVisible();
    await syncBtn.click();

    // Verify SyncDevicesModal opens
    const modalTitle = page.locator(".sync-modal-title");
    await expect(modalTitle).toBeVisible();

    // Switch to "Mata in kod" tab
    const enterTab = page.locator(".sync-modal-tab", { hasText: /mata in kod|enter code/i });
    await expect(enterTab).toBeVisible();
    await enterTab.click();

    const codeInput = page.locator(".sync-code-input");
    await expect(codeInput).toBeVisible();

    // Type code into input
    await codeInput.fill("ABC123");
    await expect(codeInput).toHaveValue("ABC123");

    // Close modal
    const closeBtn = page.locator(".sync-modal-close");
    await closeBtn.click();
    await expect(modalTitle).not.toBeVisible();
  });

  test("7. Mobile Hamburger Menu drawer flow", async ({ page }) => {
    await page.goto("/");

    // Open hamburger menu
    const menuBtn = page.locator(".mobile-hamburger-btn");
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();

    // Verify menu drawer renders
    const drawer = page.locator(".mobile-menu-drawer");
    await expect(drawer).toBeVisible();

    // Test language toggle inside drawer
    const langBtn = page.locator(".mobile-menu-lang-row .lang-toggle-btn");
    await expect(langBtn).toBeVisible();
    await langBtn.click();

    // Close menu drawer
    const closeBtn = page.locator(".mobile-menu-close");
    await closeBtn.click();
    await expect(drawer).not.toBeVisible();
  });

  test("8. Mobile floating controls (scroll to top & view toggle)", async ({ page }) => {
    await page.goto("/");

    const scrollTopBtn = page.locator(".floating-scroll-top-btn");
    await expect(scrollTopBtn).toBeVisible();

    const viewToggleBtn = page.locator(".floating-view-toggle-btn");
    await expect(viewToggleBtn).toBeVisible();

    // Test scroll to top click
    await scrollTopBtn.click();

    // Test view toggle click
    await viewToggleBtn.click();
    const cardList = page.locator(".mobile-place-card-list");
    await expect(cardList).toBeVisible();
  });

  test("9. Bakery map marker has transparent background without rectangular artifact", async ({ page }) => {
    await page.goto("/");

    // Filter to Bakery
    const bageriPill = page.locator('.mobile-type-filters button, .chip-row button', { hasText: /bageri/i }).first();
    await expect(bageriPill).toBeVisible();
    await bageriPill.click();

    // Zoom into map to uncluster
    const zoomInBtn = page.locator('.map-control-btn', { hasText: '+' }).first();
    if (await zoomInBtn.isVisible()) {
      await zoomInBtn.click();
      await zoomInBtn.click();
      await zoomInBtn.click();
    }

    const bakeryMarker = page.locator('.motkarta-map-marker.kind-bakery').first();
    await expect(bakeryMarker).toBeVisible({ timeout: 10000 });

    const markerBg = await bakeryMarker.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(markerBg).toBe("rgba(0, 0, 0, 0)");
  });

  test("10. Specialty coffee map marker renders custom takeaway cup icon", async ({ page }) => {
    await page.goto("/");

    // Filter to Specialty coffee
    const coffeePill = page.locator('.mobile-type-filters button, .chip-row button', { hasText: /specialty coffee/i }).first();
    await expect(coffeePill).toBeVisible();
    await coffeePill.click();

    // Zoom into map to uncluster
    const zoomInBtn = page.locator('.map-control-btn', { hasText: '+' }).first();
    if (await zoomInBtn.isVisible()) {
      await zoomInBtn.click();
      await zoomInBtn.click();
      await zoomInBtn.click();
    }

    const specialtyMarker = page.locator('.motkarta-map-marker.kind-specialty-coffee').first();
    await expect(specialtyMarker).toBeVisible({ timeout: 10000 });

    // Capture screenshot of marker
    await specialtyMarker.screenshot({ path: "test-results/specialty-coffee-marker.png" });

    // Ensure it contains SVG with the specialty coffee path
    const svgPath = specialtyMarker.locator("svg path").first();
    await expect(svgPath).toBeVisible();
    const dAttr = await svgPath.getAttribute("d");
    expect(dAttr).toContain("M94 54");
  });

  test("11. Upload photo from device in superpower modal", async ({ page }) => {
    await page.goto("/");

    // Open photo modal via superpower chip button
    const photoChip = page.locator('.superpower-chip-btn', { hasText: /foto/i }).first();
    await expect(photoChip).toBeVisible();
    await photoChip.click();

    // Verify modal appears
    const modal = page.locator('.superpower-modal-card');
    await expect(modal).toBeVisible();
    await expect(modal.locator('h3')).toContainText(/lägg till foto/i);

    // Verify source toggle buttons are visible
    const deviceTab = modal.locator('.superpower-tab-btn', { hasText: /från enhet/i });
    const urlTab = modal.locator('.superpower-tab-btn', { hasText: /bild-url/i });
    await expect(deviceTab).toBeVisible();
    await expect(urlTab).toBeVisible();
    await expect(deviceTab).toHaveClass(/is-active/);

    // Verify dropzone is visible
    const dropzone = modal.locator('.superpower-dropzone');
    await expect(dropzone).toBeVisible();

    // Upload a test image from device via file input
    const fileInput = modal.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "croissant.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
    });

    // Verify preview card appears with filename and thumbnail
    const previewCard = modal.locator('.superpower-photo-preview-card');
    await expect(previewCard).toBeVisible();
    await expect(previewCard).toContainText("croissant.png");
    await expect(previewCard.locator('img.superpower-preview-thumbnail')).toBeVisible();

    // Enter caption
    const captionInput = modal.locator('input[placeholder*="t.ex."]');
    await captionInput.fill("Färskgräddad croissant");

    // Screenshot the modal with uploaded image preview
    await modal.screenshot({ path: "test-results/device-photo-modal-preview.png" });

    // Submit the photo
    const submitBtn = modal.locator('.superpower-submit-btn');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Verify modal closes
    await expect(modal).not.toBeVisible();
  });

  test("12. Search and select place in add photo modal dropdown", async ({ page }) => {
    await page.goto("/");

    // Open photo modal via superpower chip button
    const photoChip = page.locator('.superpower-chip-btn', { hasText: /foto/i }).first();
    await expect(photoChip).toBeVisible();
    await photoChip.click();

    // Verify modal appears
    const modal = page.locator('.superpower-modal-card');
    await expect(modal).toBeVisible();

    // Verify searchable place select is present
    const placeInput = modal.locator('[data-testid="searchable-place-input"]');
    await expect(placeInput).toBeVisible();

    // Click input to open dropdown and initiate search
    await placeInput.click();
    const dropdown = modal.locator('[data-testid="searchable-place-dropdown"]');
    await expect(dropdown).toBeVisible();

    // Type query to search for Solkant
    await placeInput.fill("Solkant");
    const solkantOption = dropdown.locator('.searchable-place-option', { hasText: /Solkant/i }).first();
    await expect(solkantOption).toBeVisible();

    // Capture screenshot of the filtered dropdown
    await modal.screenshot({ path: "test-results/searchable-place-select-dropdown.png" });

    // Select Solkant
    await solkantOption.click();

    // Dropdown closes and input reflects selected place
    await expect(dropdown).not.toBeVisible();
    await expect(placeInput).toHaveValue(/Solkant/);
  });

  test("13. Add new place with website and photo upload in superpower modal", async ({ page }) => {
    await page.goto("/");

    // Open add place modal via superpower chip button
    const addPlaceChip = page.locator('.superpower-chip-btn', { hasText: /nytt ställe/i }).first();
    await expect(addPlaceChip).toBeVisible();
    await addPlaceChip.click();

    // Verify modal appears
    const modal = page.locator('.superpower-modal-card');
    await expect(modal).toBeVisible();
    await expect(modal.locator('h3')).toContainText(/lägg till nytt ställe/i);

    // Verify new website input exists
    const websiteInput = modal.locator('[data-testid="add-place-website-input"]');
    await expect(websiteInput).toBeVisible();

    // Fill in place name and website
    const nameInput = modal.locator('input[placeholder*="Oaxen"]').first();
    await nameInput.fill("Belgobaren City Test");
    await websiteInput.fill("https://www.belgobaren.se");

    // Verify photo upload section exists
    const dropzone = modal.locator('[data-testid="add-place-dropzone"]');
    await expect(dropzone).toBeVisible();

    // Upload test photo from device
    const fileInput = modal.locator('[data-testid="add-place-file-input"]');
    await fileInput.setInputFiles({
      name: "belgobaren.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
    });

    // Verify photo preview card appears
    const previewCard = modal.locator('.superpower-photo-preview-card');
    await expect(previewCard).toBeVisible();
    await expect(previewCard).toContainText("belgobaren.png");

    // Enter caption
    const captionInput = modal.locator('[data-testid="add-place-caption-input"]');
    await expect(captionInput).toBeVisible();
    await captionInput.fill("Belgisk öl & frites");

    // Scroll preview card into view and capture screenshot
    await previewCard.scrollIntoViewIfNeeded();
    await modal.screenshot({ path: "test-results/add-place-website-photo-modal.png" });

    // Submit new place
    const submitBtn = modal.locator('.superpower-submit-btn');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Verify modal closes
    await expect(modal).not.toBeVisible();
  });
});



