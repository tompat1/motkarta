import type { PlaceInput } from "../../lib/scoring";

const FEATURED_CUISINES = [
  "husman",
  "pub",
  "spanish",
  "french",
  "mexican",
  "german",
  "polish",
  "hungarian",
  "austrian",
  "belgian",
  "italian",
  "pizza",
  "sushi",
  "burger",
  "thai",
  "asian",
  "indian",
  "japanese",
  "chinese",
];

const NON_CUISINE_OPTION_VALUES = new Set([
  "restaurant",
  "hotel",
  "coffee shop",
  "coffee_shop",
  "coffee",
  "kaffebar",
  "café",
  "cafe",
]);

export function cuisineParts(place: Pick<PlaceInput, "cuisine" | "tags"> & { name?: string }) {
  const parts = (place.cuisine ?? "")
    .split(";")
    .map((item) => {
      const trimmed = item.trim().toLowerCase();
      if (trimmed === "regional") return "swedish";
      if (trimmed === "belgiskt") return "belgian";
      if (trimmed === "husmanskost" || trimmed === "traditional swedish") return "husman";
      if (
        trimmed === "beer" ||
        trimmed === "beer bar" ||
        trimmed === "craft beer" ||
        trimmed === "gastropub" ||
        trimmed === "ölbar" ||
        trimmed === "öl" ||
        trimmed === "brewery" ||
        trimmed === "bryggeri"
      ) {
        return "pub";
      }
      return trimmed;
    })
    .filter((item) => item && !NON_CUISINE_OPTION_VALUES.has(item));

  const nameLower = place.name?.toLowerCase() ?? "";
  const tagsLower = place.tags?.map((t) => t.toLowerCase()) ?? [];
  const isBelgian =
    nameLower.includes("belgo") ||
    nameLower.includes("belgian") ||
    tagsLower.some((t) => t.includes("belgian") || t.includes("belgiskt") || t === "waffle" || t === "waffles");

  if (isBelgian && !parts.includes("belgian")) {
    parts.push("belgian");
  }

  const isMexican =
    nameLower.includes("taco") ||
    nameLower.includes("mexican") ||
    nameLower.includes("mexikansk") ||
    nameLower.includes("burrito") ||
    tagsLower.some((t) => t.includes("mexican") || t.includes("mexikansk") || t.includes("taco") || t.includes("burrito"));

  if (isMexican && !parts.includes("mexican")) {
    parts.push("mexican");
  }

  const isHusman =
    nameLower.includes("husman") ||
    tagsLower.some((t) => t.includes("husman") || t === "traditional swedish");

  if (isHusman && !parts.includes("husman")) {
    parts.push("husman");
  }

  const isPubOrBeer =
    tagsLower.some(
      (t) =>
        t === "pub" ||
        t === "beer" ||
        t === "beer bar" ||
        t === "craft beer" ||
        t === "gastropub" ||
        t === "ölbar" ||
        t === "ölkafé" ||
        t === "ölcafé" ||
        t === "ölhall" ||
        t === "brewery" ||
        t === "bryggeri",
    );

  if (isPubOrBeer && !parts.includes("pub")) {
    parts.push("pub");
  }

  return parts;
}

export function cuisineOptionsFromPlaces(places: PlaceInput[]) {
  const counts = new Map<string, number>();

  places.forEach((place) => {
    cuisineParts(place).forEach((item) => {
      if (NON_CUISINE_OPTION_VALUES.has(item)) {
        return;
      }
      counts.set(item, (counts.get(item) ?? 0) + 1);
    });
  });

  const available = new Set([...counts.keys()]);
  const featured = FEATURED_CUISINES.filter((c) => available.has(c));

  const sortedOthers = [...counts.entries()]
    .filter(([item]) => !FEATURED_CUISINES.includes(item))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([item]) => item);

  return [...new Set([...featured, ...sortedOthers])].slice(0, 24);
}

export function resolveCuisineFilter(cuisines: string[], availableOptions: string[]) {
  const aliases: Record<string, string[]> = {
    husman: ["husman", "husmanskost", "traditional swedish", "swedish comfort food"],
    pub: ["pub", "pubar", "beer", "beer bar", "craft beer", "gastropub", "öl", "ölbar", "ölbarer", "brewery", "bryggeri"],
    belgian: ["belgian", "belgisk", "belgiskt", "belgiska"],
    chinese: ["chinese", "kinesisk", "kinesiska", "kinesiskt"],
    french: ["french", "fransk", "franskt"],
    german: ["german", "tysk", "tyskt", "tyska"],
  };
  const normalizedOptions = availableOptions.map((option) => ({
    option,
    normalized: option.trim().toLowerCase().replaceAll("_", " "),
  }));

  for (const cuisine of cuisines) {
    const normalizedCuisine = cuisine.trim().toLowerCase().replaceAll("_", " ");
    const candidates = aliases[normalizedCuisine] ?? [normalizedCuisine];
    const match = normalizedOptions.find(({ normalized }) => candidates.includes(normalized));
    if (match) return match.option;
  }
  return undefined;
}
