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
      title: lang === "sv" ? `Wi-Fi: ${wifi}` : `Wi-Fi: ${wifi}`,
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
