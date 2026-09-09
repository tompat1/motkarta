import type { PlaceInput } from "../../lib/scoring";

const FEATURED_CUISINES = [
  "spanish",
  "french",
  "mexican",
  "german",
  "polish",
  "hungarian",
  "austrian",
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

const NON_CUISINE_OPTION_VALUES = new Set(["restaurant", "hotel"]);

export function cuisineParts(place: Pick<PlaceInput, "cuisine" | "tags">) {
  return (place.cuisine ?? "")
    .split(";")
    .map((item) => {
      const trimmed = item.trim().toLowerCase();
      return trimmed === "regional" ? "swedish" : trimmed;
    })
    .filter(Boolean);
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
