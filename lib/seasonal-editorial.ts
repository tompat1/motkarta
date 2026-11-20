import type { PlaceInput } from "./scoring.ts";

export type StockholmSeason = "spring-summer" | "autumn" | "winter";

export type SeasonalThemeId =
  | "julbord"
  | "winter_warmth"
  | "spring_terraces"
  | "summer_waterfront"
  | "autumn_classics";

export type SeasonalThemeConfig = {
  id: SeasonalThemeId;
  themeLabel: { sv: string; en: string };
  kicker: { sv: string; en: string };
  description: { sv: string; en: string };
  ctaLabel: { sv: string; en: string };
  curatedVenueNames: readonly string[];
  fallbackKinds: readonly string[];
};

export const SEASONAL_HERO_IMAGES: Record<StockholmSeason, string> = {
  "spring-summer": "/motkarta-stockholm-editorial-hero.png",
  autumn: "/motkarta-stockholm-editorial-hero-autumn.jpg",
  winter: "/motkarta-stockholm-editorial-hero-winter.jpg",
};

/**
 * Maps a calendar date to Stockholm's three editorial visual seasons:
 * - Spring / Summer (Apr–Aug): outdoor seating & diners
 * - Autumn (Sep–Oct): golden autumn sun on facade, no outdoor seating
 * - Winter (Nov–Mar): bright winter sun & glittering snow on cobblestones
 */
export function getStockholmSeason(date: Date = new Date()): StockholmSeason {
  const month = date.getMonth() + 1; // 1..12
  if (month >= 4 && month <= 8) return "spring-summer";
  if (month === 9 || month === 10) return "autumn";
  return "winter";
}

export function getSeasonalHeroImage(season: StockholmSeason): string {
  return SEASONAL_HERO_IMAGES[season];
}

const SEASONAL_THEMES: Record<SeasonalThemeId, SeasonalThemeConfig> = {
  julbord: {
    id: "julbord",
    themeLabel: { sv: "Julbord", en: "Julbord" },
    kicker: {
      sv: "Säsongens urval · November & December",
      en: "Seasonal edit · November & December",
    },
    description: {
      sv: "Stockholms mest klassiska och hyllade julbord — riktiga ställen med levande katalogdata, inte reklam.",
      en: "Stockholm's most iconic and celebrated Swedish Christmas tables — real venues straight from our live catalog.",
    },
    ctaLabel: {
      sv: "Visa julbord på kartan",
      en: "Explore Julbord on map",
    },
    curatedVenueNames: [
      "Pelikan",
      "Den Gyldene Freden",
      "Operakällaren",
      "Gondolen",
      "Tennstopet",
      "Restaurang Tradition",
      "Prinsen",
      "Sturehof",
      "Restaurang Hasselbacken",
      "Ulla Winbladh",
      "Kvarnen",
      "Riche",
      "Hantverket",
      "Långholmens Wärdshus",
      "Blå Dörren",
      "Grodan",
      "Verandan",
    ],
    fallbackKinds: ["Restaurant"],
  },
  winter_warmth: {
    id: "winter_warmth",
    themeLabel: { sv: "Semlor & vintervärme", en: "Semlor & Winter Warmth" },
    kicker: {
      sv: "Säsongens urval · Januari & Februari",
      en: "Seasonal edit · January & February",
    },
    description: {
      sv: "Hantverksbagerier med nygräddade semlor och varma kvarterskrogar för kalla vinterdagar i Stockholm.",
      en: "Artisan bakeries with fresh semlor and warm neighborhood dining rooms for crisp Stockholm winter days.",
    },
    ctaLabel: {
      sv: "Visa vinterfavoriter på kartan",
      en: "Explore winter picks on map",
    },
    curatedVenueNames: [
      "Lillebrors Bageri",
      "Söderbergs bageri",
      "Valhallabageriet",
      "Tössebageriet",
      "Vete-Katten",
      "Bageri Petrus",
      "Pelikan",
      "Tennstopet",
      "Tranan",
      "Den Gyldene Freden",
    ],
    fallbackKinds: ["Bakery", "Restaurant", "Café"],
  },
  spring_terraces: {
    id: "spring_terraces",
    themeLabel: { sv: "Vårsol & uteserveringar", en: "Spring Sun & Terraces" },
    kicker: {
      sv: "Säsongens urval · Vår i Stockholm",
      en: "Seasonal edit · Spring in Stockholm",
    },
    description: {
      sv: "Första kaffen i vårsolen, morgonbagerier och kvarterskrogar där säsongen vaknar till liv.",
      en: "First coffees in the spring sun, neighborhood bakeries, and terraces waking up across Stockholm.",
    },
    ctaLabel: {
      sv: "Visa vårfavoriter på kartan",
      en: "Explore spring picks on map",
    },
    curatedVenueNames: [
      "Drop Coffee",
      "Café Pascal",
      "Lykke Kaffegårdar",
      "Rosendals Trädgård",
      "Gamla Orangeriet",
      "Bageri Petrus",
      "Bar Agrikultur",
      "Café Nizza",
    ],
    fallbackKinds: ["Specialty coffee", "Bakery", "Café", "Restaurant"],
  },
  summer_waterfront: {
    id: "summer_waterfront",
    themeLabel: { sv: "Sommar vid vattnet", en: "Summer by the Water" },
    kicker: {
      sv: "Säsongens urval · Sommar i Stockholm",
      en: "Seasonal edit · Summer in Stockholm",
    },
    description: {
      sv: "Långa ljusa kvällar vid kajer, parker och trädgårdar — riktiga smultronställen i hela staden.",
      en: "Long bright evenings by the water, parks, and garden tables — independent favorites across the city.",
    },
    ctaLabel: {
      sv: "Visa sommarställen på kartan",
      en: "Explore summer picks on map",
    },
    curatedVenueNames: [
      "Mälarpaviljongen",
      "Rosendals Trädgård",
      "Gamla Orangeriet",
      "Loopen Marina",
      "Gondolen",
      "Långholmens Wärdshus",
      "Ulla Winbladh",
      "Restaurang Hasselbacken",
    ],
    fallbackKinds: ["Restaurant", "Café"],
  },
  autumn_classics: {
    id: "autumn_classics",
    themeLabel: { sv: "Höstens klassiker & vinbarer", en: "Autumn Classics & Wine Bars" },
    kicker: {
      sv: "Säsongens urval · Höst i Stockholm",
      en: "Seasonal edit · Autumn in Stockholm",
    },
    description: {
      sv: "Levande ljus, mustig husmanskost och Stockholms bästa oberoende vinbarer när löven faller.",
      en: "Candlelit bistros, seasonal Swedish cooking, and Stockholm's finest independent wine bars.",
    },
    ctaLabel: {
      sv: "Visa höstfavoriter på kartan",
      en: "Explore autumn picks on map",
    },
    curatedVenueNames: [
      "Bar Agrikultur",
      "Café Nizza",
      "Savoj",
      "Hantverket",
      "Portal",
      "Lilla Ego",
      "Pelikan",
      "Restaurang Tradition",
      "Tennstopet",
    ],
    fallbackKinds: ["Restaurant"],
  },
};

