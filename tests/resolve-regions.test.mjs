import assert from "node:assert/strict";
import test from "node:test";

import {
  onRequestPost as postResolveRegions,
} from "../functions/api/admin/resolve-regions.ts";
import { isBroadStockholmArea, resolveStockholmRegion } from "../lib/stockholm-regions.ts";

const adminToken = "review-secret";

test("broad stockholm area detection recognizes generic labels and missing values", () => {
  assert.equal(isBroadStockholmArea("Stockholm"), true);
  assert.equal(isBroadStockholmArea("Central Stockholm"), true);
  assert.equal(isBroadStockholmArea("Stockholms län"), true);
  assert.equal(isBroadStockholmArea(""), true);
  assert.equal(isBroadStockholmArea(null), true);
  assert.equal(isBroadStockholmArea(undefined), true);
  assert.equal(isBroadStockholmArea("Södermalm"), false);
  assert.equal(isBroadStockholmArea("Vasastan"), false);
  assert.equal(isBroadStockholmArea("Djurgården"), false);
  assert.equal(isBroadStockholmArea("Gärdet"), false);
  assert.equal(isBroadStockholmArea("Norra Djurgården"), false);
  assert.equal(isBroadStockholmArea("Kransen"), false);
  assert.equal(isBroadStockholmArea("Skeppsholmen"), false);
  assert.equal(isBroadStockholmArea("Riddarholmen"), false);
});

test("resolveStockholmRegion resolves broad/unspecified places into specific regions", () => {
  // Overrides & name matches
  assert.equal(
    resolveStockholmRegion({ name: "Blå Porten", area: "Central Stockholm", latitude: 59.325, longitude: 18.096 }),
    "Djurgården",
  );
  assert.equal(
    resolveStockholmRegion({ name: "Pelikan", area: "Stockholm", latitude: 59.314, longitude: 18.074 }),
    "Södermalm",
  );
  assert.equal(
    resolveStockholmRegion({ name: "Vete-Katten", area: "Central Stockholm", latitude: 59.333, longitude: 18.058 }),
    "Norrmalm",
  );

  // Address alias matches
  assert.equal(
    resolveStockholmRegion({ name: "Bakery", area: "Stockholm", address: "Götgatan 10, Södermalm" }),
    "Södermalm",
  );
  assert.equal(
    resolveStockholmRegion({ name: "Café", area: "Stockholm", address: "Odenplan 1, Vasastan" }),
    "Vasastan",
  );
  assert.equal(
    resolveStockholmRegion({ name: "Coffee Shop", area: "Stockholm", address: "Drottninggatan 40, City" }),
    "Norrmalm",
  );

  // Bounding box matches
  assert.equal(
    resolveStockholmRegion({ name: "Outer South Spot", area: "Stockholm", latitude: 59.28, longitude: 18.05 }),
    "Söderort",
  );
  assert.equal(
    resolveStockholmRegion({ name: "Outer West Spot", area: "Stockholm", latitude: 59.35, longitude: 17.92 }),
    "Västerort",
  );
  assert.equal(
    resolveStockholmRegion({ name: "Outer North Spot", area: "Stockholm", latitude: 59.38, longitude: 18.07 }),
    "Norrort",
  );

  // Norra Djurgården resolution & reclassification from Östermalm
  assert.equal(
    resolveStockholmRegion({ name: "Skafferiet i Ekoparken", area: "Östermalm", address: "Stora Skuggans Väg 38", latitude: 59.3650517, longitude: 18.0713552 }),
    "Norra Djurgården",
  );
  assert.equal(
    resolveStockholmRegion({ name: "Järnvägsrestaurangen Östra Station", area: "Östermalm", address: "Drottning Kristinas väg 1", latitude: 59.346092, longitude: 18.0713793 }),
    "Norra Djurgården",
  );
  assert.equal(
    resolveStockholmRegion({ name: "Dino", area: "Östermalm", address: "Frescativägen 40", latitude: 59.347335, longitude: 18.0669831 }),
    "Norra Djurgården",
  );
  assert.equal(
    resolveStockholmRegion({ name: "The Coffice Albano", area: "Vasastan", address: "North Stockholm, Stockholm", latitude: 59.3542494, longitude: 18.0572915 }),
    "Norra Djurgården",
  );
  assert.equal(
    resolveStockholmRegion({ name: "Sturehof", area: "Östermalm", address: "Stureplan 2", latitude: 59.336, longitude: 18.073 }),
    "Östermalm",
  );
});

