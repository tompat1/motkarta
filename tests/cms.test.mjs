import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CMS_CATALOG,
  CMS_STORAGE_KEY,
  CMS_AUTH_KEY,
  CMS_EDIT_MODE_KEY,
  readStoredCmsOverrides,
  writeStoredCmsOverrides,
  readStoredCmsAuth,
  readStoredCmsEditMode,
  isCmsPasscodeValid,
} from "../src/app/cms-store.ts";

// Setup mock window and localStorage for node environment
class MockStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

globalThis.window = globalThis;
globalThis.localStorage = new MockStorage();
globalThis.sessionStorage = new MockStorage();

test("CMS_CATALOG contains all essential sections and keys", () => {
  const sections = new Set(CMS_CATALOG.map((item) => item.section));
  assert.ok(sections.has("Navigation"), "should have Navigation section");
  assert.ok(sections.has("Hero & Manifest"), "should have Hero & Manifest section");
  assert.ok(sections.has("Concierge (#concierge)"), "should have Concierge section");
  assert.ok(sections.has("Metod (#method)"), "should have Method section");
  assert.ok(sections.has("Merch & Store (#merch)"), "should have Merch section");
  assert.ok(sections.has("Principer ([Principles])"), "should have Principles section");

  // Check specific keys
  const keys = new Set(CMS_CATALOG.map((item) => item.key));
  assert.ok(keys.has("navMap"));
  assert.ok(keys.has("navMethod"));
  assert.ok(keys.has("navConcierge"));
  assert.ok(keys.has("navMerch"));
  assert.ok(keys.has("navPrinciples"));
  assert.ok(keys.has("heroBadge"));
  assert.ok(keys.has("titleMain"));
  assert.ok(keys.has("titleSub"));
  assert.ok(keys.has("heroManifestBadge"));
  assert.ok(keys.has("heroManifestPrimary"));
  assert.ok(keys.has("heroManifestSecondary"));
  assert.ok(keys.has("lede"));
  assert.ok(keys.has("controlsHeading"));
  assert.ok(keys.has("controlsSubparagraph"));
  assert.ok(keys.has("conciergeEyebrow"));
  assert.ok(keys.has("conciergeHeadingMain"));
  assert.ok(keys.has("conciergeDesc"));
  assert.ok(keys.has("conciergeShowcaseHeader"));
  assert.ok(keys.has("methodEyebrow"));
  assert.ok(keys.has("methodHeadingMain"));
  assert.ok(keys.has("method01Title"));
  assert.ok(keys.has("method01Desc"));
  assert.ok(keys.has("method02Title"));
  assert.ok(keys.has("method02Desc"));
  assert.ok(keys.has("method03Title"));
  assert.ok(keys.has("method03Desc"));
  assert.ok(keys.has("method04Title"));
  assert.ok(keys.has("method04Desc"));
  assert.ok(keys.has("dataNoteText"));
  assert.ok(keys.has("merchEyebrow"));
  assert.ok(keys.has("merchHeading"));
  assert.ok(keys.has("merchSubtitle"));
  assert.ok(keys.has("merchHeroBadge"));
  assert.ok(keys.has("merchHeroTitle"));
  assert.ok(keys.has("merchHeroDesc"));
  assert.ok(keys.has("merchCartBtn"));
  assert.ok(keys.has("merchDrawerTitle"));
  assert.ok(keys.has("merchDrawerEmpty"));
  assert.ok(keys.has("merchDrawerCheckout"));
  assert.ok(keys.has("merchItem_tshirt_black_title"));
  assert.ok(keys.has("merchItem_tshirt_black_tagline"));
  assert.ok(keys.has("merchItem_tshirt_pin_white_title"));
  assert.ok(keys.has("merchItem_tshirt_grid_motkarta_title"));
  assert.ok(keys.has("principlesHeading"));
  assert.ok(keys.has("onboardingBadge"));
  assert.ok(keys.has("onboardingSubtitle"));
  assert.ok(keys.has("principle1"));
  assert.ok(keys.has("principle2"));
  assert.ok(keys.has("principle3"));
  assert.ok(keys.has("principle1Title"));
  assert.ok(keys.has("principle1Desc"));
  assert.ok(keys.has("principle6Title"));
  assert.ok(keys.has("onboardingExploreMap"));
  assert.ok(keys.has("footerLeft"));
  assert.ok(keys.has("footerRight"));
});

test("readStoredCmsOverrides returns empty maps when storage is empty", () => {
  globalThis.localStorage.clear();
  const overrides = readStoredCmsOverrides();
  assert.deepEqual(overrides, { sv: {}, en: {} });
});

