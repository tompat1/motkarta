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
    ["pierogi", "polish"],
    ["eastern european", "eastern_european"],
    ["eastern european", "polish"],
    ["russian", "russian"],
    ["ukrainian", "ukrainian"],
    ["france", "french"],
    ["french", "french"],
    ["franskt", "french"],
    ["bistro", "bistro"],
    ["brasserie", "bistro"],
    ["sweden", "swedish"],
    ["swedish", "swedish"],
    ["husmanskost", "swedish"],
    ["italy", "italian"],
    ["italian", "italian"],
    ["pizza", "pizza"],
    ["sushi", "sushi"],
    ["japan", "japanese"],
    ["japanese", "japanese"],
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
    ["indian", "indian"],
    ["india", "indian"],
    ["coffee", "coffee"],
    ["bakery", "bakery"],
    ["burger", "burger"],
    ["middle eastern", "middle_eastern"],
    ["mexican", "mexican"],
    ["mexico", "mexican"],
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
  if (["not expensive", "budget", "affordable", "cheap", "cheaply", "moderate"].some((kw) => qLower.includes(kw))) {
    priceMax = 250;
  } else if (["fine dining", "expensive", "upscale"].some((kw) => qLower.includes(kw))) {
    priceMax = 800;
  }

  const independentPreferred = ["family-run", "family run", "independent", "local", "authentic", "small business"].some(
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
  poland: ["polish", "poland", "polska", "pierogi", "eastern_european", "eastern european"],
  polish: ["polish", "poland", "polska", "pierogi", "eastern_european", "eastern european"],
  polska: ["polish", "poland", "polska", "pierogi", "eastern_european", "eastern european"],
  pierogi: ["polish", "poland", "polska", "pierogi", "eastern_european"],
  sweden: ["swedish", "sweden", "svensk", "husmanskost"],
  swedish: ["swedish", "sweden", "svensk", "husmanskost"],
  italy: ["italian", "italy", "pasta", "pizza"],
  italian: ["italian", "italy", "pasta", "pizza"],
  japan: ["japanese", "japan", "sushi", "ramen"],
  japanese: ["japanese", "japan", "sushi", "ramen"],
  mexico: ["mexican", "mexico", "tacos"],
  mexican: ["mexican", "mexico", "tacos"],
  germany: ["german", "germany", "schnitzel", "austrian"],
  german: ["german", "germany", "schnitzel", "austrian"],
  austria: ["austrian", "austria", "schnitzel", "german"],
  austrian: ["austrian", "austria", "schnitzel", "german"],
  schnitzel: ["schnitzel", "german", "austrian", "czech"],
  french: ["french", "france", "franskt", "bistro", "brasserie"],
  france: ["french", "france", "franskt", "bistro", "brasserie"],
  bistro: ["bistro", "french", "brasserie"],
  hungary: ["hungarian", "hungary", "goulash", "austrian"],
  hungarian: ["hungarian", "hungary", "goulash", "austrian"],
  goulash: ["goulash", "hungarian", "austrian"],
  spanish: ["spanish", "spain", "spansk", "spanskt", "paella", "tapas"],
  spain: ["spanish", "spain", "spansk", "spanskt", "paella", "tapas"],
  spansk: ["spanish", "spain", "spansk", "spanskt", "paella", "tapas"],
  spanskt: ["spanish", "spain", "spansk", "spanskt", "paella", "tapas"],
  paella: ["paella", "spanish", "spansk", "spanskt", "tapas"],
  tapas: ["tapas", "spanish", "spansk", "spanskt", "paella"],
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

  const stopWords = new Set(["and", "the", "for", "with", "from", "some", "best", "good", "great", "find", "where", "what", "want", "like", "near", "place", "places", "food", "eat", "get", "have"]);
  const queryTokens = query
    .toLowerCase()
    .replace(/[,.!?()]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopWords.has(token));

  const foodSpecificTokens = queryTokens.filter(
    (t) => !["tourist", "streets", "center", "centre", "busiest", "quiet", "cheap", "expensive", "independent", "local"].includes(t),
  );

  const asksAwayFromTourist = ["away from", "outside", "tourist", "hidden", "quiet", "off the beaten path", "suburb"].some((kw) => query.toLowerCase().includes(kw));
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
        ragScore += 30;
      } else {
        ragScore -= 30;
      }
    }

    // Heavy penalty for coffee places / cafes on explicit non-coffee food queries
    const isCoffeeOrBakeryPlace = place.kind === "Specialty coffee" || place.kind === "Café" || isVerifiedSpecialty;
    const isExplicitNonCoffeeQuery =
      foodSpecificTokens.length > 0 &&
      !isSpecialtyQuery &&
      !queryTokens.some((t) => ["fika", "coffee", "bun", "bakery", "pastry", "breakfast"].includes(t));

    if (isExplicitNonCoffeeQuery && isCoffeeOrBakeryPlace) {
      ragScore -= 500;
    }

    // 4. Cardamom Bun / Bakery match points
    if (queryTokens.includes("cardamom") || queryTokens.includes("bun") || queryTokens.includes("bakery")) {
      if (
        searchTarget.includes("cardamom") ||
        place.kind === "Bakery" ||
        searchTarget.includes("bakery") ||
        searchTarget.includes("fika")
      ) {
        ragScore += 25;
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

    if (scoredPlace.hiddenGem.eligible) {
      ragScore += 20;
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
    !queryTokens.some((t) => ["fika", "coffee", "bun", "bakery", "pastry", "breakfast"].includes(t));

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
