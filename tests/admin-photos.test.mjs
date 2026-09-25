import assert from "node:assert/strict";
import test from "node:test";

import { onRequestDelete, onRequestGet, onRequestPost } from "../functions/api/admin/photos.ts";

const token = "review-secret";

test("admin photos lists images for a place", async () => {
  const db = fakeD1();
  const response = await onRequestGet({
    request: new Request("https://motkarta.test/api/admin/photos?place_id=42", { headers: { "x-motkarta-admin-token": token } }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: token },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.placeId, 42);
  assert.equal(payload.photos[0].id, "photo-42");
});

test("admin photos upserts a curated image by URL", async () => {
  const db = fakeD1();
  const response = await onRequestPost({
    request: new Request("https://motkarta.test/api/admin/photos", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-motkarta-admin-token": token,
      },
      body: JSON.stringify({
        placeId: 42,
        url: "example.test/hero.jpg",
        caption: "Interior",
      }),
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: token },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.photo.url, "https://example.test/hero.jpg");
  assert.equal(db.upsertValues[1], 42);
});

test("admin photos deletes only the requested image from the requested place", async () => {
  const db = fakeD1();
  const response = await onRequestDelete({
    request: new Request("https://motkarta.test/api/admin/photos?place_id=42&photo_id=photo-42", {
      method: "DELETE",
      headers: { "x-motkarta-admin-token": token },
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: token },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.deepEqual(db.deleteValues, ["photo-42", 42]);
});

function fakeD1() {
  return {
    deleteValues: null,
    upsertValues: null,
    prepare(query) {
      const statement = {
        values: [],
        bind(...values) { this.values = values; return this; },
        async all() { return { results: query.includes("FROM place_photos") ? [{ id: "photo-42", placeId: 42, url: "https://example.test/photo.jpg", thumbnailUrl: "https://example.test/photo.jpg", caption: "Venue" }] : [] }; },
        async run() {
          if (query.includes("INSERT INTO place_photos")) {
            this.db.upsertValues = this.values;
            return { meta: { changes: 1 } };
          }
          if (query.includes("DELETE FROM place_photos")) {
            this.db.deleteValues = this.values;
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
        db: null,
      };
      statement.db = this;
      return statement;
    },
  };
}
