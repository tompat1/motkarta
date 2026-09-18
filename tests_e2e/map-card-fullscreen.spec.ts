import { test, expect } from "@playwright/test";

test.describe("Map Card Fullscreen & Mobile Viewport Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("motkarta_preloader_seen", "true");
      window.localStorage.setItem("motkarta_onboarded", "true");
    });
  });

  test("map card renders full height in desktop fullscreen mode and responds cleanly to mobile viewports", async ({ page }, testInfo) => {
    await page.goto("/");
    const isMobile = testInfo.project.name.startsWith("mobile");

    if (isMobile) {
      const marker = page.locator(".leaflet-marker-icon").first();
      await marker.waitFor({ state: "attached", timeout: 15000 });
      await marker.dispatchEvent("click");
    } else {
      const placeItem = page.locator(".place").first();
      await placeItem.waitFor({ state: "visible", timeout: 15000 });
      await placeItem.click();
    }

    const mapCard = page.locator("article.map-card");
    if (isMobile) {
      await expect(mapCard).toBeHidden();
      await expect(page.locator(".mobile-place-slide-up")).toBeVisible({ timeout: 10000 });

      const fsBtn = page.locator(
        ".map-control-btn[title*='Helskärm'], .map-control-btn[title*='Fullscreen'], .map-control-btn[aria-label*='Helskärm'], .map-control-btn[aria-label*='Fullscreen']"
      ).first();
      await expect(fsBtn).toBeVisible();
      await fsBtn.click();
      await expect(mapCard).toBeHidden();
      await expect(page.locator(".mobile-place-slide-up")).toBeVisible();
      return;
    }

    await expect(mapCard).toBeVisible({ timeout: 10000 });

    // Click fullscreen button
    const fsBtn = page.locator(
      ".map-control-btn"
    ).filter({ hasText: /Helskärm|Fullscreen/i }).first();

    await expect(fsBtn).toBeVisible();
    await fsBtn.click();
    await page.waitForTimeout(500);

    const fsBox = await mapCard.boundingBox();
    expect(fsBox).not.toBeNull();

    const fsStyles = await page.evaluate(() => {
      const el = document.querySelector("article.map-card");
      if (!el) return null;
      const s = window.getComputedStyle(el);
      return {
        height: s.height,
        maxHeight: s.maxHeight,
        top: s.top,
        bottom: s.bottom,
        left: s.left,
        right: s.right,
        position: s.position,
        width: s.width
      };
    });

    // Desktop assertions: Full height verification
    const panelHeight = await page.evaluate(() => document.querySelector(".map-panel")?.clientHeight || 0);
    expect(fsBox!.height).toBeGreaterThanOrEqual(panelHeight * 0.98);
    expect(fsStyles?.maxHeight).toBe("100%");
    expect(fsStyles?.top).toBe("0px");
    expect(fsStyles?.bottom).toBe("0px");

      // The editorial desktop map intentionally omits the legacy floating legend.
      await expect(page.locator(".map-legend")).toBeHidden();

    // Verify minimize in desktop fullscreen
    const toggleBtn = mapCard.locator(".map-card-toggle-btn");
    await toggleBtn.click();
    await page.waitForTimeout(300);
    const minBox = await mapCard.boundingBox();
    expect(minBox!.height).toBeLessThanOrEqual(85);

    // Restore
    await toggleBtn.click();
    await page.waitForTimeout(300);
    const restoredBox = await mapCard.boundingBox();
    expect(restoredBox!.height).toBeGreaterThanOrEqual(panelHeight * 0.98);
  });
});
