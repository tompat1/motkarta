import type { PlaceInput } from "../../lib/scoring";
import { isBroadStockholmArea, resolveStockholmRegion } from "../../lib/stockholm-regions";

const EXCLUDED_COMMERCIAL_CHAINS = [
  "nespresso",
  "kahls",
  "kahl's",
  "espresso house",
  "starbucks",
  "wayne's coffee",
  "waynes coffee",
  "mcdonald",
  "burger king",
  "subway",
  "joe & the juice",
  "pressbyrån",
  "7-eleven",
  "7 eleven",
  "bönor & blad",
  "bönor och blad",
];

const PRIME_SPECIALTY_PATTERNS = [
  "pascal",
  "drop coffee",
  "johan & nyström",
  "johan & nystrom",
  "johan och nyström",
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

const RESTAURANT_GRILL_KEYWORDS = [
  "grill",
  "grillen",
  "gastropub",
  "pub",
  "bar",
  "restaurang",
  "restaurant",
  "burger",
  "burgers",
  "pizza",
  "pizzeria",
  "kebab",
  "sushi",
  "steakhouse",
  "taverna",
  "sportsbar",
];

export function sanitizeAndAugmentPlaces(inputPlaces: PlaceInput[]): PlaceInput[] {
  // 1. Purge commercial chains
  const filtered = inputPlaces.filter((p) => {
    const n = p.name.toLowerCase();
    return !EXCLUDED_COMMERCIAL_CHAINS.some((chain) => n.includes(chain));
  });

  // 2. Replace broad location buckets with more useful regions when the data supports it.
  const regionResolved = filtered.map((place) => {
    const resolvedArea = resolveStockholmRegion(place);
    if (resolvedArea === place.area) {
      return place;
    }

    return {
      ...place,
      area: resolvedArea,
      tags: Array.from(new Set([...place.tags.filter((tag) => !isBroadStockholmArea(tag)), resolvedArea])),
    };
  });

  // 3. Normalize and promote matched specialty coffee venues / reclassify grills & gastropubs
  const promoted = regionResolved.map((p) => {
    const n = p.name.toLowerCase();
    const cu = (p.cuisine ?? "").toLowerCase();
    const fullText = `${n} ${cu}`;

    const isGrillOrRestaurant = RESTAURANT_GRILL_KEYWORDS.some((kw) => fullText.includes(kw));

    if (isGrillOrRestaurant) {
      return {
        ...p,
        kind: "Restaurant" as const,
        tags: p.tags.filter((t) => t.toLowerCase() !== "specialty coffee"),
        specialty: undefined,
      };
    }

    const isPrime =
      PRIME_SPECIALTY_PATTERNS.some((spec) => n.includes(spec)) ||
      n.includes("roaster") ||
      n.includes("roastery") ||
      n.includes("rosteri");

    if (isPrime) {
      return {
        ...p,
        kind: "Specialty coffee" as const,
        tags: Array.from(new Set([...p.tags, "Specialty coffee", "Filter", "Single origin"])),
        specialty: {
          specialtyVerified: true,
          ownRoastery:
            n.includes("roaster") ||
            n.includes("roastery") ||
            n.includes("rosteri") ||
            p.specialty?.ownRoastery ||
            false,
          traceableCoffee: true,
          filterCoffee: true,
          espressoBased: true,
          rotatingRoasters: true,
          singleOrigin: true,
          manualBrewMethods: p.specialty?.manualBrewMethods ?? ["V60", "Batch brew"],
          decafAvailable: true,
          beansForSale: true,
          verificationSources: 3,
        },
      };
    }
    return p;
  });

  const result = [...promoted];

  // 5. Strict deduplication by ID and normalized name + area
  const seenIds = new Set<number>();
  const seenKeys = new Set<string>();
  const deduped: PlaceInput[] = [];

  for (const place of result) {
    if (seenIds.has(place.id)) {
      continue;
    }
    const key = `${place.name.toLowerCase().trim()}_${(place.area || "").toLowerCase().trim()}`;
    if (seenKeys.has(key)) {
      continue;
    }

    seenIds.add(place.id);
    seenKeys.add(key);
    deduped.push(place);
  }

  return deduped;
}
