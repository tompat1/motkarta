import { test, expect } from "@playwright/test";

test.describe("Mobile Interface Features & Design Verification", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("motkarta_preloader_seen", "true");
      window.localStorage.setItem("motkarta_onboarded", "true");
    });
  });

  test("1. Bottom app toolbar renders 3 tabs with active indicator", async ({ page }) => {
    await page.goto("/");

    const toolbar = page.locator(".mobile-app-toolbar");
    await expect(toolbar).toBeVisible({ timeout: 10000 });

    const discoverTab = toolbar.locator('.mobile-toolbar-tab[data-tab="discover"]');
    const mapTab = toolbar.locator('.mobile-toolbar-tab[data-tab="map"]');
    const savedTab = toolbar.locator('.mobile-toolbar-tab[data-tab="saved"]');

    await expect(discoverTab).toBeVisible();
    await expect(mapTab).toBeVisible();
    await expect(savedTab).toBeVisible();

    // Default tab is "map"
    await expect(mapTab).toHaveClass(/is-active/);
    await expect(mapTab.locator(".mobile-toolbar-active-indicator")).toBeVisible();
  });

  test("2. Discover ('Upptäck') view displays editorial hero & inspiration section", async ({ page }) => {
    await page.goto("/");

    // Tap "Upptäck" in bottom toolbar
    const discoverTab = page.locator('.mobile-toolbar-tab[data-tab="discover"]');
    await discoverTab.click();
    await expect(discoverTab).toHaveClass(/is-active/);

    const discoverView = page.locator(".editorial-desktop-home");
    await expect(discoverView).toBeVisible();

    // Verify editorial headline and kicker
    await expect(discoverView.locator(".editorial-kicker")).toContainText(
      /ÄKTA MAT|REAL FOOD/i
    );
    await expect(discoverView.locator("#editorial-home-title")).toContainText(
      /Stockholm/i
    );

    // Verify search and concierge button inside Discover view
    const heroSearch = discoverView.locator(".editorial-hero-search");
    await expect(heroSearch).toBeVisible();
    await expect(heroSearch.locator(".editorial-hero-concierge-btn")).toBeVisible();

    // Verify category shortcut buttons
    await expect(discoverView.locator(".editorial-category-row button")).toHaveCount(4);

    // Verify terrace hero media and note
    await expect(discoverView.locator(".editorial-hero-media")).toBeVisible();
    await expect(discoverView.locator(".editorial-hero-note")).toContainText(/Samma stad|Same city/i);

    // Verify Feature section & cards
    const featureSection = page.locator(".editorial-desktop-feature");
    await expect(featureSection).toBeVisible();
    await expect(featureSection.locator(".editorial-feature-copy h2")).toBeVisible();
    const placeCard = featureSection.locator(".editorial-feature-card").first();
    await expect(placeCard).toBeVisible();
    await expect(placeCard.locator("strong")).toBeVisible();
  });

  test("3. Concierge search in Discover view renders and accepts queries", async ({ page }) => {
    await page.goto("/");

    // Go to Discover
    await page.locator('.mobile-toolbar-tab[data-tab="discover"]').click();

    // Verify hero search input and concierge button
    const heroSearch = page.locator(".editorial-desktop-home .editorial-hero-search");
    await expect(heroSearch).toBeVisible();

    const searchInput = heroSearch.locator("input");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("Pascal");
    await expect(searchInput).toHaveValue("Pascal");

    const conciergeBtn = heroSearch.locator(".editorial-hero-concierge-btn");
    await expect(conciergeBtn).toBeVisible();
  });

  test("4. Category pill in Discover view filters and switches to Map", async ({ page }) => {
    await page.goto("/");

    // Go to Discover
    await page.locator('.mobile-toolbar-tab[data-tab="discover"]').click();

    // Click "Specialkaffe" category button
    const specialtyBtn = page.locator(".editorial-category-row button", { hasText: /specialkaffe|specialty/i });
    await specialtyBtn.click();

    // Should switch to Map tab
    await expect(page.locator('.mobile-toolbar-tab[data-tab="map"]')).toHaveClass(/is-active/);
    const activeKindPill = page.locator(".quick-filter-pill.is-active");
    await expect(activeKindPill).toBeVisible();
    await expect(activeKindPill).toContainText(/specialkaffe|specialty/i);
  });

  test("5. Map marker click shows slide-up preview and 'Visa stället' opens place detail overlay", async ({ page }) => {
    await page.goto("/");

    // Ensure on map tab
    const marker = page.locator(".leaflet-marker-icon").first();
    await marker.waitFor({ state: "attached", timeout: 15000 });
    await marker.dispatchEvent("click");

    // Leaflet popup bubble must NOT be visible
    await expect(page.locator(".leaflet-popup")).toBeHidden();

    // Mobile slide-up preview card must appear
    const slideUp = page.locator(".mobile-place-slide-up");
    await expect(slideUp).toBeVisible({ timeout: 10000 });
    await expect(slideUp.locator(".mobile-slide-up-title")).toBeVisible();
    await expect(slideUp.locator(".mobile-slide-up-primary-btn")).toContainText(/visa stället|view place/i);

    // Tapping "Varför visas detta?" expands recommendation reasons
    const whyTrigger = slideUp.locator(".mobile-slide-up-why-trigger");
    await whyTrigger.click();
    await expect(slideUp.locator(".mobile-slide-up-why-details")).toBeVisible();

    // Tapping "Visa stället →" opens full PlaceDetailSheet overlay
    await slideUp.locator(".mobile-slide-up-primary-btn").click();
    await expect(page.locator(".place-detail-sheet-overlay")).toBeVisible({ timeout: 10000 });
  });

  test("5b. Slide-up preview close X button dismisses the preview card", async ({ page }) => {
    await page.goto("/");

    const marker = page.locator(".leaflet-marker-icon").first();
    await marker.waitFor({ state: "attached", timeout: 15000 });
    await marker.dispatchEvent("click");

    const slideUp = page.locator(".mobile-place-slide-up");
    await expect(slideUp).toBeVisible({ timeout: 10000 });

    const closeBtn = slideUp.locator(".mobile-slide-up-close-btn");
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    await expect(slideUp).toBeHidden({ timeout: 5000 });
  });

  test("6. Saved tab activates filter for saved places", async ({ page }) => {
    await page.goto("/");

    const savedTab = page.locator('.mobile-toolbar-tab[data-tab="saved"]');
    await savedTab.click();
    await expect(savedTab).toHaveClass(/is-active/);
  });

  test("7. Clean single top-bar with SV/EN toggle and hamburger menu, without duplicates", async ({ page }) => {
    await page.goto("/");

    // Topbar is visible
    const topbar = page.locator(".topbar");
    await expect(topbar).toBeVisible();

    // Brand logo is visible
    await expect(topbar.locator(".brand-logo")).toBeVisible();

    // Topbar actions: simple SV/EN toggle and hamburger menu
    const langBtn = topbar.locator(".lang-toggle-btn");
    await expect(langBtn).toBeVisible();
    await expect(langBtn.locator(".lang-opt.is-active")).toHaveText("SV");

    const hamburgerBtn = topbar.locator(".mobile-hamburger-btn");
    await expect(hamburgerBtn).toBeVisible();

    // Desktop/clutter items are hidden
    await expect(topbar.locator(".topbar-cart-btn")).toBeHidden();
    await expect(topbar.locator(".topbar-session-auth")).toBeHidden();

    // Test clicking SV/EN toggle switches language
    await langBtn.click();
    await expect(langBtn.locator(".lang-opt.is-active")).toHaveText("EN");

    // Switch back to SV
    await langBtn.click();
    await expect(langBtn.locator(".lang-opt.is-active")).toHaveText("SV");

    // Open Discover view and verify desktop content is rendered cleanly without duplicate topbars
    await page.locator('.mobile-toolbar-tab[data-tab="discover"]').click();
    await expect(page.locator(".editorial-desktop-home")).toBeVisible();
    await expect(page.locator(".mobile-discover-header")).toHaveCount(0);
  });

  test("8. Floating top up arrow button renders and scrolls to top in mobile view", async ({ page }) => {
    await page.goto("/");

    // Floating scroll top button is visible
    const scrollTopBtn = page.locator(".mobile-floating-controls .floating-scroll-top-btn");
    await expect(scrollTopBtn).toBeVisible();

    // Scroll down
    await page.evaluate(() => window.scrollTo(0, 500));
    await expect(page.evaluate(() => window.scrollY)).resolves.toBeGreaterThan(0);

    // Click scroll to top button
    await scrollTopBtn.click();

    // Verify scrolled back near top
    await expect.poll(async () => page.evaluate(() => window.scrollY || document.documentElement.scrollTop || 0), {
      timeout: 5000,
    }).toBeLessThanOrEqual(50);
  });
});

