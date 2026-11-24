import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { isSafeCmsImageUrl, onRequestGet as getCms, onRequestPost as postCms } from "../functions/api/cms.ts";

const token = "cms-test-secret";

function createTestDb(t) {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  const DB = {
    prepare(query) {
      const statement = sqlite.prepare(query);
      let values = [];
      return {
        bind(...args) {
          values = args;
          return this;
        },
        async all() {
          return { results: statement.all(...values) };
        },
        async run() {
          statement.run(...values);
          return { success: true };
        },
      };
    },
  };
  return { DB, MOTKARTA_ADMIN_TOKEN: token };
}

test("isSafeCmsImageUrl allows safe relative, https, and raster data URLs and blocks unsafe schemes", () => {
  assert.equal(isSafeCmsImageUrl("/hero/stockholm-winter.webp"), true);
  assert.equal(isSafeCmsImageUrl("https://motkarta.rynell.org/hero.jpg"), true);
  assert.equal(isSafeCmsImageUrl("data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA="), true);

  assert.equal(isSafeCmsImageUrl("javascript:alert(1)"), false);
  assert.equal(isSafeCmsImageUrl("data:image/svg+xml;base64,PHN2Zz4="), false);
  assert.equal(isSafeCmsImageUrl("//evil.example/x.png"), false);
  assert.equal(isSafeCmsImageUrl("/../etc/passwd"), false);
  assert.equal(isSafeCmsImageUrl("https://example.com/a.jpg\" onclick=\"alert(1)"), false);
});

test("GET and POST /api/cms persist copy overrides, images, and merch items in D1 with admin auth", async (t) => {
  const env = createTestDb(t);

  // Initial public GET returns empty D1 state
  const initialRes = await getCms({ request: new Request("https://motkarta.test/api/cms"), env });
  assert.equal(initialRes.status, 200);
  const initial = await initialRes.json();
  assert.equal(initial.source, "d1");
  assert.deepEqual(initial.overrides, { sv: {}, en: {} });
  assert.deepEqual(initial.images, {});
  assert.equal(initial.merchItems, null);

  // Unauthenticated POST is rejected
  const unauthRes = await postCms({
    request: new Request("https://motkarta.test/api/cms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ overrides: { sv: { heroTitle: "Test" }, en: {} } }),
    }),
    env,
  });
  assert.equal(unauthRes.status, 401);

  // Authenticated POST saves overrides, images, and merch items
  const saveRes = await postCms({
    request: new Request("https://motkarta.test/api/cms", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-motkarta-admin-token": token,
      },
      body: JSON.stringify({
        overrides: {
          sv: { heroTitle: "Stockholms oberoende matkarta" },
          en: { heroTitle: "Stockholm's independent food map" },
        },
        images: {
          heroImage: "/hero/custom-winter.webp",
        },
        merchItems: [{ id: "custom-tote", image: "/merch/tote.jpg", nameSv: "Tygkasse" }],
      }),
    }),
    env,
  });
  assert.equal(saveRes.status, 200);
  const saved = await saveRes.json();
  assert.equal(saved.success, true);
  assert.equal(saved.overrides.sv.heroTitle, "Stockholms oberoende matkarta");
  assert.equal(saved.images.heroImage, "/hero/custom-winter.webp");
  assert.equal(saved.merchItems.length, 1);

  // Subsequent public visitor GET sees the persisted D1 changes
  const publicRes = await getCms({ request: new Request("https://motkarta.test/api/cms"), env });
  const pub = await publicRes.json();
  assert.equal(pub.overrides.en.heroTitle, "Stockholm's independent food map");
  assert.equal(pub.images.heroImage, "/hero/custom-winter.webp");
  assert.equal(pub.merchItems[0].id, "custom-tote");

  // Unsafe image URL is rejected with 400
  const badImgRes = await postCms({
    request: new Request("https://motkarta.test/api/cms", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-motkarta-admin-token": token,
      },
      body: JSON.stringify({
        images: { heroImage: "data:image/svg+xml;base64,PHN2Zz4=" },
      }),
    }),
    env,
  });
  assert.equal(badImgRes.status, 400);
});
