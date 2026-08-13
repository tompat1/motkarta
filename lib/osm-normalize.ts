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
const primeSpecialtyNames = [
  "pascal",
  "drop coffee",
  "johan & nyström",
  "johan och nyström",
  "johan",
  "solkant",
  "volca",
  "lykke",
  "höga kusten",
  "hoga kusten",
  "gast",
  "muttley",
  "nordic brew lab",
  "a.b.café",
  "ab cafe",
  "standout",
  "café blom",
  "cafe blom",
];

export function isPrimeSpecialtyCoffee(name: string = "", category: string = "", cuisine: string = ""): boolean {
  const n = name.trim().toLowerCase();
  const c = category.trim().toLowerCase();
  const cu = cuisine.trim().toLowerCase();
  if (primeSpecialtyNames.some((p) => n.includes(p))) return true;
  if (n.includes("roaster") || n.includes("roastery") || n.includes("rosteri")) return true;
  if (c.includes("roaster") || cu.includes("coffee_roaster")) return true;
  return false;
}

export function normalizeOsmEstablishmentType(row: Pick<OsmFoodPlaceRow, "category" | "cuisine"> & { name?: string }):
  | EstablishmentType
  | null {
  const name = row.name?.trim() ?? "";
  const category = row.category.trim().toLowerCase();
  const cuisine = row.cuisine?.trim().toLowerCase() ?? "";

  if (isPrimeSpecialtyCoffee(name, category, cuisine) || specialtyCoffeeCategories.has(category)) {
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

  if (row.name && (primeSpecialtyNames.some((p) => row.name.toLowerCase().includes(p)) || row.name.toLowerCase().includes("roaster") || row.name.toLowerCase().includes("roastery") || row.name.toLowerCase().includes("rosteri"))) {
    tags.add("Specialty coffee");
    tags.add("Single origin");
    tags.add("Filter");
    if (row.name.toLowerCase().includes("roaster") || row.name.toLowerCase().includes("roastery") || row.name.toLowerCase().includes("rosteri")) {
      tags.add("Own roastery");
    }
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
