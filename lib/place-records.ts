import type { Confidence, EstablishmentType, PlaceInput, PlaceLifecycleState, SpecialtyAttributes } from "./scoring.ts";

type D1Database = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
    };
    all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  };
};

export type PlaceRow = {
  id: number;
  name: string;
  type: EstablishmentType;
  district: string;
  description: string;
  address: string | null;
  website: string | null;
  price_level: number | null;
  latitude: number | null;
  longitude: number | null;
  chain_status: string;
  lifecycle_state: PlaceLifecycleState | null;
  validation_label: PlaceInput["validationLabel"] | null;
  validation_notes: string | null;
  rating_average: number | null;
  reliable_rating_count: number | null;
  review_count: number | null;
  category_mean_rating: number | null;
  search_impressions: number | null;
  profile_views: number | null;
  map_marker_clicks: number | null;
  saves: number | null;
  direction_requests: number | null;
  confirmed_visits: number | null;
  repeat_visits: number | null;
  recommendations: number | null;
  recent_saves: number | null;
  latest_rating_at: string | null;
  latest_engagement_at: string | null;
  specialty_verified: number | null;
  own_roastery: number | null;
  traceable_coffee: number | null;
  filter_coffee: number | null;
  espresso_based: number | null;
  rotating_roasters: number | null;
  single_origin: number | null;
  manual_brew_methods_json: string | null;
  decaf_available: number | null;
  beans_for_sale: number | null;
  verification_sources: number | null;
};

export type EvidenceRow = {
  establishment_id: number;
  source_type: string;
  source_name: string;
  confidence: number;
  captured_at: string;
};

export type TagRow = {
  establishment_id: number;
  tag: string;
};

const CUISINE_TAGS = new Map([
  ["american", "american"],
  ["asian", "asian"],
  ["austrian", "austrian"],
  ["bistro", "bistro"],
  ["burger", "burger"],
  ["burgers", "burger"],
  ["cafe", "cafe"],
  ["café", "cafe"],
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
  ["seafood", "seafood"],
  ["spanish", "spanish"],
  ["sushi", "sushi"],
  ["swedish", "swedish"],
  ["tapas", "tapas"],
  ["thai", "thai"],
  ["vietnamese", "vietnamese"],
]);

export const placeQuery = `
  SELECT
    e.id,
    e.name,
    e.type,
    e.district,
    e.description,
    e.address,
    e.website,
    e.price_level,
    e.latitude,
    e.longitude,
    e.chain_status,
    e.lifecycle_state,
    e.validation_label,
    e.validation_notes,
    r.rating_average,
    r.reliable_rating_count,
    r.review_count,
    r.category_mean_rating,
    r.captured_at AS latest_rating_at,
    g.search_impressions,
    g.profile_views,
    g.map_marker_clicks,
    g.saves,
    g.direction_requests,
    g.confirmed_visits,
    g.repeat_visits,
    g.recommendations,
    g.recent_saves,
    g.window_ended_at AS latest_engagement_at,
    s.specialty_verified,
    s.own_roastery,
    s.traceable_coffee,
    s.filter_coffee,
    s.espresso_based,
    s.rotating_roasters,
    s.single_origin,
    s.manual_brew_methods_json,
    s.decaf_available,
    s.beans_for_sale,
    s.verification_sources
  FROM establishments e
  LEFT JOIN rating_snapshots r
    ON r.id = (
      SELECT id FROM rating_snapshots
      WHERE establishment_id = e.id
      ORDER BY captured_at DESC, id DESC
      LIMIT 1
    )
  LEFT JOIN engagement_snapshots g
    ON g.id = (
      SELECT id FROM engagement_snapshots
      WHERE establishment_id = e.id
      ORDER BY window_ended_at DESC, id DESC
      LIMIT 1
    )
  LEFT JOIN specialty_coffee_attributes s
    ON s.establishment_id = e.id
  ORDER BY e.name ASC
`;

