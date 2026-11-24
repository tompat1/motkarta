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
    const searchInput = page.locator('input[aria-label*="Sök"]:visible, input[aria-label*="Search"]:visible').first();
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

  test("autocomplete suggests places and cuisines for partial input and shows loading spinner", async ({ page }) => {
    await page.goto("/");

    const searchInput = page.locator('#desktop-discovery-search, input[aria-label*="Sök"]').first();
    await searchInput.scrollIntoViewIfNeeded();
    await expect(searchInput).toBeVisible({ timeout: 15000 });

    // 1. Partial place name: "belgobar" -> suggests Belgobaren
    await searchInput.click();
    await searchInput.fill("belgobar");
    const autocompleteBox = page.locator(".search-autocomplete-box").first();
    await expect(autocompleteBox).toBeVisible({ timeout: 5000 });
    await expect(autocompleteBox.locator(".autocomplete-item", { hasText: /Belgobaren/i }).first()).toBeVisible();

    // 2. Partial cuisine name: "italian" -> suggests Italian / Italienskt cuisine and filters on click
    // Even if scrolled far down (e.g. Merch section), selecting from the quick dropdown scrolls back to the map workspace.
    if (await page.locator("#merch").count() > 0 && (page.viewportSize()?.width ?? 0) > 1024) {
      await page.locator("#merch").scrollIntoViewIfNeeded();
      await searchInput.click();
    }
    await searchInput.fill("italian");
    const cuisineSuggestion = autocompleteBox.locator(".autocomplete-item", { hasText: /Italienskt|Italian/i }).first();
    await expect(cuisineSuggestion).toBeVisible({ timeout: 5000 });
    await cuisineSuggestion.click();

    // Dropdown closes and query clears because cuisine filter took over
    await expect(autocompleteBox).toBeHidden();
    await expect(searchInput).toHaveValue("");
    if ((page.viewportSize()?.width ?? 0) > 1024) {
      await expect.poll(async () => {
        return page.evaluate(() => {
          const el = document.getElementById("place-workspace");
          if (!el) return 9999;
          return Math.abs(el.getBoundingClientRect().top);
        });
      }, { timeout: 5000 }).toBeLessThan(320);
    }

    // 3. Slow Concierge request shows loading spinner & status pill
    await page.route("**/api/concierge", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          answer: "Test concierge answer",
          recommendedPlaces: [],
          followUpQuestions: [],
        }),
      });
    });

    await searchInput.fill("bästa pastan i stan");
    await searchInput.press("Enter");
    await expect(page.locator(".search-loading-spinner:visible").first()).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".search-loading-pill:visible").first()).toBeVisible({ timeout: 3000 });
  });
});
