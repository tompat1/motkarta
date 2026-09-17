import { test, expect } from "@playwright/test";

test.describe("Hero Manifesto Verification", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("motkarta_preloader_seen", "true");
      window.localStorage.setItem("motkarta_onboarded", "true");
    });
  });

  test("desktop hero renders the editorial independent-discovery message in both languages", async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name.startsWith("mobile");
    if (isMobile) {
      // Mobile intentionally skips the editorial desktop hero for fullscreen map/list
      return;
    }

    // 1. Test in English
    await page.addInitScript(() => {
      window.localStorage.setItem("motkarta_lang", "en");
    });
    await page.goto("/");

    const editorialHero = page.locator(".editorial-desktop-home");
    await expect(editorialHero).toBeVisible({ timeout: 15000 });
    await expect(editorialHero.locator("h1")).toContainText("Stockholm,one neighborhood at a time.");
    await expect(editorialHero.locator(".editorial-hero-deck")).toHaveText("No paid placement. Open ranking.");

    // 2. Test switching to Swedish
    const svSwitch = page.getByRole("button", { name: "SV", exact: true });
    if (await svSwitch.isVisible()) {
      await svSwitch.click();
      await expect(editorialHero.locator("h1")).toContainText("Stockholm,ett kvarter i taget.");
      await expect(editorialHero.locator(".editorial-hero-deck")).toHaveText("Ingen betald placering. Öppen ranking.");
    }
  });
});