export const evidenceQuery = `
  SELECT establishment_id, source_type, source_name, confidence, captured_at
  FROM evidence_sources
  ORDER BY captured_at DESC, id DESC
`;

export const tagQuery = `
  SELECT establishment_id, tag
  FROM establishment_tags
  ORDER BY tag ASC
`;

export async function loadPlacesFromD1(db: D1Database): Promise<PlaceInput[]> {
  const [placeResult, evidenceResult, tagResult] = await Promise.all([
    db.prepare(placeQuery).all<PlaceRow>(),
    db.prepare(evidenceQuery).all<EvidenceRow>(),
    db.prepare(tagQuery).all<TagRow>(),
  ]);

  const rows = placeResult.results ?? [];
  if (!rows.length) {
    return [];
  }

  return rowsToPlaceInputs(
    rows,
    evidenceResult.results ?? [],
    tagResult.results ?? [],
  );
}

export function rowsToPlaceInputs(
  rows: PlaceRow[],
  evidenceRows: EvidenceRow[] = [],
  tagRows: TagRow[] = [],
) {
  const evidenceByPlace = groupBy(evidenceRows, "establishment_id");
  const tagsByPlace = groupBy(tagRows, "establishment_id");

  return rows.map((row) =>
    rowToPlaceInput(row, evidenceByPlace.get(row.id) ?? [], tagsByPlace.get(row.id) ?? []),
  );
}

export function rowToPlaceInput(row: PlaceRow, evidenceRows: EvidenceRow[], tagRows: TagRow[]): PlaceInput {
  const sourceTypes = new Set(evidenceRows.map((row) => row.source_type));
  const latestEvidenceDate = latestDate([
    row.latest_rating_at,
    row.latest_engagement_at,
    ...evidenceRows.map((evidence) => evidence.captured_at),
  ]);
  const confidence = confidenceFromEvidence(evidenceRows);
  const tags = tagRows.map((row) => row.tag);
  const cuisines = cuisineFromTags(tags);

  return {
    id: row.id,
    name: row.name,
    kind: row.type,
    cuisine: cuisines.length ? cuisines.join(";") : undefined,
    area: row.district,
    address: row.address ?? undefined,
    note: row.description,
    tags: tags.length ? tags : fallbackTags(row),
    evidenceLabel: evidenceRows.length
      ? evidenceRows.slice(0, 3).map((evidence) => evidence.source_name).join(" · ")
      : "No source evidence yet",
    ratingAverage: row.rating_average ?? 4.1,
    reliableRatingCount: row.reliable_rating_count ?? 0,
    reviewCount: row.review_count ?? 0,
    categoryMeanRating: row.category_mean_rating ?? 4.1,
    categoryPopularityRaw: Math.log1p(row.review_count ?? 0),
    localPopularityPercentile: 0.5,
    priceLevel: row.price_level ?? 2,
    mainstreamExposure: mainstreamExposure(row),
    ageDays: 0,
    daysSinceFreshEvidence: daysSince(latestEvidenceDate),
    lifecycleState: row.lifecycle_state ?? "baseline",
    validationLabel: row.validation_label ?? undefined,
    validationNotes: row.validation_notes ?? undefined,
    evidence: {
      specialistGuide: sourceTypes.has("specialist_guide") ? 1 : 0,
      independentEditorial: sourceTypes.has("editorial") ? 1 : 0,
      verifiedUserRating: sourceTypes.has("verified_user_rating") ? 1 : 0,
      repeatVisits: row.repeat_visits ?? 0,
      recentReviews: Math.min(100, (row.reliable_rating_count ?? 0) / 10),
      credibleReviewers: Math.min(100, (row.reliable_rating_count ?? 0) / 12),
      inspectionStatus: sourceTypes.has("inspection") ? 100 : 60,
      verifiedAttributes: row.type === "Specialty coffee" && row.specialty_verified ? 90 : sourceTypes.size * 18,
      dataFreshness: Math.max(0, 100 - daysSince(latestEvidenceDate) / 3),
      confidence,
    },
    engagement: {
      searchImpressions: row.search_impressions ?? 0,
      profileViews: row.profile_views ?? 0,
      mapMarkerClicks: row.map_marker_clicks ?? 0,
      saves: row.saves ?? 0,
      directionRequests: row.direction_requests ?? 0,
      confirmedVisits: row.confirmed_visits ?? 0,
      repeatVisits: row.repeat_visits ?? 0,
      recommendations: row.recommendations ?? 0,
      recentSaves: row.recent_saves ?? 0,
    },
    specialty: specialtyFromRow(row),
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    website: row.website ?? undefined,
    x: coordinateToMapPosition(row.longitude, 17.75, 18.25),
    y: 100 - coordinateToMapPosition(row.latitude, 59.2, 59.47),
  };
}

