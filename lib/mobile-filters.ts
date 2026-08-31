import type { ScoredPlace } from "./scoring.ts";

export type Language = "sv" | "en";

export interface MobileFilterItem {
  id: string;
  labelSv: string;
  labelEn: string;
  tag: string;
}

export interface MobileFilterSection {
  id: string;
  titleSv: string;
  titleEn: string;
  items: MobileFilterItem[];
}

export const FILTER_SECTIONS: MobileFilterSection[] = [
  {
    id: "coffee",
    titleSv: "Filterkaffe & Specialkaffe",
    titleEn: "Filter Coffee & Specialty",
    items: [
      { id: "batch_brew", labelSv: "Batch Brew", labelEn: "Batch Brew", tag: "Filter" },
      { id: "hand_brew", labelSv: "Hand Brew", labelEn: "Hand Brew", tag: "Hand brew" },
      { id: "own_roastery", labelSv: "Eget rosteri", labelEn: "Own roastery", tag: "Own roastery" },
      { id: "single_origin", labelSv: "Single Origin", labelEn: "Single Origin", tag: "Single origin" },
    ],
  },
  {
    id: "drinks",
    titleSv: "Drycker & Kök",
    titleEn: "Drinks & Cuisines",
    items: [
      { id: "cold_brew", labelSv: "Kallbryggt / Nitro", labelEn: "Cold Brew/Drip", tag: "Cold brew" },
      { id: "decaf", labelSv: "Koffeinfritt / Decaf", labelEn: "Decaf Coffee", tag: "Decaf" },
      { id: "plant_milk", labelSv: "Växtbaserad mjölk", labelEn: "Plant-Based Milk", tag: "Oat milk" },
      { id: "craft_beer", labelSv: "Hantverksöl / Vin", labelEn: "Craft Beer / Wine", tag: "Wine" },
    ],
  },
  {
    id: "food",
    titleSv: "Mat & Tillfällen",
    titleEn: "Food & Occasions",
    items: [
      { id: "breakfast", labelSv: "Frukost / Brunch", labelEn: "Breakfast", tag: "Breakfast" },
      { id: "lunch", labelSv: "Lunch & Middag", labelEn: "Lunch", tag: "Lunch" },
      { id: "pizza", labelSv: "Pizza & Surdeg", labelEn: "Pizza", tag: "Pizza" },
      { id: "bakery", labelSv: "Fika & Bullar", labelEn: "Pastries & Fika", tag: "Cardamom bun" },
    ],
  },
  {
    id: "services",
    titleSv: "Tjänster & Faciliteter",
    titleEn: "Services",
    items: [
      { id: "wifi", labelSv: "Gratis Wi-Fi", labelEn: "Free Wi-Fi", tag: "Wi-Fi" },
      { id: "laptop", labelSv: "Laptop-vänligt", labelEn: "Laptop Friendly", tag: "Laptop friendly" },
      { id: "cards", labelSv: "Kortbetalning", labelEn: "Credit Cards", tag: "Cards" },
      { id: "vegan", labelSv: "Veganska alternativ", labelEn: "Vegan Options", tag: "Vegan options" },
      { id: "kids", labelSv: "Barnvänligt", labelEn: "Kids Friendly", tag: "Family" },
      { id: "dog", labelSv: "Hundvänligt", labelEn: "Dog Friendly", tag: "Dog friendly" },
      { id: "outdoor", labelSv: "Uteservering", labelEn: "Outdoor Seating", tag: "Outdoor seating" },
      { id: "wheelchair", labelSv: "Rullstolsanpassat", labelEn: "Wheelchair Access", tag: "Accessible" },
    ],
  },
];

export function formatDistance(distKm: number, _lang: Language = "sv"): string {
  if (distKm === Number.POSITIVE_INFINITY || isNaN(distKm)) return "";
  if (distKm < 1) {
    return `${Math.round(distKm * 1000)} m`;
  }
  return `${distKm.toFixed(1)} km`;
}

export function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceFromPoint(
  place: { latitude?: number; longitude?: number },
  center: { latitude: number; longitude: number } = { latitude: 59.3293, longitude: 18.0686 }
) {
  if (typeof place.latitude !== "number" || typeof place.longitude !== "number") {
    return Number.POSITIVE_INFINITY;
  }

  const earthRadius = 6371;
  const latDelta = degreesToRadians(place.latitude - center.latitude);
  const lonDelta = degreesToRadians(place.longitude - center.longitude);
  const startLat = degreesToRadians(center.latitude);
  const endLat = degreesToRadians(place.latitude);
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(lonDelta / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
}
