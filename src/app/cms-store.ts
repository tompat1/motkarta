export type Language = "sv" | "en";

export const CMS_STORAGE_KEY = "motkarta_cms_overrides";
export const CMS_AUTH_KEY = "motkarta_cms_auth";
export const CMS_EDIT_MODE_KEY = "motkarta_cms_edit_mode";
export const CMS_MERCH_STORAGE_KEY = "motkarta_cms_merch_items";

export type MerchItem = {
  id: string;
  nameSv: string;
  nameEn: string;
  taglineSv: string;
  taglineEn: string;
  priceSek: number;
  priceEur: number;
  badgeSv: string;
  badgeEn: string;
  descSv: string;
  descEn: string;
  specs: string[];
  stockStatusSv: string;
  stockStatusEn: string;
  image: string;
};

export type CmsCopyMap = Record<string, string>;
export type CmsOverrides = {
  sv: CmsCopyMap;
  en: CmsCopyMap;
};

export type CmsKeyMetadata = {
  key: string;
  label: string;
  section: string;
  multiline?: boolean;
};

export const CMS_CATALOG: CmsKeyMetadata[] = [
  // Navigation
  { key: "topbarSlogan", label: "Toppbar: Slogan", section: "Navigation" },
  { key: "navMap", label: "Nav: Karta", section: "Navigation" },
  { key: "navMethod", label: "Nav: Metod", section: "Navigation" },
  { key: "navReview", label: "Nav: Granskning", section: "Navigation" },
  { key: "navConcierge", label: "Nav: Concierge", section: "Navigation" },
  { key: "navMerch", label: "Nav: Merch", section: "Navigation" },
  { key: "navPrinciples", label: "Nav: Principer", section: "Navigation" },
  { key: "navAbout", label: "Nav: Om", section: "Navigation" },

  // Redaktionell Hero (Ny design)
  { key: "heroKicker", label: "Redaktionell Hero: Kicker", section: "Redaktionell Hero" },
  { key: "heroTitle", label: "Redaktionell Hero: Huvudrubrik", section: "Redaktionell Hero", multiline: true },
  { key: "heroDeck", label: "Redaktionell Hero: Ingress / Deck", section: "Redaktionell Hero" },
  { key: "heroSearchPlaceholder", label: "Hero Sök: Platshållare", section: "Redaktionell Hero" },
  { key: "heroSearchBtn", label: "Hero Sök: Concierge-knapp", section: "Redaktionell Hero" },
  { key: "heroNoteLine1", label: "Hero Notis: Rad 1 (Samma stad.)", section: "Redaktionell Hero" },
  { key: "heroNoteLine2", label: "Hero Notis: Rad 2 (Fler goda omvägar.)", section: "Redaktionell Hero" },
  { key: "heroSyncBtn", label: "Hero Synk: Knappetikett", section: "Redaktionell Hero" },

  // Utvalda Omvägar (Feature-sektion)
  { key: "featureKicker", label: "Utvalda Omvägar: Kicker", section: "Utvalda Omvägar" },
  { key: "featureHeading", label: "Utvalda Omvägar: Rubrik (Ta en annan väg.)", section: "Utvalda Omvägar" },
  { key: "featureDesc", label: "Utvalda Omvägar: Beskrivning", section: "Utvalda Omvägar", multiline: true },
  { key: "featureLink", label: "Utvalda Omvägar: Länk (Visa på karta)", section: "Utvalda Omvägar" },

  // Hero & Manifesto (Klassisk)
  { key: "brandDescriptor", label: "Varumärkesdescriptor", section: "Hero & Manifest" },
  { key: "eyebrow", label: "Ögonbryn / Topprad", section: "Hero & Manifest" },
  { key: "heroBadge", label: "Hero Badge", section: "Hero & Manifest" },
  { key: "heroManifestBadge", label: "Manifest Badge", section: "Hero & Manifest" },
  { key: "heroManifestPrimary", label: "Manifest Primär Rubrik", section: "Hero & Manifest", multiline: true },
  { key: "heroManifestSecondary", label: "Manifest Sekundär Rubrik", section: "Hero & Manifest", multiline: true },
  { key: "titleMain", label: "Huvudrubrik (HITTA STÄLLENA)", section: "Hero & Manifest" },
  { key: "titleSub", label: "Underrubrik (ALGORITMEN MISSADE.)", section: "Hero & Manifest" },
  { key: "subLede", label: "Sub-ingress", section: "Hero & Manifest" },
  { key: "lede", label: "Huvudingress (Lede)", section: "Hero & Manifest", multiline: true },

  // Controls & Preferences
  { key: "controlsHeading", label: "Vad låter gott? (Rubrik)", section: "Sök & Filter" },
  { key: "controlsSubparagraph", label: "Vad låter gott? (Underrubrik)", section: "Sök & Filter", multiline: true },
  { key: "selectionReadoutPlaces", label: "Listrubrik: 'ställen i urvalet'", section: "Sök & Filter" },
  { key: "allPlaces", label: "Alla ställen (Filteretikett)", section: "Sök & Filter" },
  { key: "allCuisines", label: "Alla kök (Filteretikett)", section: "Sök & Filter" },
  { key: "whyItAppears", label: "Varför den syns här", section: "Sök & Filter" },
  { key: "transparencyFooter", label: "Transparensrad i filter", section: "Sök & Filter" },
  { key: "attributionTitle", label: "Källtillskrivning: Rubrik", section: "Källtillskrivning" },
  { key: "attributionBody", label: "Källtillskrivning: Text", section: "Källtillskrivning", multiline: true },

  // Concierge (#concierge)
  { key: "conciergeEyebrow", label: "Concierge: Ögonbryn", section: "Concierge (#concierge)" },
  { key: "conciergeHeadingMain", label: "Concierge: Rubrik del 1", section: "Concierge (#concierge)" },
  { key: "conciergeHeadingItalic", label: "Concierge: Kursivt ord", section: "Concierge (#concierge)" },
  { key: "conciergeHeadingSub", label: "Concierge: Rubrik del 2", section: "Concierge (#concierge)" },
  { key: "conciergeDesc", label: "Concierge: Beskrivning", section: "Concierge (#concierge)", multiline: true },
  { key: "conciergeShowcaseHeader", label: "Concierge: Frågemoln Rubrik", section: "Concierge (#concierge)" },

  // Method (#method)
  { key: "methodEyebrow", label: "Metod: Ögonbryn", section: "Metod (#method)" },
  { key: "methodHeadingMain", label: "Metod: Huvudrubrik", section: "Metod (#method)" },
  { key: "methodHeadingSub", label: "Metod: Underrubrik", section: "Metod (#method)" },
  { key: "method01Title", label: "Metod 01: Mångsidig kvalitet (Rubrik)", section: "Metod (#method)" },
  { key: "method01Desc", label: "Metod 01: Beskrivning", section: "Metod (#method)", multiline: true },
  { key: "method02Title", label: "Metod 02: Korrigerad popularitet (Rubrik)", section: "Metod (#method)" },
  { key: "method02Desc", label: "Metod 02: Beskrivning", section: "Metod (#method)", multiline: true },
  { key: "method03Title", label: "Metod 03: Specialty proof (Rubrik)", section: "Metod (#method)" },
  { key: "method03Desc", label: "Metod 03: Beskrivning", section: "Metod (#method)", multiline: true },
  { key: "method04Title", label: "Metod 04: Upptäcktsvärde (Rubrik)", section: "Metod (#method)" },
  { key: "method04Desc", label: "Metod 04: Beskrivning", section: "Metod (#method)", multiline: true },
  { key: "dataNoteLabel", label: "Källnotering: Etikett", section: "Metod (#method)" },
  { key: "dataNoteText", label: "Källnotering: Text", section: "Metod (#method)", multiline: true },

  // Merch (#merch)
  { key: "merchEyebrow", label: "Merch: Ögonbryn", section: "Merch & Store (#merch)" },
  { key: "merchHeading", label: "Merch: Huvudrubrik", section: "Merch & Store (#merch)" },
  { key: "merchSubtitle", label: "Merch: Underrubrik", section: "Merch & Store (#merch)", multiline: true },
  { key: "merchHeroBadge", label: "Merch: Hero Badge", section: "Merch & Store (#merch)" },
  { key: "merchHeroTitle", label: "Merch: Hero Rubrik", section: "Merch & Store (#merch)" },
  { key: "merchHeroDesc", label: "Merch: Hero Beskrivning", section: "Merch & Store (#merch)", multiline: true },
  { key: "merchCartBtn", label: "Merch: Varukorg-knapp", section: "Merch & Store (#merch)" },
  { key: "merchAddToCart", label: "Merch: Lägg i varukorg knapp", section: "Merch & Store (#merch)" },
  { key: "merchAdded", label: "Merch: Tillagd knapp", section: "Merch & Store (#merch)" },
  { key: "merchStockIn", label: "Merch: Lagerstatus (I lager)", section: "Merch & Store (#merch)" },
  { key: "merchStockLow", label: "Merch: Lagerstatus (Fåtal kvar)", section: "Merch & Store (#merch)" },
  { key: "merchSummaryItems", label: "Merch: Artiklar i order text", section: "Merch & Store (#merch)" },
  { key: "merchShippingFree", label: "Merch: Fri frakt text", section: "Merch & Store (#merch)" },
  { key: "merchViewCart", label: "Merch: Visa varukorg knapp", section: "Merch & Store (#merch)" },
  { key: "merchDrawerTitle", label: "Varukorg: Rubrik", section: "Merch & Store (#merch)" },
  { key: "merchDrawerEmpty", label: "Varukorg: Tom varukorg rubrik", section: "Merch & Store (#merch)" },
  { key: "merchDrawerEmptyDesc", label: "Varukorg: Tom varukorg beskrivning", section: "Merch & Store (#merch)", multiline: true },
  { key: "merchDrawerSubtotal", label: "Varukorg: Delsumma etikett", section: "Merch & Store (#merch)" },
  { key: "merchDrawerCheckout", label: "Varukorg: Kassa knapp", section: "Merch & Store (#merch)" },
  { key: "merchDrawerFreeShippingQualified", label: "Varukorg: Fri frakt kvalificerad", section: "Merch & Store (#merch)" },
  { key: "merchItem_tshirt_black_title", label: "Produkt 01: Heavyweight T-Shirt (Titel)", section: "Merch & Store (#merch)" },
  { key: "merchItem_tshirt_black_tagline", label: "Produkt 01: Heavyweight T-Shirt (Tagline)", section: "Merch & Store (#merch)" },
  { key: "merchItem_tshirt_pin_white_title", label: "Produkt 02: Pin T-Shirt Vit (Titel)", section: "Merch & Store (#merch)" },
  { key: "merchItem_tshirt_pin_white_tagline", label: "Produkt 02: Pin T-Shirt Vit (Tagline)", section: "Merch & Store (#merch)" },
  { key: "merchItem_tshirt_grid_motkarta_title", label: "Produkt 03: Grid T-Shirt (Titel)", section: "Merch & Store (#merch)" },
  { key: "merchItem_tshirt_grid_motkarta_tagline", label: "Produkt 03: Grid T-Shirt (Tagline)", section: "Merch & Store (#merch)" },
  { key: "merchItem_tshirt_nollpunkt_grid_title", label: "Produkt 04: Nollpunkt Grid T-Shirt (Titel)", section: "Merch & Store (#merch)" },
  { key: "merchItem_tshirt_nollpunkt_grid_tagline", label: "Produkt 04: Nollpunkt Grid T-Shirt (Tagline)", section: "Merch & Store (#merch)" },
  { key: "merchItem_tshirt_pin_shadow_title", label: "Produkt 05: Pin T-Shirt Skugga (Titel)", section: "Merch & Store (#merch)" },
  { key: "merchItem_tshirt_pin_shadow_tagline", label: "Produkt 05: Pin T-Shirt Skugga (Tagline)", section: "Merch & Store (#merch)" },
  { key: "merchItem_tshirt_radar_pink_title", label: "Produkt 06: Radar T-Shirt Rosa (Titel)", section: "Merch & Store (#merch)" },
  { key: "merchItem_tshirt_radar_pink_tagline", label: "Produkt 06: Radar T-Shirt Rosa (Tagline)", section: "Merch & Store (#merch)" },
  { key: "merchItem_tote_map_title", label: "Produkt 07: Kvarterskarta Tote (Titel)", section: "Merch & Store (#merch)" },
  { key: "merchItem_tote_map_tagline", label: "Produkt 07: Kvarterskarta Tote (Tagline)", section: "Merch & Store (#merch)" },
  { key: "merchItem_cap_white_title", label: "Produkt 08: Dad Cap Vit (Titel)", section: "Merch & Store (#merch)" },
  { key: "merchItem_cap_white_tagline", label: "Produkt 08: Dad Cap Vit (Tagline)", section: "Merch & Store (#merch)" },
  { key: "merchItem_cap_blue_black_pin_title", label: "Produkt 09: Dad Cap Kungsblå/Svart (Titel)", section: "Merch & Store (#merch)" },
  { key: "merchItem_cap_blue_black_pin_tagline", label: "Produkt 09: Dad Cap Kungsblå/Svart (Tagline)", section: "Merch & Store (#merch)" },
  { key: "merchItem_cap_blue_white_pin_title", label: "Produkt 10: Dad Cap Kungsblå/Vit (Titel)", section: "Merch & Store (#merch)" },
  { key: "merchItem_cap_blue_white_pin_tagline", label: "Produkt 10: Dad Cap Kungsblå/Vit (Tagline)", section: "Merch & Store (#merch)" },
  { key: "merchItem_poster_map_title", label: "Produkt 11: Konstposter (Titel)", section: "Merch & Store (#merch)" },
  { key: "merchItem_poster_map_tagline", label: "Produkt 11: Konstposter (Tagline)", section: "Merch & Store (#merch)" },
  { key: "merchItem_stickers_pack_title", label: "Produkt 12: Stickers 3-Pack (Titel)", section: "Merch & Store (#merch)" },
  { key: "merchItem_stickers_pack_tagline", label: "Produkt 12: Stickers 3-Pack (Tagline)", section: "Merch & Store (#merch)" },

  // Principles ([Principles] & Manifest)
  { key: "principlesHeading", label: "Principer: Huvudrubrik", section: "Principer ([Principles])" },
  { key: "onboardingBadge", label: "Principer: Modal Ögonbryn", section: "Principer ([Principles])" },
  { key: "onboardingSubtitle", label: "Principer: Modal Underrubrik", section: "Principer ([Principles])", multiline: true },
  { key: "onboardingBannerCaption", label: "Principer: Banner Bildtext", section: "Principer ([Principles])" },
  { key: "principle1", label: "Inline Princip 1: Ingen betald ranking", section: "Principer ([Principles])", multiline: true },
  { key: "principle2", label: "Inline Princip 2: Recensionsvolym", section: "Principer ([Principles])", multiline: true },
  { key: "principle3", label: "Inline Princip 3: Klickpopularitet", section: "Principer ([Principles])", multiline: true },
  { key: "principle1Title", label: "Panel 1: Motström (Rubrik)", section: "Principer ([Principles])" },
  { key: "principle1Tagline", label: "Panel 1: Tagline", section: "Principer ([Principles])" },
  { key: "principle1Desc", label: "Panel 1: Beskrivning", section: "Principer ([Principles])", multiline: true },
  { key: "principle2Title", label: "Panel 2: Auditerbar Data (Rubrik)", section: "Principer ([Principles])" },
  { key: "principle2Tagline", label: "Panel 2: Tagline", section: "Principer ([Principles])" },
  { key: "principle2Desc", label: "Panel 2: Beskrivning", section: "Principer ([Principles])", multiline: true },
  { key: "principle3Title", label: "Panel 3: Öppen Grunddata (Rubrik)", section: "Principer ([Principles])" },
  { key: "principle3Tagline", label: "Panel 3: Tagline", section: "Principer ([Principles])" },
  { key: "principle3Desc", label: "Panel 3: Beskrivning", section: "Principer ([Principles])", multiline: true },
  { key: "principle4Title", label: "Panel 4: Nollpunkt (Rubrik)", section: "Principer ([Principles])" },
  { key: "principle4Tagline", label: "Panel 4: Tagline", section: "Principer ([Principles])" },
  { key: "principle4Desc", label: "Panel 4: Beskrivning", section: "Principer ([Principles])", multiline: true },
  { key: "principle5Title", label: "Panel 5: Stockholm Bord för Bord (Rubrik)", section: "Principer ([Principles])" },
  { key: "principle5Tagline", label: "Panel 5: Tagline", section: "Principer ([Principles])" },
  { key: "principle5Desc", label: "Panel 5: Beskrivning", section: "Principer ([Principles])", multiline: true },
  { key: "principle6Title", label: "Panel 6: Privatsynk & QR (Rubrik)", section: "Principer ([Principles])" },
  { key: "principle6Tagline", label: "Panel 6: Tagline", section: "Principer ([Principles])" },
  { key: "principle6Desc", label: "Panel 6: Beskrivning", section: "Principer ([Principles])", multiline: true },
  { key: "onboardingExploreMap", label: "Principer: Utforska Kartan knapp", section: "Principer ([Principles])" },
  { key: "onboardingAskConcierge", label: "Principer: Fråga Conciergen knapp", section: "Principer ([Principles])" },
  { key: "onboardingSyncDevices", label: "Principer: Synka Enheter knapp", section: "Principer ([Principles])" },

  // Footer
  { key: "footerLeft", label: "Fotnot: Vänster text", section: "Sidfot (Footer)" },
  { key: "footerRight", label: "Fotnot: Höger text", section: "Sidfot (Footer)" },
];

