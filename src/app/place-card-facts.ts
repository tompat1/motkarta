import { priceDisplay } from "../../lib/price-display.ts";
import type { ScoredPlace } from "../../lib/scoring.ts";
import type { Language } from "./shared.ts";

const WIFI_LABELS = [
  "Free Wi-Fi",
  "Wi-Fi free for customers",
  "Paid Wi-Fi",
  "No Wi-Fi",
  "Internet access (type unknown)",
  "Wi-Fi",
];

export type PlaceCardFact = {
  label: string;
  title: string;
  isPlaceholder: boolean;
};

export function openingHoursFact(place: Pick<ScoredPlace, "openingHours">, lang: Language): PlaceCardFact {
  const hours = place.openingHours?.trim();
  if (hours) {
    return {
      label: hours,
      title: lang === "sv" ? `Listade öppettider: ${hours}` : `Listed opening hours: ${hours}`,
      isPlaceholder: false,
    };
  }
  return {
    label: lang === "sv" ? "Öppettider okända" : "Hours unknown",
    title: lang === "sv" ? "Saknar verifierade öppettider" : "Verified opening hours are missing",
    isPlaceholder: true,
  };
}

export function priceFact(place: Pick<ScoredPlace, "priceSEK">, lang: Language): PlaceCardFact {
  const price = priceDisplay(place.priceSEK);
  if (price) {
    const label = price.amount ? `${price.symbol} · ${price.amount}` : price.symbol;
    return {
      label,
      title: `${lang === "sv" ? "Prisnivå" : "Price tier"} ${price.symbol}${price.amount ? ` (${price.amount})` : ""}`,
      isPlaceholder: false,
    };
  }
  return {
    label: lang === "sv" ? "Pris okänt" : "Price unknown",
    title: lang === "sv" ? "Saknar verifierad prisuppgift" : "Verified price information is missing",
    isPlaceholder: true,
  };
}

export function wifiFact(place: Pick<ScoredPlace, "tags">, lang: Language): PlaceCardFact {
  const tags = place.tags ?? [];
  const wifi = WIFI_LABELS.find((label) => tags.includes(label));
  if (wifi) {
    return {
      label: wifi,
      title: `Wi-Fi: ${wifi}`,
      isPlaceholder: false,
    };
  }
  return {
    label: lang === "sv" ? "Wi-Fi okänt" : "Wi-Fi unknown",
    title: lang === "sv" ? "Saknar verifierad Wi-Fi-uppgift" : "Verified Wi-Fi information is missing",
    isPlaceholder: true,
  };
}

export function visibleTagLabels(tags: string[]): string[] {
  return tags.filter((tag) => !WIFI_LABELS.includes(tag));
}

const NOISE_AND_SOURCE_TAGS = new Set([
  "openstreetmap",
  "opening hours",
  "curated",
  "central stockholm",
  "north stockholm",
  "south stockholm",
  "west stockholm",
  "stockholm",
  "local",
  "regional",
  "independent",
  "food",
  "place",
  "coffee shop",
  "café",
  "cafe",
  "restaurant",
  "restaurang",
  "bakery",
  "bageri",
  "södermalm",
  "norrmalm",
  "östermalm",
  "vasastan",
  "kungsholmen",
  "gamla stan",
  "djurgården",
  "norra djurgården",
  "söderort",
  "västerort",
  "norrort",
  "white guide",
  "white guide nordic",
  "guide michelin",
  "michelin",
  "burgerdudes",
  "sveriges bästa",
  "dn",
  "dn krog",
  "dn krogkommissionen",
  "dagens nyheter",
  "svd",
  "svd krog",
  "svd krogguiden",
  "svenska dagbladet",
  "specialty coffee sweden registry",
  "tasstipset",
  "anders husa",
  "anders husa & kaitlin orr",
  "husa guide",
  "visit stockholm",
  "spotted by locals",
  "spotted by locals stockholm",
  "allt om mat",
  "vagabond",
  "stora restaurangpriset",
  "svenska gastronomipriset",
  "world's 50 best discovery",
]);

const BILINGUAL_TAG_PAIRS: Array<{ keys: string[]; sv: string; en: string }> = [
  { keys: ["dog friendly", "hundvänligt", "hundvänlig"], sv: "Hundvänligt", en: "Dog friendly" },
  { keys: ["hidden gem", "hidden gems", "dold pärla", "dolda pärlor"], sv: "Dold pärla", en: "Hidden gem" },
];

/**
 * Returns clean, deduplicated, consumer-meaningful craft & venue attribute tags
 * (stripping internal pipeline metadata, districts, and reference source names
 * that are already shown as VerifiedSourceBadge pills).
 */
export function curatedAttributeTags(tags: string[], lang: Language = "sv", maxCount = 6): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of visibleTagLabels(tags)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (NOISE_AND_SOURCE_TAGS.has(lower)) continue;

    const bilingual = BILINGUAL_TAG_PAIRS.find((pair) => pair.keys.includes(lower));
    const display = bilingual ? bilingual[lang] : trimmed;
    const dedupeKey = bilingual ? bilingual.keys[0] : lower;
    if (seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    result.push(display);
    if (result.length >= maxCount) break;
  }

  return result;
}