function cuisineFromTags(tags: string[]) {
  const cuisines = new Set<string>();

  for (const tag of tags) {
    const normalized = normalizeCuisineTag(tag);
    const cuisine = CUISINE_TAGS.get(normalized);
    if (cuisine) {
      cuisines.add(cuisine);
    }
  }

  return [...cuisines];
}

function normalizeCuisineTag(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ");
}

function specialtyFromRow(row: PlaceRow): SpecialtyAttributes | undefined {
  if (row.type !== "Specialty coffee") {
    return undefined;
  }

  return {
    specialtyVerified: Boolean(row.specialty_verified),
    ownRoastery: Boolean(row.own_roastery),
    traceableCoffee: Boolean(row.traceable_coffee),
    filterCoffee: Boolean(row.filter_coffee),
    espressoBased: Boolean(row.espresso_based),
    rotatingRoasters: Boolean(row.rotating_roasters),
    singleOrigin: Boolean(row.single_origin),
    manualBrewMethods: safeJsonArray(row.manual_brew_methods_json),
    decafAvailable: Boolean(row.decaf_available),
    beansForSale: Boolean(row.beans_for_sale),
    verificationSources: row.verification_sources ?? 0,
  };
}

function fallbackTags(row: PlaceRow) {
  return [row.type, row.district, row.chain_status === "independent" ? "Independent" : ""].filter(Boolean);
}

function mainstreamExposure(row: PlaceRow) {
  const reviews = Math.min(100, Math.log1p(row.review_count ?? 0) * 11);
  const impressions = Math.min(100, Math.log1p(row.search_impressions ?? 0) * 9);
  return Math.round((reviews + impressions) / 2);
}

function confidenceFromEvidence(evidenceRows: EvidenceRow[]): Confidence {
  const evidenceCount = evidenceRows.length;
  const averageConfidence =
    evidenceRows.reduce((sum, row) => sum + row.confidence, 0) / Math.max(1, evidenceRows.length);

  if (evidenceCount >= 3 && averageConfidence >= 0.8) {
    return "High";
  }

  if (evidenceCount >= 1 && averageConfidence >= 0.55) {
    return "Medium";
  }

  return "Low";
}

function latestDate(values: Array<string | null>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

function daysSince(value?: string) {
  if (!value) {
    return 365;
  }

  return Math.max(0, Math.round((Date.now() - Date.parse(value)) / 86_400_000));
}

function coordinateToMapPosition(value: number | null, min: number, max: number) {
  if (value === null || Number.isNaN(value)) {
    return 50;
  }

  return Math.min(92, Math.max(8, ((value - min) / (max - min)) * 100));
}

function safeJsonArray(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function groupBy<T extends Record<K, string | number>, K extends keyof T>(rows: T[], key: K) {
  const map = new Map<T[K], T[]>();
  for (const row of rows) {
    map.set(row[key], [...(map.get(row[key]) ?? []), row]);
  }
  return map;
}
