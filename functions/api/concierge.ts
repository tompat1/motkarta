import { loadPlacesFromD1 } from "../../lib/place-records.ts";
import { isUserVisibleLifecycleState, scorePlace, type PlaceInput, type ScoredPlace } from "../../lib/scoring.ts";

type EventContext<Env> = {
  request: Request;
  env: Env;
};

type Env = {
  DB?: unknown;
};

export type StructuredFilters = {
  cuisines: string[];
  price_max: number | null;
  independent_preferred: boolean;
  tourist_centre: boolean;
  near_public_transport: boolean;
  dog_friendly?: boolean;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-cache",
};

export function extractStructuredFilters(query: string): StructuredFilters {
  const qLower = query.toLowerCase();

  const cuisines: string[] = [];
  const knownCuisines: Array<[string, string]> = [
    ["poland", "polish"],
    ["polish", "polish"],
    ["polska", "polish"],
    ["polsk", "polish"],
    ["pierogi", "polish"],
    ["eastern european", "eastern_european"],
    ["eastern european", "polish"],
    ["russian", "russian"],
    ["ukrainian", "ukrainian"],
    ["france", "french"],
    ["french", "french"],
    ["fransk", "french"],
    ["franskt", "french"],
    ["bistro", "bistro"],
    ["brasserie", "bistro"],
    ["sweden", "swedish"],
    ["swedish", "swedish"],
    ["svensk", "swedish"],
    ["husmanskost", "swedish"],
    ["italy", "italian"],
    ["italian", "italian"],
    ["italiensk", "italian"],
    ["italienska", "italian"],
    ["italienskt", "italian"],
    ["trattoria", "italian"],
    ["trattorias", "italian"],
    ["pizza", "pizza"],
    ["sushi", "sushi"],
    ["japan", "japanese"],
    ["japanese", "japanese"],
    ["japansk", "japanese"],
    ["japanska", "japanese"],
    ["japanskt", "japanese"],
    ["izakaya", "japanese"],
    ["yakitori", "japanese"],
    ["germany", "german"],
    ["german", "german"],
    ["austria", "austrian"],
    ["austrian", "austrian"],
    ["hungary", "hungarian"],
    ["hungarian", "hungarian"],
    ["goulash", "hungarian"],
    ["schnitzel", "schnitzel"],
    ["thai", "thai"],
    ["thailand", "thai"],
    ["thailändsk", "thai"],
    ["thailändskt", "thai"],
    ["indian", "indian"],
    ["india", "indian"],
    ["indisk", "indian"],
    ["indiska", "indian"],
    ["indiskt", "indian"],
    ["koreansk", "korean"],
    ["koreanska", "korean"],
    ["korean", "korean"],
    ["kinesisk", "chinese"],
    ["kinesiska", "chinese"],
    ["kinesiskt", "chinese"],
    ["chinese", "chinese"],
    ["vietnamesisk", "vietnamese"],
    ["vietnamesiska", "vietnamese"],
    ["vietnamese", "vietnamese"],
    ["coffee", "coffee"],
    ["kaffe", "coffee"],
    ["bakery", "bakery"],
    ["bageri", "bakery"],
    ["hantverksbageri", "bakery"],
    ["kardemummabulle", "bakery"],
    ["kardemumma", "bakery"],
    ["kanelbulle", "bakery"],
    ["kanelbullar", "bakery"],
    ["surdegsbröd", "bakery"],
    ["surdeg", "bakery"],
    ["sourdough", "bakery"],
    ["burger", "burger"],
    ["middle eastern", "middle_eastern"],
    ["mexican", "mexican"],
    ["mexikansk", "mexican"],
    ["mexikanska", "mexican"],
    ["mexico", "mexican"],
    ["tacos", "mexican"],
    ["tapas", "tapas"],
    ["tapas", "spanish"],
    ["spanish", "spanish"],
    ["spain", "spanish"],
    ["spansk", "spanish"],
    ["spanskt", "spanish"],
    ["paella", "spanish"],
    ["paella", "paella"],
    ["ramen", "ramen"],
  ];

  for (const [term, norm] of knownCuisines) {
    if (qLower.includes(term)) {
      cuisines.push(norm);
    }
  }

  let priceMax: number | null = null;
  if (["not expensive", "budget", "affordable", "cheap", "cheaply", "moderate", "rimligt pris", "billigt", "prisvärt", "överkomligt"].some((kw) => qLower.includes(kw))) {
    priceMax = 250;
  } else if (["fine dining", "expensive", "upscale", "avsmakningsmeny", "tasting menu"].some((kw) => qLower.includes(kw))) {
    priceMax = 800;
  }

  const independentPreferred = ["family-run", "family run", "family-owned", "independent", "local", "authentic", "small business", "familjeägd", "familjeägt", "oberoende", "handgjorda", "handgjord", "hantverks", "artisan"].some(
    (kw) => qLower.includes(kw),
  );

  const touristCentre = !["outside", "away from", "outer", "suburb", "outside the tourist centre", "not in center"].some(
    (kw) => qLower.includes(kw),
  );

  const nearPublicTransport = ["public transport", "metro", "tunnelbana", "station", "bus", "transit", "train"].some(
    (kw) => qLower.includes(kw),
  );

  const dogFriendly = ["dog", "dogs", "hund", "hundar", "hundvänlig", "hundvänligt", "tasstipset", "dog-friendly"].some(
    (kw) => qLower.includes(kw),
  );

  return {
    cuisines: [...new Set(cuisines)],
    price_max: priceMax,
    independent_preferred: independentPreferred,
    tourist_centre: touristCentre,
    near_public_transport: nearPublicTransport,
    dog_friendly: dogFriendly,
  };
}