export function readStoredCmsOverrides(): CmsOverrides {
  if (typeof window === "undefined") {
    return { sv: {}, en: {} };
  }
  try {
    const raw = localStorage.getItem(CMS_STORAGE_KEY);
    if (!raw) return { sv: {}, en: {} };
    const parsed = JSON.parse(raw);
    return {
      sv: parsed?.sv && typeof parsed.sv === "object" ? parsed.sv : {},
      en: parsed?.en && typeof parsed.en === "object" ? parsed.en : {},
    };
  } catch {
    return { sv: {}, en: {} };
  }
}

export function writeStoredCmsOverrides(overrides: CmsOverrides): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CMS_STORAGE_KEY, JSON.stringify(overrides));
    if (typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("motkarta-cms-update", { detail: overrides }));
    }
  } catch {}
}

export function readStoredCmsEditMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(CMS_EDIT_MODE_KEY) === "true";
  } catch {
    return false;
  }
}

export function readStoredMerchItems(defaultItems: MerchItem[]): MerchItem[] {
  if (typeof window === "undefined") {
    return defaultItems;
  }
  try {
    const raw = localStorage.getItem(CMS_MERCH_STORAGE_KEY);
    if (!raw) return defaultItems;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as MerchItem[];
    }
    return defaultItems;
  } catch {
    return defaultItems;
  }
}

export function writeStoredMerchItems(items: MerchItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CMS_MERCH_STORAGE_KEY, JSON.stringify(items));
    if (typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("motkarta-merch-updated", { detail: items }));
    }
  } catch {}
}

export function resetStoredMerchItems(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CMS_MERCH_STORAGE_KEY);
    if (typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("motkarta-merch-updated", { detail: null }));
    }
  } catch {}
}

