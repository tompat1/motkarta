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
});
