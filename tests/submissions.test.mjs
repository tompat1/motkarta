import assert from "node:assert/strict";
import test from "node:test";

import { onRequestPost } from "../functions/api/submissions.ts";

test("public place submission creates an admin candidate", async () => {
  const db = fakeD1();
  const response = await onRequestPost({
    request: new Request("https://motkarta.test/api/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "New Community Café",
        kind: "Café",
        cuisine: "coffee shop",
        area: "Kista",
        address: "Kistagången 1",
        website: "community.example",
        note: "A local recommendation.",
        latitude: 59.4,
        longitude: 17.94,
      }),
    }),
    env: { DB: db },
  });
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.equal(payload.success, true);
  assert.equal(db.establishment.lifecycleState, "candidate");
  assert.equal(db.establishment.sourceType, "user_submission");
  assert.equal(db.establishment.validationLabel, "not_enough_evidence");
  assert.equal(db.establishment.reviewStatus, "needs_review");
  assert.deepEqual(db.tags, ["coffee shop"]);
});

test("duplicate public place submission does not create another candidate", async () => {
  const db = fakeD1({ duplicate: { id: 42, name: "Existing Café" } });
  const response = await onRequestPost({
    request: new Request("https://motkarta.test/api/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Existing Café", area: "Södermalm" }),
    }),
    env: { DB: db },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.duplicate, true);
  assert.equal(db.inserted, false);
});

function fakeD1({ duplicate = null } = {}) {
  const db = {
    duplicate,
    inserted: false,
    tags: [],
    establishment: null,
    prepare(query) {
      return {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async all() {
          if (query.includes("SELECT id, name")) {
            return { results: db.duplicate ? [db.duplicate] : [] };
          }
          return { results: [] };
        },
        async run() {
          if (query.includes("INSERT INTO establishments")) {
            const [id, name, type, area, address, website, description, latitude, longitude] = this.values;
            db.inserted = true;
            db.establishment = {
              id,
              name,
              type,
              area,
              address,
              website,
              description,
              latitude,
              longitude,
              lifecycleState: "candidate",
              validationLabel: "not_enough_evidence",
              sourceType: "user_submission",
              reviewStatus: "needs_review",
            };
          }
          if (query.includes("INSERT INTO establishment_tags")) {
            db.tags.push(this.values[1]);
          }
          return { meta: { changes: 1 } };
        },
      };
    },
  };
  return db;
}