test("writeStoredCmsOverrides and readStoredCmsOverrides persist and load custom copy", () => {
  globalThis.localStorage.clear();
  const testOverrides = {
    sv: {
      methodHeadingMain: "Vår Egen Metod 2026",
      navMerch: "Prylar & Prints",
    },
    en: {
      methodHeadingMain: "Our Custom Method 2026",
      navMerch: "Gear & Prints",
    },
  };

  writeStoredCmsOverrides(testOverrides);
  const loaded = readStoredCmsOverrides();

  assert.equal(loaded.sv.methodHeadingMain, "Vår Egen Metod 2026");
  assert.equal(loaded.sv.navMerch, "Prylar & Prints");
  assert.equal(loaded.en.methodHeadingMain, "Our Custom Method 2026");
  assert.equal(loaded.en.navMerch, "Gear & Prints");
});

test("CMS auth and edit mode storage helpers read and persist state", () => {
  globalThis.localStorage.clear();
  assert.equal(readStoredCmsAuth(), false);
  assert.equal(readStoredCmsEditMode(), false);

  globalThis.localStorage.setItem(CMS_AUTH_KEY, "true");
  globalThis.localStorage.setItem(CMS_EDIT_MODE_KEY, "true");

  assert.equal(readStoredCmsAuth(), true);
  assert.equal(readStoredCmsEditMode(), true);
});

test("isCmsPasscodeValid authenticates standard passcodes and admin tokens", () => {
  assert.equal(isCmsPasscodeValid("motkarta"), true);
  assert.equal(isCmsPasscodeValid("  MOTKARTA  "), true);
  assert.equal(isCmsPasscodeValid("admin"), true);
  assert.equal(isCmsPasscodeValid("motkarta-admin"), true);
  assert.equal(isCmsPasscodeValid("motkarta2026"), true);
  assert.equal(isCmsPasscodeValid("custom-admin-secret-token", "custom-admin-secret-token"), true);
  assert.equal(isCmsPasscodeValid("wrong", null), false);
  assert.equal(isCmsPasscodeValid("123", null), false);
});

test("App.tsx, MerchPanel.tsx and OnboardingModal.tsx integrate CmsEditFlag and CmsFooterControls", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const merchSource = await readFile(new URL("../src/components/MerchPanel.tsx", import.meta.url), "utf8");
  const onboardingSource = await readFile(new URL("../src/components/OnboardingModal.tsx", import.meta.url), "utf8");
  const cartDrawerSource = await readFile(new URL("../src/components/CartDrawer.tsx", import.meta.url), "utf8");

  // App integration
  assert.match(appSource, /<CmsFooterControls/);
  assert.match(appSource, /<CmsProvider/);
  assert.match(appSource, /useCms\(\)/);
  assert.match(appSource, /<CmsEditFlag cmsKey="navMap"/);
  assert.match(appSource, /<CmsEditFlag cmsKey="navMethod"/);
  assert.match(appSource, /<CmsEditFlag cmsKey="navConcierge"/);
  assert.match(appSource, /<CmsEditFlag cmsKey="navMerch"/);
  assert.match(appSource, /<CmsEditFlag cmsKey="navPrinciples"/);
  assert.match(appSource, /<CmsEditFlag cmsKey="methodHeadingMain"/);
  assert.match(appSource, /<CmsEditFlag cmsKey="conciergeHeadingMain"/);
  assert.match(appSource, /<CmsEditFlag cmsKey="principle1"/);
  assert.match(appSource, /<CmsEditFlag cmsKey="footerLeft"/);

  // MerchPanel integration
  assert.match(merchSource, /useCms\(\)/);
  assert.match(merchSource, /<CmsEditFlag cmsKey="merchHeading"/);
  assert.match(merchSource, /<CmsEditFlag cmsKey="merchSubtitle"/);
  assert.match(merchSource, /<CmsEditFlag cmsKey="merchCartBtn"/);
  assert.match(merchSource, /<CmsEditFlag cmsKey={itemTitleKey}/);

  // OnboardingModal integration
  assert.match(onboardingSource, /useCms\(\)/);
  assert.match(onboardingSource, /<CmsEditFlag cmsKey="principlesHeading"/);
  assert.match(onboardingSource, /<CmsEditFlag cmsKey="onboardingBadge"/);
  assert.match(onboardingSource, /<CmsEditFlag cmsKey="onboardingSubtitle"/);
  assert.match(onboardingSource, /<CmsEditFlag cmsKey={p\.titleKey}/);

  // CartDrawer integration
  assert.match(cartDrawerSource, /useCms\(\)/);
  assert.match(cartDrawerSource, /<CmsEditFlag cmsKey="merchDrawerTitle"/);
  assert.match(cartDrawerSource, /<CmsEditFlag cmsKey="merchDrawerCheckout"/);
});
