import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const establishments = sqliteTable(
  "establishments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    type: text("type", {
      enum: ["Restaurant", "Bakery", "Café", "Specialty coffee"],
    }).notNull(),
    district: text("district").notNull(),
    description: text("description").notNull(),
    priceLevel: integer("price_level"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    chainStatus: text("chain_status", { enum: ["independent", "chain", "unknown"] })
      .default("unknown")
      .notNull(),
    osmType: text("osm_type"),
    osmId: text("osm_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("establishments_type_district_idx").on(table.type, table.district),
    uniqueIndex("establishments_osm_unique_idx").on(table.osmType, table.osmId),
  ],
);

export const evidenceSources = sqliteTable(
  "evidence_sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    establishmentId: integer("establishment_id")
      .notNull()
      .references(() => establishments.id, { onDelete: "cascade" }),
    sourceType: text("source_type", {
      enum: [
        "specialist_guide",
        "editorial",
        "verified_user_rating",
        "inspection",
        "serving_permit",
        "official_site",
        "community_submission",
        "osm",
      ],
    }).notNull(),
    sourceName: text("source_name").notNull(),
    url: text("url"),
    confidence: real("confidence").notNull(),
    capturedAt: text("captured_at").notNull(),
    summary: text("summary"),
  },
  (table) => [index("evidence_establishment_idx").on(table.establishmentId)],
);

export const establishmentTags = sqliteTable(
  "establishment_tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    establishmentId: integer("establishment_id")
      .notNull()
      .references(() => establishments.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (table) => [index("tags_establishment_idx").on(table.establishmentId)],
);

export const specialtyCoffeeAttributes = sqliteTable("specialty_coffee_attributes", {
  establishmentId: integer("establishment_id")
    .primaryKey()
    .references(() => establishments.id, { onDelete: "cascade" }),
  specialtyVerified: integer("specialty_verified", { mode: "boolean" }).notNull(),
  ownRoastery: integer("own_roastery", { mode: "boolean" }).notNull(),
  traceableCoffee: integer("traceable_coffee", { mode: "boolean" }).notNull(),
  filterCoffee: integer("filter_coffee", { mode: "boolean" }).notNull(),
  espressoBased: integer("espresso_based", { mode: "boolean" }).notNull(),
  rotatingRoasters: integer("rotating_roasters", { mode: "boolean" }).notNull(),
  singleOrigin: integer("single_origin", { mode: "boolean" }).notNull(),
  manualBrewMethodsJson: text("manual_brew_methods_json").notNull(),
  decafAvailable: integer("decaf_available", { mode: "boolean" }).notNull(),
  beansForSale: integer("beans_for_sale", { mode: "boolean" }).notNull(),
  verificationSources: integer("verification_sources").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const ratingSnapshots = sqliteTable(
  "rating_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    establishmentId: integer("establishment_id")
      .notNull()
      .references(() => establishments.id, { onDelete: "cascade" }),
    ratingAverage: real("rating_average").notNull(),
    reliableRatingCount: integer("reliable_rating_count").notNull(),
    reviewCount: integer("review_count").notNull(),
    categoryMeanRating: real("category_mean_rating").notNull(),
    capturedAt: text("captured_at").notNull(),
  },
  (table) => [index("ratings_establishment_idx").on(table.establishmentId)],
);

export const engagementSnapshots = sqliteTable(
  "engagement_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    establishmentId: integer("establishment_id")
      .notNull()
      .references(() => establishments.id, { onDelete: "cascade" }),
    searchImpressions: integer("search_impressions").notNull(),
    profileViews: integer("profile_views").notNull(),
    mapMarkerClicks: integer("map_marker_clicks").notNull(),
    saves: integer("saves").notNull(),
    directionRequests: integer("direction_requests").notNull(),
    confirmedVisits: integer("confirmed_visits").notNull(),
    repeatVisits: integer("repeat_visits").notNull(),
    recommendations: integer("recommendations").notNull(),
    recentSaves: integer("recent_saves").notNull(),
    windowStartedAt: text("window_started_at").notNull(),
    windowEndedAt: text("window_ended_at").notNull(),
  },
  (table) => [index("engagement_establishment_idx").on(table.establishmentId)],
);

/**
 * Event-level recommendation telemetry for debiased learning-to-rank.
 *
 * An impression is recorded for every displayed result, including results that
 * receive no later action. anonymousUserId is an application-generated,
 * rotating identifier; raw IP addresses and precise device fingerprints do not
 * belong in this table.
 */
export const recommendationEvents = sqliteTable(
  "recommendation_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    establishmentId: integer("establishment_id")
      .notNull()
      .references(() => establishments.id, { onDelete: "cascade" }),
    anonymousUserId: text("anonymous_user_id"),
    sessionId: text("session_id").notNull(),
    eventType: text("event_type", {
      enum: [
        "impression",
        "profile_view",
        "save",
        "direction_request",
        "confirmed_visit",
        "would_return",
        "dismiss",
      ],
    }).notNull(),
    resultPosition: integer("result_position"),
    recommendationMode: text("recommendation_mode").notNull(),
    queryContextJson: text("query_context_json"),
    modelVersion: text("model_version").notNull(),
    occurredAt: text("occurred_at").notNull(),
  },
  (table) => [
    index("recommendation_events_establishment_idx").on(table.establishmentId, table.occurredAt),
    index("recommendation_events_session_idx").on(table.sessionId, table.occurredAt),
    index("recommendation_events_model_idx").on(table.modelVersion, table.eventType),
  ],
);

export const scoreSnapshots = sqliteTable(
  "score_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    establishmentId: integer("establishment_id")
      .notNull()
      .references(() => establishments.id, { onDelete: "cascade" }),
    qualityScore: real("quality_score").notNull(),
    popularityScore: real("popularity_score").notNull(),
    relevanceScore: real("relevance_score").notNull(),
    discoveryScore: real("discovery_score").notNull(),
    freshnessScore: real("freshness_score").notNull(),
    recommendationScore: real("recommendation_score").notNull(),
    computedAt: text("computed_at").notNull(),
  },
  (table) => [index("scores_establishment_idx").on(table.establishmentId)],
);