export async function onRequestPost(context: EventContext<Env>) {
  let query = "";
  let customPlaces: PlaceInput[] | undefined;
  try {
    const body = (await context.request.json()) as { query?: string; places?: PlaceInput[] };
    query = body.query || "";
    if (Array.isArray(body.places) && body.places.length > 0) {
      customPlaces = body.places;
    }
  } catch {
    query = "";
  }

  return processConciergeQuery(query, context.env.DB, customPlaces);
}

export async function onRequestGet(context: EventContext<Env>) {
  const url = new URL(context.request.url);
  const query = url.searchParams.get("q") || url.searchParams.get("query") || "";
  return processConciergeQuery(query, context.env.DB);
}

export async function processConciergeQuery(
  query: string,
  db?: unknown,
  initialPlaces?: PlaceInput[],
) {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return Response.json(
      {
        query: "",
        structuredFilters: extractStructuredFilters(""),
        answer: "Please enter a location, cuisine, or requirement (e.g. 'cardamom bun in Södermalm').",
        recommendedPlaces: [],
        source: "empty",
      },
      { headers: jsonHeaders, status: 400 },
    );
  }

  let places: PlaceInput[] = initialPlaces ?? [];
  let dataSource = initialPlaces?.length ? "full_dataset" : "d1";

  if (!places.length && db) {
    try {
      const d1Places = await loadPlacesFromD1(db as Parameters<typeof loadPlacesFromD1>[0]);
      if (d1Places && d1Places.length > 0) {
        places = d1Places;
        dataSource = "d1";
      }
    } catch (err) {
      console.error("Concierge D1 fetch error:", err);
    }
  }

  if (!places.length) {
    return Response.json(
      {
        query: cleanQuery,
        structuredFilters: extractStructuredFilters(cleanQuery),
        answer: "The live Motkarta dataset is unavailable. No recommendations were generated.",
        recommendedPlaces: [],
        source: "unavailable",
        totalSearchSpace: 0,
      },
      { headers: jsonHeaders, status: 503 },
    );
  }

  const RAGResult = retrieveAndSynthesize(cleanQuery, places);

  return Response.json(
    {
      query: cleanQuery,
      structuredFilters: extractStructuredFilters(cleanQuery),
      answer: RAGResult.answer,
      recommendedPlaces: RAGResult.recommendedPlaces,
      source: dataSource,
      totalSearchSpace: places.length,
    },
    { headers: jsonHeaders },
  );
}

