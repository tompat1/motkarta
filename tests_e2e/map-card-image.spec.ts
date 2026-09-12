import { test, expect } from "@playwright/test";

test.describe("Map Place Card Image Placeholder", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("motkarta_preloader_seen", "true");
      window.localStorage.setItem("motkarta_onboarded", "true");
    });
  });

  test("map place card renders image placeholder and removes red-line paragraph", async ({ page }, testInfo) => {
    await page.goto("/");

    const isMobile = testInfo.project.name.startsWith("mobile");

    if (isMobile) {
      // On mobile, the map view is active by default; dispatch click on a marker to select place
      const marker = page.locator(".leaflet-marker-icon").first();
      await marker.waitFor({ state: "attached", timeout: 15000 });
      await marker.dispatchEvent("click");
    } else {
      // Desktop results list
      const placeItem = page.locator(".place").first();
      await expect(placeItem).toBeVisible({ timeout: 15000 });
      await placeItem.click();
    }

    // Verify map card appears
    const mapCard = page.locator("article.map-card");
    await expect(mapCard).toBeVisible({ timeout: 10000 });

    // Verify the red-line recommendation paragraph is NOT present
    await expect(mapCard.locator("p.recommendation")).toHaveCount(0);

    // Verify the main image placeholder / photo container is present and visible
    const photoContainer = mapCard.locator(".map-card-photo-container");
    await expect(photoContainer).toBeVisible();

    const heroPhoto = photoContainer.locator("img.map-card-hero-photo");
    await expect(heroPhoto).toBeVisible();
    await expect(heroPhoto).toHaveAttribute("src", /.+/);

    // Capture screenshot of the map place card on desktop
    if (testInfo.project.name === "chromium") {
      await mapCard.screenshot({
        path: "/Users/thomasrynell/.gemini/antigravity-ide/brain/72a70bf3-d6b1-4a28-a1fb-a71bcfa751db/map_card_image_placeholder.png",
      });
    }
  });
});
