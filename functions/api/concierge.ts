import { demoPlaces } from "../../lib/demo-places.ts";
import { loadPlacesFromD1 } from "../../lib/place-records.ts";
import { scorePlace, type PlaceInput, type ScoredPlace } from "../../lib/scoring.ts";

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
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-cache",
};

export function extractStructuredFilters(query: string): StructuredFilters {
  const qLower = query.toLowerCase();

  const cuisines: string[] = [];
  const knownCuisines: Array<[string, string]> = [
    ["polish", "polish"],
    ["eastern european", "eastern_european"],
    ["russian", "russian"],
    ["ukrainian", "ukrainian"],
    ["georgian", "georgian"],
    ["italian", "italian"],
    ["pizza", "pizza"],
    ["sushi", "sushi"],
    ["thai", "thai"],
    ["indian", "indian"],
    ["coffee", "coffee"],
    ["bakery", "bakery"],
    ["burger", "burger"],
    ["middle eastern", "middle_eastern"],
    ["mexican", "mexican"],
    ["tapas", "tapas"],
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

  return {
    cuisines,
    price_max: priceMax,
    independent_preferred: independentPreferred,
    tourist_centre: touristCentre,
    near_public_transport: nearPublicTransport,
  };
}

export async function onRequestPost(context: EventContext<Env>) {
  let query = "";
  try {
    const body = (await context.request.json()) as { query?: string };
    query = body.query || "";
  } catch {
    query = "";
  }

  return processConciergeQuery(query, context.env.DB);
}

export async function onRequestGet(context: EventContext<Env>) {
  const url = new URL(context.request.url);
  const query = url.searchParams.get("q") || url.searchParams.get("query") || "";
  return processConciergeQuery(query, context.env.DB);
}

export async function processConciergeQuery(query: string, db?: unknown) {
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

  let places: PlaceInput[] = demoPlaces;
  let dataSource = "demo";

  if (db) {
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

  const RAGResult = retrieveAndSynthesize(cleanQuery, places);

  return Response.json(
    {
      query: cleanQuery,
      structuredFilters: RAGResult.structuredFilters,
      answer: RAGResult.answer,
      recommendedPlaces: RAGResult.recommendedPlaces,
      source: dataSource,
    },
    { headers: jsonHeaders },
  );
}

export function retrieveAndSynthesize(query: string, places: PlaceInput[]) {
  const structuredFilters = extractStructuredFilters(query);
  const tokens = query
    .toLowerCase()
    .replace(/[,.]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);

  const scored: Array<{ place: ScoredPlace; ragScore: number }> = places.map((place) => {
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

    if (
      structuredFilters.cuisines.includes("eastern_european") &&
      ["polish", "russian", "ukrainian", "georgian", "eastern_european"].some((c) => searchTarget.includes(c))
    ) {
      ragScore += 5;
    }

    if (structuredFilters.cuisines.some((c) => searchTarget.includes(c))) {
      ragScore += 5;
    }

    const matches = tokens.filter((token) => searchTarget.includes(token)).length;
    ragScore += matches * 3;

    if (!structuredFilters.tourist_centre && !place.area.toLowerCase().includes("central")) {
      ragScore += 3;
    }

    if (structuredFilters.independent_preferred) {
      ragScore += 2;
    }

    const discoveryBonus = scoredPlace.scores.discovery / 100;
    const qualityBonus = scoredPlace.scores.quality / 100;
    ragScore += discoveryBonus + qualityBonus;

    return {
      place: scoredPlace,
      ragScore,
    };
  });

  scored.sort((a, b) => b.ragScore - a.ragScore);
  const topPicks = scored.slice(0, 3).map((item) => item.place);

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
      `• **Price confidence**: ${priceConf}`,
      `• **Opening-hours confidence**: ${hoursConf}`,
      `• **Data sources & License**: OpenStreetMap (ODbL), Stockholm Stad Open Data (CC0)`,
      `• **Last verified date**: ${lastVerified}`,
      `• **Missing/Uncertain info**: Price level and exact hours require live verification`,
    ].join("\n");
  });

  const answer = [
    `Based on our auditable open dataset of independent Stockholm establishments, here are the top grounded recommendations for "${query}":`,
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
      discoveryReasons: p.discoveryReasons,
    })),
  };
}
