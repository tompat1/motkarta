import { test, expect } from "@playwright/test";

test.describe("Map Place Card Image Placeholder & Clean Note", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("motkarta_preloader_seen", "true");
      window.localStorage.setItem("motkarta_onboarded", "true");
    });
  });

  test("map place card renders image placeholder and removes red-line and raw note lines", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.startsWith("mobile"), "The large map card is desktop-only.");
    await page.goto("/");

    const placeItem = page.locator(".place").first();
    await expect(placeItem).toBeVisible({ timeout: 15000 });
    await placeItem.click();

    // Verify map card appears
    const mapCard = page.locator("article.map-card");
    await expect(mapCard).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".leaflet-popup")).toBeHidden();

    // Verify the red-line recommendation paragraph is NOT present
    await expect(mapCard.locator("p.recommendation")).toHaveCount(0);

    // Verify raw note paragraph is NOT present in map card
    await expect(mapCard.locator("p.note")).toHaveCount(0);
    await expect(mapCard).not.toContainText("from OpenStreetMap. Cuisine tag");

    // Verify the main image placeholder / photo container is present and visible
    const photoContainer = mapCard.locator(".map-card-photo-container");
    await expect(photoContainer).toBeVisible();

    const heroPhoto = photoContainer.locator("img.map-card-hero-photo");
    await expect(heroPhoto).toBeVisible();
    await expect(heroPhoto).toHaveAttribute("src", /.+/);

    // Verify that the main image is not duplicated in the gallery below
    const heroSrc = await heroPhoto.getAttribute("src");
    if (heroSrc && !heroSrc.includes("motkarta_drop_divided")) {
      const galleryPhotos = mapCard.locator(".lazy-media-drawer .photo-grid .photo-card img");
      const count = await galleryPhotos.count();
      for (let i = 0; i < count; i++) {
        const gallerySrc = await galleryPhotos.nth(i).getAttribute("src");
        expect(gallerySrc).not.toBe(heroSrc);
      }
    }

    // Capture screenshot of the map place card on desktop
    if (testInfo.project.name === "chromium") {
      await mapCard.screenshot({
        path: testInfo.outputPath("map_card_image_placeholder.png"),
      });
    }
  });

  test("clicking cuisine in place detail filters the list on desktop and mobile", async ({ page }, testInfo) => {
    await page.goto("/");
    const isMobile = testInfo.project.name.startsWith("mobile");

    if (!isMobile) {
      const searchInput = page.locator('#desktop-discovery-search, input[aria-label*="Sök"]').first();
      await expect(searchInput).toBeVisible({ timeout: 15000 });
      await searchInput.fill("Belgobaren");

      const firstPlace = page.locator(".place", { hasText: "Belgobaren" }).first();
      await expect(firstPlace).toBeVisible({ timeout: 10000 });
      await firstPlace.click();

      const mapCard = page.locator("article.map-card");
      await expect(mapCard).toBeVisible({ timeout: 10000 });

      const cuisineBtn = mapCard.locator(".cuisine-line-btn").first();
      await expect(cuisineBtn).toBeVisible();
      await cuisineBtn.click();

      // Search input is cleared and cuisine filter is active on the list
      await expect(searchInput).toHaveValue("");
      await expect(cuisineBtn).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".place", { hasText: "Belgobaren" }).first()).toBeVisible();
    } else {
      // Search Belgobaren, switch to mobile list view, open PlaceDetailSheet, tap cuisine
      const searchInput = page.locator('#desktop-discovery-search, input[aria-label*="Sök"]').first();
      await searchInput.scrollIntoViewIfNeeded();
      await expect(searchInput).toBeVisible({ timeout: 15000 });
      await searchInput.fill("Belgobaren");

      const viewToggleBtn = page.locator(".floating-view-toggle-btn");
      await expect(viewToggleBtn).toBeVisible({ timeout: 10000 });
      await viewToggleBtn.click();

      const mobileCard = page.locator(".mobile-photo-card", { hasText: "Belgobaren" }).first();
      await expect(mobileCard).toBeVisible({ timeout: 10000 });
      const cardTitle = mobileCard.locator("h2").first();
      if (await cardTitle.isVisible()) {
        await cardTitle.click();
      } else {
        await mobileCard.click();
      }

      const detailSheet = page.locator(".place-detail-sheet");
      await expect(detailSheet).toBeVisible({ timeout: 10000 });

      const cuisineBtn = detailSheet.locator(".place-detail-cuisine-btn").first();
      await expect(cuisineBtn).toBeVisible();
      await cuisineBtn.click();

      // Detail sheet closes and filtered mobile list is shown
      await expect(detailSheet).toBeHidden();
      await expect(page.locator(".mobile-place-card-list")).toBeVisible();
      await expect(page.locator(".mobile-photo-card", { hasText: "Belgobaren" }).first()).toBeVisible();
    }
  });
});
