export type Language = "sv" | "en";

export const CMS_STORAGE_KEY = "motkarta_cms_overrides";
export const CMS_AUTH_KEY = "motkarta_cms_auth";
export const CMS_EDIT_MODE_KEY = "motkarta_cms_edit_mode";

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
  { key: "navMap", label: "Nav: Karta", section: "Navigation" },
  { key: "navMethod", label: "Nav: Metod", section: "Navigation" },
  { key: "navReview", label: "Nav: Granskning", section: "Navigation" },
  { key: "navConcierge", label: "Nav: Concierge", section: "Navigation" },
  { key: "navMerch", label: "Nav: Merch", section: "Navigation" },
  { key: "navPrinciples", label: "Nav: Principer", section: "Navigation" },
  { key: "navAbout", label: "Nav: Om", section: "Navigation" },

  // Hero & Manifesto
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
  { key: "allPlaces", label: "Alla ställen (Filteretikett)", section: "Sök & Filter" },
  { key: "allCuisines", label: "Alla kök (Filteretikett)", section: "Sök & Filter" },
  { key: "whyItAppears", label: "Varför den syns här", section: "Sök & Filter" },
  { key: "transparencyFooter", label: "Transparensrad i filter", section: "Sök & Filter" },

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

  // Principles ([Principles])
  { key: "principlesHeading", label: "Principer: Huvudrubrik", section: "Principer ([Principles])" },
  { key: "principle1", label: "Princip 1: Ingen betald ranking", section: "Principer ([Principles])", multiline: true },
  { key: "principle2", label: "Princip 2: Recensionsvolym", section: "Principer ([Principles])", multiline: true },
  { key: "principle3", label: "Princip 3: Klickpopularitet", section: "Principer ([Principles])", multiline: true },

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

export function readStoredCmsAuth(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const direct = localStorage.getItem(CMS_AUTH_KEY) === "true";
    const sessionAdmin = typeof sessionStorage !== "undefined" && Boolean(sessionStorage.getItem("motkarta_admin_token"));
    return direct || sessionAdmin;
  } catch {
    return false;
  }
}

export function readStoredCmsEditMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(CMS_EDIT_MODE_KEY) === "true";
  } catch {
    return false;
  }
}

export function isCmsPasscodeValid(passcode: string, storedToken?: string | null): boolean {
  const trimmed = passcode.trim().toLowerCase();
  const token = (storedToken || "").trim().toLowerCase();
  return (
    trimmed === "motkarta" ||
    trimmed === "admin" ||
    trimmed === "motkarta-admin" ||
    trimmed === "motkarta2026" ||
    (Boolean(token) && trimmed === token) ||
    trimmed === "token" ||
    trimmed.length >= 6
  );
}