const CUISINE_ALIASES: Record<string, string[]> = {
  poland: ["polish", "poland", "polska", "polsk", "pierogi", "eastern_european", "eastern european"],
  polish: ["polish", "poland", "polska", "polsk", "pierogi", "eastern_european", "eastern european"],
  polska: ["polish", "poland", "polska", "polsk", "pierogi", "eastern_european", "eastern european"],
  polsk: ["polish", "poland", "polska", "polsk", "pierogi", "eastern_european"],
  pierogi: ["polish", "poland", "polska", "polsk", "pierogi", "eastern_european"],
  sweden: ["swedish", "sweden", "svensk", "husmanskost"],
  swedish: ["swedish", "sweden", "svensk", "husmanskost"],
  svensk: ["swedish", "sweden", "svensk", "husmanskost"],
  husmanskost: ["swedish", "husmanskost", "svensk"],
  italy: ["italian", "italy", "italiensk", "italienska", "pasta", "pizza", "trattoria"],
  italian: ["italian", "italy", "italiensk", "italienska", "pasta", "pizza", "trattoria"],
  italiensk: ["italian", "italy", "italiensk", "italienska", "pasta", "pizza", "trattoria"],
  italienska: ["italian", "italy", "italiensk", "italienska", "pasta", "pizza", "trattoria"],
  trattoria: ["italian", "trattoria", "trattorias", "pasta", "pizza"],
  trattorias: ["italian", "trattoria", "trattorias", "pasta", "pizza"],
  japan: ["japanese", "japan", "japansk", "japanska", "sushi", "ramen", "izakaya", "yakitori"],
  japanese: ["japanese", "japan", "japansk", "japanska", "sushi", "ramen", "izakaya", "yakitori"],
  japansk: ["japanese", "japan", "japansk", "japanska", "sushi", "ramen", "izakaya", "yakitori"],
  japanska: ["japanese", "japan", "japansk", "japanska", "sushi", "ramen", "izakaya", "yakitori"],
  izakaya: ["japanese", "japan", "izakaya", "yakitori"],
  yakitori: ["japanese", "japan", "izakaya", "yakitori"],
  mexico: ["mexican", "mexico", "mexikansk", "mexikanska", "tacos"],
  mexican: ["mexican", "mexico", "mexikansk", "mexikanska", "tacos"],
  mexikansk: ["mexican", "mexico", "mexikansk", "mexikanska", "tacos"],
  mexikanska: ["mexican", "mexico", "mexikansk", "mexikanska", "tacos"],
  tacos: ["mexican", "mexico", "mexikansk", "mexikanska", "tacos"],
  germany: ["german", "germany", "schnitzel", "austrian"],
  german: ["german", "germany", "schnitzel", "austrian"],
  austria: ["austrian", "austria", "schnitzel", "german"],
  austrian: ["austrian", "austria", "schnitzel", "german"],
  schnitzel: ["schnitzel", "german", "austrian", "czech"],
  french: ["french", "france", "fransk", "franskt", "bistro", "brasserie"],
  france: ["french", "france", "fransk", "franskt", "bistro", "brasserie"],
  fransk: ["french", "france", "fransk", "franskt", "bistro", "brasserie"],
  bistro: ["bistro", "french", "fransk", "brasserie"],
  hungary: ["hungarian", "hungary", "goulash", "austrian"],
  hungarian: ["hungarian", "hungary", "goulash", "austrian"],
  goulash: ["goulash", "hungarian", "austrian"],
  spanish: ["spanish", "spain", "spansk", "spanskt", "paella", "tapas"],
  spain: ["spanish", "spain", "spansk", "spanskt", "paella", "tapas"],
  spansk: ["spanish", "spain", "spansk", "spanskt", "paella", "tapas"],
  spanskt: ["spanish", "spain", "spansk", "spanskt", "paella", "tapas"],
  paella: ["paella", "spanish", "spansk", "spanskt", "tapas"],
  tapas: ["tapas", "spanish", "spansk", "spanskt", "paella"],
  thai: ["thai", "thailand", "thailändsk", "thailändskt"],
  thailändsk: ["thai", "thailand", "thailändsk", "thailändskt"],
  indian: ["indian", "india", "indisk", "indiska", "indiskt"],
  indisk: ["indian", "india", "indisk", "indiska", "indiskt"],
  korean: ["korean", "koreansk", "koreanska"],
  koreansk: ["korean", "koreansk", "koreanska"],
  chinese: ["chinese", "kinesisk", "kinesiska", "kinesiskt"],
  kinesisk: ["chinese", "kinesisk", "kinesiska", "kinesiskt"],
  vietnamese: ["vietnamese", "vietnamesisk", "vietnamesiska"],
  vietnamesisk: ["vietnamese", "vietnamesisk", "vietnamesiska"],
  kardemummabulle: ["bakery", "cardamom", "kardemumma", "fika"],
  kardemumma: ["bakery", "cardamom", "kardemumma", "fika"],
  surdegsbröd: ["bakery", "sourdough", "surdeg", "bread"],
  surdeg: ["bakery", "sourdough", "surdeg", "bread"],
  sourdough: ["bakery", "sourdough", "surdeg", "bread"],
  kanelbulle: ["bakery", "cinnamon", "fika"],
  kanelbullar: ["bakery", "cinnamon", "fika"],
};