test("resolve-regions endpoint rejects unauthorized requests", async () => {
  const response = await postResolveRegions({
    request: new Request("https://motkarta.test/api/admin/resolve-regions", {
      method: "POST",
    }),
    env: { MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.match(payload.error, /admin/i);
});

test("resolve-regions endpoint updates D1 for establishments with broad/missing regions", async () => {
  const rows = [
    {
      id: 1,
      name: "Blå Porten",
      district: "Central Stockholm",
      address: "Djurgårdsvägen 64",
      latitude: 59.325,
      longitude: 18.096,
    },
    {
      id: 2,
      name: "Pelikan",
      district: "Stockholm",
      address: "Blekingegatan 40",
      latitude: 59.314,
      longitude: 18.074,
    },
    {
      id: 3,
      name: "Already Resolved Place",
      district: "Vasastan",
      address: "Odengatan 50",
      latitude: 59.343,
      longitude: 18.05,
    },
  ];

  const db = fakeD1(rows);

  const response = await postResolveRegions({
    request: new Request("https://motkarta.test/api/admin/resolve-regions", {
      method: "POST",
      headers: { "x-motkarta-admin-token": adminToken },
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.totalChecked, 3);
  assert.equal(payload.resolvedCount, 2);
  assert.deepEqual(
    payload.updatedPlaces.map((p) => ({ id: p.id, district: p.resolvedDistrict })),
    [
      { id: 1, district: "Djurgården" },
      { id: 2, district: "Södermalm" },
    ],
  );

  assert.equal(db.rows[0].district, "Djurgården");
  assert.equal(db.rows[1].district, "Södermalm");
  assert.equal(db.rows[2].district, "Vasastan");
  assert.equal(db.auditEvents.length, 2);
  assert.equal(db.auditEvents[0].action, "resolve_region");
});

test("reclassifies places north or west of Södermalm (Gandhi on Kungsholmen, Cafe Söderberg in Norrmalm, Färgfabrikens Kafé in Söderort)", () => {
  assert.equal(
    resolveStockholmRegion({
      name: "Gandhi",
      area: "Södermalm",
      address: "Folkungagatan 95, 116 30 Stockholm, Sweden",
      latitude: 59.331138,
      longitude: 18.0313402,
    }),
    "Kungsholmen",
  );
  assert.equal(
    resolveStockholmRegion({
      name: "Cafe Söderberg",
      area: "Södermalm",
      address: "Jussi björlings allé 10, Södermalm",
      latitude: 59.3305503,
      longitude: 18.0710054,
    }),
    "Norrmalm",
  );
  assert.equal(
    resolveStockholmRegion({
      name: "Färgfabrikens Kafé",
      area: "Södermalm",
      address: "Lövholmsbrinken 1, Södermalm",
      latitude: 59.3153217,
      longitude: 18.0193396,
    }),
    "Söderort",
  );
  assert.equal(
    resolveStockholmRegion({
      name: "Marrakech Resturang",
      area: "Södermalm",
      address: "Central Stockholm, Stockholm",
      latitude: 59.3096235,
      longitude: 18.030495,
    }),
    "Söderort",
  );
  assert.equal(
    resolveStockholmRegion({
      name: "Mackverket",
      area: "Södermalm",
      address: "Central Stockholm, Stockholm",
      latitude: 59.3103302,
      longitude: 18.0311401,
    }),
    "Söderort",
  );
  assert.equal(
    resolveStockholmRegion({
      name: "NIDa Catering och festvåning",
      area: "Södermalm",
      address: "Central Stockholm, Stockholm",
      latitude: 59.3100886,
      longitude: 18.03051,
    }),
    "Söderort",
  );
  assert.equal(
    resolveStockholmRegion({
      name: "Loopen",
      area: "Södermalm",
      address: "Central Stockholm, Stockholm",
      latitude: 59.3133811,
      longitude: 18.0331356,
    }),
    "Södermalm",
  );
});

function fakeD1(initialRows) {
  const db = {
    rows: [...initialRows],
    auditEvents: [],
    prepare(query) {
      return {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async all() {
          if (query.includes("FROM establishments")) {
            return { results: db.rows };
          }
          return { results: [] };
        },
        async run() {
          if (query.includes("UPDATE establishments")) {
            const id = this.values[this.values.length - 1];
            const resolved = this.values[0];
            const row = db.rows.find((r) => r.id === id);
            if (row) {
              row.district = resolved;
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (query.includes("INSERT INTO admin_review_events")) {
            const [establishmentId, lifecycleState, validationLabel, validationNotes, reviewedAt, action] = this.values;
            db.auditEvents.push({ establishmentId, lifecycleState, validationLabel, validationNotes, reviewedAt, action });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
      };
    },
  };
  return db;
}
