import assert from "node:assert/strict";
import test from "node:test";

import { onRequestDelete, onRequestGet, onRequestPost } from "../functions/api/admin/photos.ts";

const token = "review-secret";
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFEcAAAAASUVORK5CYII=";

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

test("admin photos upserts a curated image by URL with hero frame", async () => {
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
        heroFocusX: 20,
        heroFocusY: 80,
        heroScale: 1.4,
        heroFit: "cover",
      }),
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: token },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.photo.url, "https://example.test/hero.jpg");
  assert.equal(payload.photo.heroFocusX, 20);
  assert.equal(payload.photo.heroFit, "cover");
  assert.equal(db.upsertValues[1], 42);
  assert.equal(db.upsertValues[7], 20);
  assert.equal(db.upsertValues[10], "cover");
});

test("admin photos stores uploaded hero bytes in place_photo_uploads", async () => {
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
        dataUrl: `data:image/png;base64,${png}`,
        caption: "Terrace",
        heroFocusX: 40,
        heroFocusY: 60,
      }),
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: token },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.match(payload.photo.id, /^upload-/);
  assert.match(payload.photo.url, /^\/api\/photo-upload\?id=upload-/);
  assert.equal(payload.photo.heroFocusX, 40);
  assert.equal(db.uploadValues[1], 42);
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
    uploadValues: null,
    prepare(query) {
      const statement = {
        values: [],
        bind(...values) { this.values = values; return this; },
        async all() {
          if (query.includes("FROM place_photos")) {
            return { results: [{ id: "photo-42", placeId: 42, url: "https://example.test/photo.jpg", thumbnailUrl: "https://example.test/photo.jpg", caption: "Venue" }] };
          }
          if (query.includes("FROM place_photo_uploads")) return { results: [] };
          if (query.includes("FROM establishments")) return { results: [{ id: 42 }] };
          return { results: [] };
        },
        async run() {
          if (query.includes("INSERT INTO place_photos")) {
            this.db.upsertValues = this.values;
            return { meta: { changes: 1 } };
          }
          if (query.includes("INSERT INTO place_photo_uploads")) {
            this.db.uploadValues = this.values;
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
