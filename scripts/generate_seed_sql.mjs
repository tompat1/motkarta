import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { demoPlaces } from "../lib/demo-places.ts";

const output = resolve(process.argv[2] ?? "drizzle/seed-demo.sql");
const now = new Date().toISOString();

const lines = [
  "BEGIN TRANSACTION;",
  "DELETE FROM score_snapshots;",
  "DELETE FROM engagement_snapshots;",
  "DELETE FROM rating_snapshots;",
  "DELETE FROM specialty_coffee_attributes;",
  "DELETE FROM establishment_tags;",
  "DELETE FROM evidence_sources;",
  "DELETE FROM establishments;",
];

for (const place of demoPlaces) {
  lines.push(
    `INSERT INTO establishments (id, name, type, district, description, price_level, latitude, longitude, chain_status, osm_type, osm_id, created_at, updated_at) VALUES (${[
      place.id,
      sql(place.name),
      sql(place.kind),
      sql(place.area),
      sql(place.note),
      place.priceLevel,
      sql(null),
      sql(null),
      sql(place.tags.includes("Independent") ? "independent" : "unknown"),
      sql(null),
      sql(null),
      sql(now),
      sql(now),
    ].join(", ")});`,
  );

  for (const tag of place.tags) {
    lines.push(
      `INSERT INTO establishment_tags (establishment_id, tag) VALUES (${place.id}, ${sql(tag)});`,
    );
  }

  lines.push(
    `INSERT INTO rating_snapshots (establishment_id, rating_average, reliable_rating_count, review_count, category_mean_rating, captured_at) VALUES (${[
      place.id,
      place.ratingAverage,
      place.reliableRatingCount,
      place.reviewCount,
      place.categoryMeanRating,
      sql(now),
    ].join(", ")});`,
  );

  lines.push(
    `INSERT INTO engagement_snapshots (establishment_id, search_impressions, profile_views, map_marker_clicks, saves, direction_requests, confirmed_visits, repeat_visits, recommendations, recent_saves, window_started_at, window_ended_at) VALUES (${[
      place.id,
      place.engagement.searchImpressions,
      place.engagement.profileViews,
      place.engagement.mapMarkerClicks,
      place.engagement.saves,
      place.engagement.directionRequests,
      place.engagement.confirmedVisits,
      place.engagement.repeatVisits,
      place.engagement.recommendations,
      place.engagement.recentSaves,
      sql(daysAgo(90)),
      sql(now),
    ].join(", ")});`,
  );

  const evidenceSources = place.evidenceLabel.split(" · ");
  evidenceSources.forEach((sourceName, index) => {
    lines.push(
      `INSERT INTO evidence_sources (establishment_id, source_type, source_name, url, confidence, captured_at, summary) VALUES (${[
        place.id,
        sql(sourceType(sourceName)),
        sql(sourceName),
        sql(null),
        place.evidence.confidence === "High" ? 0.9 : place.evidence.confidence === "Medium" ? 0.7 : 0.45,
        sql(daysAgo(index * 12 + place.daysSinceFreshEvidence)),
        sql(`Seed evidence for ${place.name}`),
      ].join(", ")});`,
    );
  });

  if (place.specialty) {
    lines.push(
      `INSERT INTO specialty_coffee_attributes (establishment_id, specialty_verified, own_roastery, traceable_coffee, filter_coffee, espresso_based, rotating_roasters, single_origin, manual_brew_methods_json, decaf_available, beans_for_sale, verification_sources, updated_at) VALUES (${[
        place.id,
        bool(place.specialty.specialtyVerified),
        bool(place.specialty.ownRoastery),
        bool(place.specialty.traceableCoffee),
        bool(place.specialty.filterCoffee),
        bool(place.specialty.espressoBased),
        bool(place.specialty.rotatingRoasters),
        bool(place.specialty.singleOrigin),
        sql(JSON.stringify(place.specialty.manualBrewMethods)),
        bool(place.specialty.decafAvailable),
        bool(place.specialty.beansForSale),
        place.specialty.verificationSources,
        sql(now),
      ].join(", ")});`,
    );
  }
}

lines.push("COMMIT;");

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${output}`);

function sourceType(sourceName) {
  const normalized = sourceName.toLowerCase();
  if (normalized.includes("specialist")) return "specialist_guide";
  if (normalized.includes("editorial") || normalized.includes("visit stockholm")) return "editorial";
  if (normalized.includes("osm")) return "osm";
  if (normalized.includes("official")) return "official_site";
  return "community_submission";
}

function daysAgo(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function bool(value) {
  return value ? 1 : 0;
}

function sql(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}
