import { test, expect } from "@playwright/test";

test.describe("Search input & Map clustering console error prevention", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("motkarta_preloader_seen", "true");
      window.localStorage.setItem("motkarta_onboarded", "true");
    });
  });

  test("no TypeError or _leaflet_id error occurs when typing in search while places are active or filtered", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await page.goto("/");

    // 1. Wait for map to render
    const leafletMap = page.locator(".leaflet-map");
    await expect(leafletMap).toBeVisible({ timeout: 15000 });

    // 2. Select a place if possible to ensure activePlace is populated
    const marker = page.locator(".leaflet-marker-icon").first();
    if (await marker.isVisible({ timeout: 5000 }).catch(() => false)) {
      await marker.click({ force: true });
    }

    // 3. Locate search input
    const searchInput = page.locator('input[aria-label*="Sök"], input[aria-label*="Search"]').first();
    await expect(searchInput).toBeVisible();

    // 4. Focus and type query character by character to trigger rapid filtering & fitBounds
    await searchInput.focus();
    await searchInput.pressSequentially("pascal", { delay: 50 });
    await page.waitForTimeout(300);

    // 5. Clear search query
    const clearBtn = page.locator(".search-clear-btn").first();
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
    } else {
      await searchInput.fill("");
    }
    await page.waitForTimeout(200);

    // 6. Type another query that filters down sharply
    await searchInput.pressSequentially("solkant", { delay: 50 });
    await page.waitForTimeout(300);

    // 7. Clear again
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
    } else {
      await searchInput.fill("");
    }
    await page.waitForTimeout(300);

    // 8. Assert zero page crashes or leaflet errors
    const leafletErrors = [...consoleErrors, ...pageErrors].filter((err) =>
      err.includes("_leaflet_id") ||
      err.includes("hasLayer") ||
      err.includes("Cannot use 'in' operator") ||
      err.includes("TypeError")
    );

    expect(leafletErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
