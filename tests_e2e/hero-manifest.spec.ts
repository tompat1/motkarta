import { test, expect } from "@playwright/test";

test.describe("Hero Manifesto Verification", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("motkarta_preloader_seen", "true");
      window.localStorage.setItem("motkarta_onboarded", "true");
    });
  });

  test("desktop hero renders the independent discovery manifesto in both languages", async ({ page }, testInfo) => {
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

    const heroManifest = page.locator(".countermap-hero-manifest");
    await expect(heroManifest).toBeVisible({ timeout: 15000 });

    const badge = heroManifest.locator(".countermap-hero-manifest-badge");
    await expect(badge).toHaveText("MANIFESTO");

    const primaryEn = heroManifest.locator(".countermap-hero-manifest-primary");
    await expect(primaryEn).toHaveText("A MORE DELICIOUS, MORE HUMAN STOCKHOLM.");

    const secondaryEn = heroManifest.locator(".countermap-hero-manifest-secondary");
    await expect(secondaryEn).toHaveText("INDEPENDENT DISCOVERY FOR A BRIGHTER CITY.");

    // 2. Test switching to Swedish
    const svSwitch = page.getByRole("button", { name: "SV", exact: true });
    if (await svSwitch.isVisible()) {
      await svSwitch.click();
      await expect(badge).toHaveText("MANIFEST");
      const primarySv = heroManifest.locator(".countermap-hero-manifest-primary");
      await expect(primarySv).toHaveText("ETT GODARE, MER MÄNSKLIGT STOCKHOLM.");
      const secondarySv = heroManifest.locator(".countermap-hero-manifest-secondary");
      await expect(secondarySv).toHaveText("OBEROENDE UPPTÄCKT FÖR EN LJUSARE STAD.");
      await expect(heroManifest).toHaveAttribute("data-manifest-en", /A MORE DELICIOUS, MORE HUMAN STOCKHOLM/);
    }
  });
});
