import type { EstablishmentType } from "./scoring.ts";

export type OsmFoodPlaceRow = {
  osm_type: string;
  osm_id: string;
  name: string;
  category: string;
  cuisine?: string;
  opening_hours?: string;
  street?: string;
  house_number?: string;
  website?: string;
  latitude?: string;
  longitude?: string;
  source?: string;
};

const restaurantCategories = new Set(["restaurant", "fast_food", "food_court", "bistro", "bar", "pub"]);
const bakeryCategories = new Set(["bakery", "pastry", "confectionery"]);
const specialtyCoffeeCategories = new Set(["coffee_roaster", "coffee"]);

export function normalizeOsmEstablishmentType(row: Pick<OsmFoodPlaceRow, "category" | "cuisine">):
  | EstablishmentType
  | null {
  const category = row.category.trim().toLowerCase();
  const cuisine = row.cuisine?.trim().toLowerCase() ?? "";

  if (specialtyCoffeeCategories.has(category)) {
    return "Specialty coffee";
  }

  if (bakeryCategories.has(category)) {
    return "Bakery";
  }

  if (restaurantCategories.has(category)) {
    return "Restaurant";
  }

  if (category === "cafe") {
    return "Café";
  }

  return null;
}

export function osmTags(row: OsmFoodPlaceRow) {
  const tags = new Set<string>();
  const category = row.category.trim();
  const cuisine = row.cuisine?.trim();

  if (category) {
    tags.add(titleCase(category.replaceAll("_", " ")));
  }

  if (cuisine) {
    cuisine
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4)
      .forEach((item) => tags.add(titleCase(item.replaceAll("_", " "))));
  }

  if (row.website?.trim()) {
    tags.add("Website");
  }

  if (row.opening_hours?.trim()) {
    tags.add("Opening hours");
  }

  return [...tags];
}

export function osmAddress(row: OsmFoodPlaceRow) {
  return [row.street, row.house_number].filter(Boolean).join(" ").trim();
}

export function osmDescription(row: OsmFoodPlaceRow, type: EstablishmentType) {
  const address = osmAddress(row);
  const suffix = address ? ` at ${address}` : "";

  return `${type} imported from OpenStreetMap${suffix}. Needs source enrichment before quality scoring.`;
}

export function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
