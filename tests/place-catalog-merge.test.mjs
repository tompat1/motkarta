import assert from "node:assert/strict";
import test from "node:test";

import {
  isManualAdminCatalogPlace,
  mergeSupplementalCatalogPlaces,
  overlayCatalogWithLivePlaces,
  overlayPlaceFromLive,
} from "../lib/place-catalog-merge.ts";

test("mergeSupplementalCatalogPlaces appends manual admin entries not in static export", () => {
  const staticPlace = place({ id: 1, name: "Static Bistro" });
  const manual = place({
    id: 1730000000000,
    name: "LUCA - PIZZA NAPOLETANA",
    candidateSourceType: "admin_entry",
    lifecycleState: "verified",
    validationLabel: "known_hidden_gem",
  });

  const merged = mergeSupplementalCatalogPlaces([staticPlace], [manual, place({ id: 2, name: "OSM Only" })]);

  assert.equal(merged.length, 2);
  assert.equal(merged[1].name, manual.name);
});

test("mergeSupplementalCatalogPlaces skips duplicates and closed manual entries", () => {
  const staticPlace = place({ id: 1, name: "LUCA - PIZZA NAPOLETANA", area: "Södermalm" });
  const manualDuplicate = place({
    id: 99,
    name: "LUCA - PIZZA NAPOLETANA",
    area: "Södermalm",
    candidateSourceType: "admin_entry",
  });
  const closedManual = place({
    id: 100,
    name: "Closed Manual",
    candidateSourceType: "admin_entry",
    validationLabel: "closed_wrong_category",
  });

  const merged = mergeSupplementalCatalogPlaces(
    [staticPlace],
    [manualDuplicate, closedManual],
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 1);
});

test("overlayCatalogWithLivePlaces applies D1-wins fields for matching OSM rows", () => {
  const staticPlace = place({
    id: 100,
    name: "Static Name",
    address: "Old street 1",
    priceLevel: 2,
    osmIdentity: "node:42",
  });
  const livePlace = place({
    id: 999,
    name: "Verified Name",
    address: "New street 9",
    priceLevel: 4,
    lifecycleState: "verified",
    validationLabel: "known_hidden_gem",
    osmIdentity: "node:42",
  });

  const [merged] = overlayCatalogWithLivePlaces([staticPlace], [livePlace]);
  assert.equal(merged.id, 100);
  assert.equal(merged.name, "Verified Name");
  assert.equal(merged.address, "New street 9");
  assert.equal(merged.priceLevel, 4);
  assert.equal(merged.lifecycleState, "verified");
});

test("overlayPlaceFromLive keeps the public catalog id", () => {
  const result = overlayPlaceFromLive(place({ id: 1 }), place({ id: 77, name: "Live" }));
  assert.equal(result.id, 1);
  assert.equal(result.name, "Live");
});

test("isManualAdminCatalogPlace detects admin_entry evidence", () => {
  assert.equal(
    isManualAdminCatalogPlace({
      ...place({ id: 3, name: "X" }),
      evidenceSources: [{ type: "admin_entry", name: "Admin Manual Entry" }],
    }),
    true,
  );
});

function place(overrides) {
  return {
    id: 1,
    name: "Test",
    kind: "Restaurant",
    area: "Södermalm",
    note: "",
    tags: [],
    evidenceLabel: "",
    ratingAverage: 4,
    reliableRatingCount: 0,
    reviewCount: 0,
    categoryMeanRating: 4,
    categoryPopularityRaw: 0,
    localPopularityPercentile: 0.5,
    priceLevel: 2,
    mainstreamExposure: 0,
    ageDays: 0,
    daysSinceFreshEvidence: 0,
    evidence: {
      specialistGuide: 0,
      independentEditorial: 0,
      verifiedUserRating: 0,
      repeatVisits: 0,
      recentReviews: 0,
      credibleReviewers: 0,
      inspectionStatus: 60,
      verifiedAttributes: 0,
      dataFreshness: 100,
      confidence: "Low",
    },
    engagement: {
      searchImpressions: 0,
      profileViews: 0,
      mapMarkerClicks: 0,
      saves: 0,
      directionRequests: 0,
      confirmedVisits: 0,
      repeatVisits: 0,
      recommendations: 0,
      recentSaves: 0,
    },
    x: 50,
    y: 50,
    ...overrides,
  };
}