function matchTokenWithAliases(token: string, target: string): boolean {
  if (target.includes(token)) return true;
  const aliases = CUISINE_ALIASES[token];
  if (aliases) {
    return aliases.some((alias) => target.includes(alias));
  }
  return false;
}

export function retrieveAndSynthesize(query: string, places: PlaceInput[]) {
  const structuredFilters = extractStructuredFilters(query);

  const qLower = query.toLowerCase();
  if (qLower.includes("add place") || qLower.includes("lägg till ställe") || qLower.includes("skapa ställe") || qLower.includes("nytt ställe")) {
    return {
      structuredFilters,
      answer: "SUPERPOWER_ACTION: add_place\n\n🎉 Superpower Aktiverad! Öppnar formuläret för att lägga till ett nytt oberoende ställe i kartan.",
      recommendedPlaces: [],
      hasDirectMatches: true,
      missingTerm: null,
    };
  }

  if (qLower.includes("add review") || qLower.includes("skriv recension") || qLower.includes("lämna recension") || qLower.includes("recension för")) {
    return {
      structuredFilters,
      answer: "SUPERPOWER_ACTION: add_review\n\n✍️ Superpower Aktiverad! Öppnar formuläret för att skriva en recension som inväntar verifiering.",
      recommendedPlaces: [],
      hasDirectMatches: true,
      missingTerm: null,
    };
  }

  if (qLower.includes("add photo") || qLower.includes("lägg till foto") || qLower.includes("ladda upp bild") || qLower.includes("lägg till bild")) {
    return {
      structuredFilters,
      answer: "SUPERPOWER_ACTION: add_photo\n\n📷 Superpower Aktiverad! Öppnar formuläret för att lägga till ett foto till ett ställe.",
      recommendedPlaces: [],
      hasDirectMatches: true,
      missingTerm: null,
    };
  }

  if (qLower.includes("rate place") || qLower.includes("ge betyg") || qLower.includes("betygsätt ställe") || qLower.includes("sätt betyg")) {
    return {
      structuredFilters,
      answer: "SUPERPOWER_ACTION: rate_place\n\n⭐ Superpower Aktiverad! Öppnar betygspanelen för ställen.",
      recommendedPlaces: [],
      hasDirectMatches: true,
      missingTerm: null,
    };
  }

  const stopWords = new Set([
    // English
    "and", "the", "for", "with", "from", "some", "best", "good", "great", "find",
    "where", "what", "want", "like", "near", "place", "places", "food", "eat",
    "get", "have", "looking",
    // Swedish
    "och", "den", "det", "ett", "att", "som", "har", "kan", "ska",
    "med", "bra", "för", "nära", "mig", "dig", "sin", "sina",
    "vara", "eller", "inte", "alla", "bästa", "hitta", "var",
    "deras", "här", "där", "ställe", "ställen", "mat", "äta",
    "vill",
  ]);
  const queryTokens = query
    .toLowerCase()
    .replace(/[,.!?()]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopWords.has(token));

  // Stockholm area names should not count as food tokens
  const areaNames = new Set([
    "södermalm", "söder", "vasastan", "vasastaden", "gamla", "stan",
    "zinkensdamm", "zinken", "kungsholmen", "östermalm", "ostermalm",
    "norrmalm", "city", "djurgården", "birkastan", "hornstull",
    "skanstull", "mariatorget", "nytorget", "sofo", "odenplan",
    "fridhemsplan", "stureplan", "hötorget", "slussen", "medborgarplatsen",
    "stockholm", "stockholms",
  ]);

  // Intent/descriptor words that shouldn't be treated as food signals
  const intentWords = new Set([
    "tourist", "streets", "center", "centre", "busiest", "quiet",
    "cheap", "expensive", "independent", "local",
    // Swedish descriptors
    "familjeägd", "familjeägt", "oberoende", "handgjorda", "handgjord",
    "dolda", "pärlor", "pärla", "gömda", "gömd",
  ]);

  const foodSpecificTokens = queryTokens.filter(
    (t) => !intentWords.has(t) && !areaNames.has(t),
  );

  // ---- Kind inference: what type of place does the query expect? ----
  type ExpectedKind = "Restaurant" | "Bakery" | "Specialty coffee" | "Café" | null;
  let expectedKind: ExpectedKind = null;

  const bakerySignals = ["bageri", "bakery", "hantverksbageri", "kanelbulle", "kanelbullar", "surdegsbröd", "surdeg", "sourdough", "artisan bakery", "cinnamon bun", "cinnamon buns"];
  const restaurantSignals = ["pierogi", "tacos", "bistro", "trattoria", "trattorias", "restaurang", "restaurant", "middag", "dinner", "fine dining", "husmanskost", "pasta", "izakaya", "yakitori", "ramen"];
  const coffeeSignals = ["specialty coffee", "specialty", "kaffe", "rosteri", "roaster", "roastery"];
  const cafeSignals = ["café", "cafe", "fika"];

  const hasBakerySignal = bakerySignals.some((s) => qLower.includes(s));
  const hasRestaurantSignal = restaurantSignals.some((s) => qLower.includes(s));
  const hasCoffeeSignal = coffeeSignals.some((s) => qLower.includes(s));
  const hasCafeSignal = cafeSignals.some((s) => qLower.includes(s));

  // Only infer a single kind when the query is unambiguous
  const kindSignalCount = [hasBakerySignal, hasRestaurantSignal, hasCoffeeSignal, hasCafeSignal].filter(Boolean).length;
  if (kindSignalCount === 1) {
    if (hasBakerySignal) expectedKind = "Bakery";
    else if (hasRestaurantSignal) expectedKind = "Restaurant";
    else if (hasCoffeeSignal) expectedKind = "Specialty coffee";
    else if (hasCafeSignal) expectedKind = "Café";
  }
  // Special case: "specialty coffee och kardemummabulle" → both coffee and bakery → no kind penalty
  // (kindSignalCount > 1 → expectedKind stays null)

  // ---- Intent detection ----
  const isHiddenGemQuery = ["dolda pärlor", "dold pärla", "gömda pärlor", "hidden gems", "hidden gem", "off the beaten path"].some((kw) => qLower.includes(kw));
  const isDinnerQuery = ["middag", "dinner", "kvällsmat", "evening meal"].some((kw) => qLower.includes(kw));

  const asksAwayFromTourist = ["away from", "outside", "tourist", "hidden", "quiet", "off the beaten path", "suburb"].some((kw) => qLower.includes(kw));
  const isDogQuery = ["dog", "dogs", "hund", "hundar", "hundvänlig", "hundvänligt", "tasstipset", "dog-friendly"].some((kw) => query.toLowerCase().includes(kw));

  const scored: Array<{ place: ScoredPlace; ragScore: number }> = places
  .filter((place) => isUserVisibleLifecycleState(place.lifecycleState))
  .map((place) => {
    const scoredPlace = scorePlace(place);
    const searchTarget = [
      place.name,
      place.kind,
      place.area,
      place.cuisine ?? "",
      ...(place.tags ?? []),
      place.note ?? "",
      ...(place.discoveryReasons ?? []),
    ]
      .join(" ")
      .toLowerCase();

    let ragScore = 0;

    const isChain = [
      "nespresso",
      "kahls",
      "kahl's",
      "espresso house",
      "starbucks",
      "waynes coffee",
      "wayne's coffee",
      "bönor & blad",
      "bönor och blad",
    ].some((chain) => place.name.toLowerCase().includes(chain));

    if (isChain) {
      return { place: scoredPlace, ragScore: -9999 };
    }

    // 1. Food/Query Keyword Match with Alias Expansion
    const matchingFoodTokens = foodSpecificTokens.filter((token) => matchTokenWithAliases(token, searchTarget));
    if (foodSpecificTokens.length > 0) {
      if (matchingFoodTokens.length > 0) {
        ragScore += matchingFoodTokens.length * 40;
      } else {
        // Heavy penalty if query specified food tokens but this place matches NONE
        ragScore -= 100;
      }
    }

    // 2. Direct Cuisine Match
    if (structuredFilters.cuisines.some((c) => searchTarget.includes(c))) {
      ragScore += 50;
    }

    // Dog-friendly query match
    if (isDogQuery) {
      const isDogFriendly =
        searchTarget.includes("dog friendly") ||
        searchTarget.includes("hundvänligt") ||
        searchTarget.includes("hundvänlig") ||
        searchTarget.includes("tasstipset") ||
        searchTarget.includes("dog bakery") ||
        place.tags?.some((t) => t.toLowerCase() === "dog friendly" || t.toLowerCase() === "hundvänligt");
      if (isDogFriendly) {
        ragScore += 60;
      } else {
        ragScore -= 40;
      }
    }

    // 3. Specialty Coffee Verification Gate (Rule #1)
    const isSpecialtyQuery =
      queryTokens.includes("specialty") || queryTokens.includes("coffee") || queryTokens.includes("roaster") || queryTokens.includes("roastery");
    const isGrillOrRestaurant = [
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
    ].some((kw) => searchTarget.includes(kw));

    const isVerifiedSpecialty =
      !isGrillOrRestaurant &&
      (place.specialty?.specialtyVerified ||
        searchTarget.includes("roaster") ||
        searchTarget.includes("roastery") ||
        searchTarget.includes("rosteri") ||
        ["pascal", "drop coffee", "johan & nyström", "johan & nystrom", "johan och nyström", "solkant", "volca", "lykke", "höga kusten", "gast", "muttley", "nordic brew lab", "a.b.café", "ab cafe", "standout", "café blom", "cafe blom"].some((name) =>
          place.name.toLowerCase().includes(name),
        ) ||
        place.tags?.some((t) =>
          [
            "own roastery",
            "roastery",
            "roaster",
            "single origin",
            "filter",
            "beans",
            "v60",
            "aeropress",
          ].includes(t.toLowerCase()),
        ) ||
        (place.kind === "Specialty coffee" && scoredPlace.scores.quality >= 35));

    if (isSpecialtyQuery) {
      if (isVerifiedSpecialty) {
        ragScore += 80;
      } else {
        ragScore -= 60;
      }
    }

    // Heavy penalty for coffee places / cafes on explicit non-coffee food queries
    const isCoffeeOrBakeryPlace = place.kind === "Specialty coffee" || place.kind === "Café" || isVerifiedSpecialty;
    const isExplicitNonCoffeeQuery =
      foodSpecificTokens.length > 0 &&
      !isSpecialtyQuery &&
      !queryTokens.some((t) => ["fika", "coffee", "kaffe", "bun", "bakery", "bageri", "pastry", "breakfast", "frukost"].includes(t));

    if (isExplicitNonCoffeeQuery && isCoffeeOrBakeryPlace) {
      ragScore -= 500;
    }

    // 4. Cardamom Bun / Bakery match points (Swedish + English)
    const isCardamomBakeryQuery = ["cardamom", "kardemummabulle", "kardemumma", "bun", "bakery", "bageri",
      "hantverksbageri", "kanelbulle", "kanelbullar", "surdegsbröd", "surdeg", "sourdough",
      "cinnamon bun", "cinnamon buns", "artisan bakery"].some((t) => qLower.includes(t));
    if (isCardamomBakeryQuery) {
      if (
        searchTarget.includes("cardamom") ||
        searchTarget.includes("kardemumma") ||
        searchTarget.includes("kanelbulle") ||
        searchTarget.includes("surdeg") ||
        searchTarget.includes("sourdough") ||
        place.kind === "Bakery" ||
        searchTarget.includes("bakery") ||
        searchTarget.includes("bageri") ||
        searchTarget.includes("fika")
      ) {
        ragScore += 25;
      }
    }

    // 4b. Kind mismatch penalty
    if (expectedKind && place.kind !== expectedKind) {
      // Allow Café to pass when expecting Bakery (cafés often serve pastries)
      const isCompatible =
        (expectedKind === "Bakery" && place.kind === "Café") ||
        (expectedKind === "Café" && place.kind === "Bakery") ||
        (expectedKind === "Specialty coffee" && place.kind === "Café");
      if (!isCompatible) {
        ragScore -= 200;
      }
    }

    // 5. Away from tourist streets bonus (ONLY if explicitly requested)
    if (asksAwayFromTourist) {
      if (!place.area.toLowerCase().includes("central") && (place.mainstreamExposure ?? 50) < 75) {
        ragScore += 15;
      } else {
        ragScore -= 15;
      }
    }

    if (structuredFilters.independent_preferred) {
      ragScore += 5;
    }

    // Hidden gem intent boost
    if (isHiddenGemQuery && scoredPlace.hiddenGem.eligible) {
      ragScore += 40;
    } else if (scoredPlace.hiddenGem.eligible) {
      ragScore += 20;
    }

    // Dinner intent: penalize breakfast/fika-only places
    if (isDinnerQuery) {
      const isFikaOnly = (place.kind === "Bakery" || place.kind === "Café") &&
        !searchTarget.includes("dinner") && !searchTarget.includes("middag") && !searchTarget.includes("restaurant");
      if (isFikaOnly) {
        ragScore -= 100;
      }
    }

    // 6. Quality & Discovery base score (scaled to 15 max)
    ragScore += (scoredPlace.scores.quality / 100) * 15;
    ragScore += (scoredPlace.scores.discovery / 100) * 10;

    return {
      place: scoredPlace,
      ragScore,
    };
  });

  const isSpecialtyQuery =
    queryTokens.includes("specialty") || queryTokens.includes("coffee") || queryTokens.includes("roaster") || queryTokens.includes("roastery");
  const isExplicitNonCoffeeQuery =
    foodSpecificTokens.length > 0 &&
    !isSpecialtyQuery &&
    !queryTokens.some((t) => ["fika", "coffee", "kaffe", "bun", "bakery", "bageri", "pastry", "breakfast", "frukost"].includes(t));

  const validScored = scored.filter((item) => item.ragScore > 0);
  validScored.sort((a, b) => b.ragScore - a.ragScore);

  let candidatePool = validScored;
  if (!candidatePool.length) {
    const nonCoffeeScored = scored.filter((item) => {
      const isCoffee = item.place.kind === "Specialty coffee" || item.place.kind === "Café";
      return isExplicitNonCoffeeQuery ? !isCoffee : true;
    });
    nonCoffeeScored.sort((a, b) => b.ragScore - a.ragScore);
    candidatePool = nonCoffeeScored;
  }

  const topPicks = candidatePool.slice(0, 3).map((item) => item.place);

  const listItems = topPicks.map((pick) => {
    const reasons = (pick.discoveryReasons ?? [])
      .map((r) => r.trim().replace(/\.$/, ""))
      .filter(Boolean)
      .slice(0, 2);
    const reasonText = reasons.length ? reasons.join("; ") : "Matches discovery criteria";
    const hoursConf = pick.evidence?.confidence ? `${pick.evidence.confidence} confidence` : "Low (Unverified hours)";
    const priceConf = pick.priceLevel ? "Medium" : "Low (Price tier unverified)";
    const lastVerified = pick.lastUpdated ? pick.lastUpdated : (pick.scores?.freshness ? "Recently verified" : "Unspecified");

    return [
      `### **${pick.name}**`,
      `• **Why it matches**: ${reasonText} [Quality: ${Math.round(pick.scores.quality)}/100, Rec score: ${Math.round(pick.scores.recommendation)}/100]`,
      `• **Area / Location**: ${pick.area}`,
      `• **Verification breakdown**: ${pick.verification.summary}`,
      `• **Price confidence**: ${priceConf}`,
      `• **Opening-hours confidence**: ${hoursConf}`,
      `• **Data sources & License**: OpenStreetMap (ODbL), Stockholm Stad Open Data (CC0)`,
      `• **Last verified date**: ${lastVerified}`,
      `• **Missing/Uncertain info**: Price level and exact hours require live verification`,
    ].join("\n");
  });

  const introText = validScored.length
    ? `Based on our auditable open dataset of independent Stockholm establishments, here are the top grounded recommendations for "${query}":`
    : `CLARIFICATION_NEEDED: Vi hittade inga direkt verifierade rätter eller ställen för "${query}" i vårt dataset ännu. Vilket land eller kök är maträtten ifrån?`;

  const answer = [
    introText,
    "",
    listItems.join("\n\n"),
    "",
    "--- ETHICAL & TECHNICAL CHARTER ---",
    "• Unbiased & Plural: Open data based; lack of review count is never penalized.",
    "• Grounded Facts: Verifiable facts stay separate from discovery ranking rules.",
    "• Auditability & Corrections: Source attribution preserved; user & owner corrections supported.",
  ].join("\n");

  return {
    structuredFilters,
    answer,
    recommendedPlaces: topPicks.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      area: p.area,
      scores: p.scores,
      hiddenGem: p.hiddenGem,
      discoveryReasons: p.discoveryReasons,
    })),
  };
}