export function getSeasonalTheme(date: Date = new Date()): SeasonalThemeConfig {
  const month = date.getMonth() + 1;
  if (month === 11 || month === 12) return SEASONAL_THEMES.julbord;
  if (month === 1 || month === 2) return SEASONAL_THEMES.winter_warmth;
  if (month >= 3 && month <= 5) return SEASONAL_THEMES.spring_terraces;
  if (month >= 6 && month <= 8) return SEASONAL_THEMES.summer_waterfront;
  return SEASONAL_THEMES.autumn_classics;
}

/**
 * Selects real catalog places matching the active seasonal theme.
 * Never invents fake venues — returns only live PlaceInput entries from `places`.
 */
export function selectSeasonalVenues(
  places: readonly PlaceInput[],
  theme: SeasonalThemeConfig,
  limit = 12,
): PlaceInput[] {
  if (!places.length || limit <= 0) return [];

  const matched: PlaceInput[] = [];
  const seenIds = new Set<number>();

  const byExactLower = new Map<string, PlaceInput>();
  for (const place of places) {
    const key = place.name.trim().toLowerCase();
    if (!byExactLower.has(key)) {
      byExactLower.set(key, place);
    }
  }

  for (const targetName of theme.curatedVenueNames) {
    if (matched.length >= limit) break;
    const normalized = targetName.trim().toLowerCase();
    let found = byExactLower.get(normalized);
    if (!found) {
      found = places.find(
        (place) => !seenIds.has(place.id) && place.name.trim().toLowerCase().includes(normalized),
      );
    }
    if (found && !seenIds.has(found.id)) {
      seenIds.add(found.id);
      matched.push(found);
    }
  }

  if (matched.length < Math.min(3, limit)) {
    const fallbackKinds = new Set(theme.fallbackKinds);
    for (const place of places) {
      if (matched.length >= Math.min(3, limit)) break;
      if (seenIds.has(place.id)) continue;
      if (fallbackKinds.size === 0 || fallbackKinds.has(place.kind)) {
        seenIds.add(place.id);
        matched.push(place);
      }
    }
  }

  return matched;
}

const NON_PHOTO_URL_PATTERN = /(?:logo|logga|logotyp|favicon|icon|sprite|close\.png|\/n\.png|tripadvisor|\.svg(?:$|\?))/i;

export function isEditorialFeaturePhotoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return false;
  return !NON_PHOTO_URL_PATTERN.test(trimmed);
}

/**
 * Infers orientation from common dimension suffixes in photo URLs
 * (e.g. `6240_4160`, `1152x1536`, `3840_5760`). Returns "portrait", "landscape", or "unknown".
 */
export function inferPhotoOrientation(url: string | null | undefined): "portrait" | "landscape" | "unknown" {
  if (!url) return "unknown";
  const match = url.match(/(?:_|-)(\d{3,4})[x_](\d{3,4})(?:\.|[/?&#]|$)/i);
  if (!match) return "unknown";
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return "unknown";
  return height > width * 1.05 ? "portrait" : "landscape";
}

/**
 * Picks either a single portrait photo or two landscape photos for the tall #1 editorial feature card.
 */
export function selectHeroFeaturePhotos(urls: readonly string[]): {
  mode: "portrait" | "landscape-stack" | "single";
  photos: string[];
} {
  const valid = urls.filter((url) => isEditorialFeaturePhotoUrl(url));
  if (valid.length === 0) return { mode: "single", photos: [] };
  const portrait = valid.find((url) => inferPhotoOrientation(url) === "portrait");
  if (portrait) return { mode: "portrait", photos: [portrait] };
  if (valid.length >= 2) return { mode: "landscape-stack", photos: valid.slice(0, 2) };
  return { mode: "single", photos: [valid[0]] };
}
