import { test, expect } from "@playwright/test";

test("reproduce mobile list card click -> view on map", async ({ page }) => {
  page.setViewportSize({ width: 390, height: 844 });
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));

  await page.addInitScript(() => {
    window.localStorage.setItem("motkarta_preloader_seen", "true");
    window.localStorage.setItem("motkarta_onboarded", "true");
  });

  await page.goto("/");
  await page.waitForTimeout(1000);

  const initialLayout = await page.evaluate(() => ({
    scrollY: window.scrollY,
    mapPanel: document.querySelector(".map-panel")?.getBoundingClientRect(),
    workspace: document.querySelector(".workspace")?.getBoundingClientRect(),
  }));
  console.log("INITIAL LAYOUT ON LOAD:", JSON.stringify(initialLayout, null, 2));

  // 1. Select Specialty coffee filter
  const coffeePill = page.locator('button', { hasText: /^Specialty coffee$/i }).first();
  if (await coffeePill.isVisible()) {
    await coffeePill.click();
  }

  // 2. Click list view toggle
  const viewToggleBtn = page.locator(".floating-view-toggle-btn");
  await expect(viewToggleBtn).toBeVisible();
  await viewToggleBtn.click();

  // 3. Find Nordic Brew Lab card
  const nordicCard = page.locator('.mobile-photo-card', { hasText: /Nordic Brew Lab/i }).first();
  await expect(nordicCard).toBeVisible({ timeout: 10000 });
  await nordicCard.click();

  // 4. Verify PlaceDetailSheet is open
  const detailSheet = page.locator(".place-detail-sheet");
  await expect(detailSheet).toBeVisible({ timeout: 10000 });

  // 5. Click "VISA PÅ KARTAN"
  const viewOnMapBtn = page.locator(".place-detail-primary-cta");
  await expect(viewOnMapBtn).toBeVisible({ timeout: 10000 });
  await viewOnMapBtn.click();

  // Wait a bit
  await page.waitForTimeout(2000);

  // Take viewport screenshot
  await page.screenshot({ path: "test-results/viewport.png", fullPage: false });

  // Check state
  const mapCard = page.locator(".map-card");
  const isMapCardVisible = await mapCard.isVisible();
  console.log("IS MAP CARD VISIBLE?", isMapCardVisible);
  if (isMapCardVisible) {
    const box = await mapCard.boundingBox();
    console.log("MAP CARD BOX:", JSON.stringify(box));
  }

  const activeMarker = page.locator(".motkarta-map-marker.active");
  const isActiveMarkerVisible = await activeMarker.isVisible();
  console.log("IS ACTIVE MARKER VISIBLE?", isActiveMarkerVisible);
  if (isActiveMarkerVisible) {
    const box = await activeMarker.boundingBox();
    console.log("ACTIVE MARKER BOX:", JSON.stringify(box));
  }

  const leafletPopup = page.locator(".leaflet-popup");
  const isPopupVisible = await leafletPopup.isVisible();
  console.log("IS POPUP VISIBLE?", isPopupVisible);
  if (isPopupVisible) {
    const box = await leafletPopup.boundingBox();
    console.log("POPUP BOX:", JSON.stringify(box));
  }

  const layoutInfo = await page.evaluate(() => {
    const mapPanel = document.querySelector(".map-panel");
    const workspace = document.querySelector(".workspace");
    const topbar = document.querySelector(".topbar");
    const mobileControls = document.querySelector(".mobile-controls-bar");
    const countermapControls = document.querySelector(".countermap-controls");
    const hero = document.querySelector(".countermap-hero");
    return {
      windowHeight: window.innerHeight,
      scrollY: window.scrollY,
      topbar: topbar ? topbar.getBoundingClientRect() : null,
      mobileControls: mobileControls ? mobileControls.getBoundingClientRect() : null,
      countermapControls: countermapControls ? countermapControls.getBoundingClientRect() : null,
      hero: hero ? hero.getBoundingClientRect() : null,
      workspace: workspace ? workspace.getBoundingClientRect() : null,
      mapPanel: mapPanel ? mapPanel.getBoundingClientRect() : null,
      mapPanelOffsetTop: (mapPanel as HTMLElement)?.offsetTop,
      workspaceOffsetTop: (workspace as HTMLElement)?.offsetTop,
    };
  });
  console.log("LAYOUT INFO:", JSON.stringify(layoutInfo, null, 2));
});
