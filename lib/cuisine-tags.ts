/** Canonical cuisine tags stored on establishments and used for map filters. */
const CUISINE_TAG_ALIASES = new Map<string, string>([
  ["american", "american"],
  ["asian", "asian"],
  ["austrian", "austrian"],
  ["belgian", "belgian"],
  ["belgiskt", "belgian"],
  ["belgisk", "belgian"],
  ["bistro", "bistro"],
  ["burger", "burger"],
  ["burgers", "burger"],
  ["cake", "cake"],
  ["chinese", "chinese"],
  ["coffee", "coffee"],
  ["coffee shop", "coffee shop"],
  ["deli", "deli"],
  ["eastern european", "eastern european"],
  ["fish", "seafood"],
  ["french", "french"],
  ["german", "german"],
  ["greek", "greek"],
  ["grill", "grill"],
  ["hamburger", "burger"],
  ["hamburgers", "burger"],
  ["hungarian", "hungarian"],
  ["indian", "indian"],
  ["italian", "italian"],
  ["japanese", "japanese"],
  ["kebab", "kebab"],
  ["korean", "korean"],
  ["lebanese", "lebanese"],
  ["mexican", "mexican"],
  ["middle eastern", "middle eastern"],
  ["pasta", "pasta"],
  ["pastry", "pastry"],
  ["patisserie", "patisserie"],
  ["pizza", "pizza"],
  ["polish", "polish"],
  ["ramen", "ramen"],
  ["regional", "regional"],
  ["salad", "salad"],
  ["sandwich", "sandwich"],
  ["scandinavian", "scandinavian"],
  ["seafood", "seafood"],
  ["spanish", "spanish"],
  ["sushi", "sushi"],
  ["swedish", "swedish"],
  ["tapas", "tapas"],
  ["thai", "thai"],
  ["vietnamese", "vietnamese"],
]);

export function normalizeCuisineTag(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ");
}

export function resolveCanonicalCuisine(value: string): string | null {
  const normalized = normalizeCuisineTag(value);
  if (!normalized) {
    return null;
  }
  return CUISINE_TAG_ALIASES.get(normalized) ?? null;
}

export function cuisinesFromTagList(tags: string[]): string {
  const cuisines = new Set<string>();
  for (const tag of tags) {
    const cuisine = resolveCanonicalCuisine(tag);
    if (cuisine) {
      cuisines.add(cuisine);
    }
  }
  return [...cuisines].sort().join(";");
}

export function parseCuisineInput(value: string): string[] {
  const cuisines = new Set<string>();
  for (const part of value.split(/[;,]/)) {
    const cuisine = resolveCanonicalCuisine(part);
    if (cuisine) {
      cuisines.add(cuisine);
    }
  }
  return [...cuisines].sort();
}

/** Normalized tag literals accepted in SQL `IN (...)` checks. */
export const canonicalCuisineTagLiterals = [...new Set(CUISINE_TAG_ALIASES.keys())].sort();

/** Display labels for admin pickers (canonical values). */
export const canonicalCuisineOptions = [...new Set(CUISINE_TAG_ALIASES.values())].sort((a, b) =>
  a.localeCompare(b, "en"),
);

export function cuisineFromTags(tags: string[]) {
  return cuisinesFromTagList(tags);
}
