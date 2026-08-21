import assert from "node:assert/strict";
import test from "node:test";

import { processConciergeQuery } from "../functions/api/concierge.ts";
import { onRequestGet as getPlaces } from "../functions/api/places.ts";

test("places API does not serve demo fallback unless explicitly enabled", async () => {
  const blocked = await getPlaces({ env: {} });
  const blockedPayload = await blocked.json();

  assert.equal(blocked.status, 503);
  assert.equal(blockedPayload.source, "unavailable");
  assert.deepEqual(blockedPayload.places, []);

  const allowed = await getPlaces({ env: { ALLOW_DEMO_FALLBACK: "true" } });
  const allowedPayload = await allowed.json();

  assert.equal(allowed.status, 200);
  assert.equal(allowedPayload.source, "demo");
  assert.ok(allowedPayload.places.length > 0);
});

test("concierge refuses illustrative recommendations when live dataset is missing", async () => {
  const blocked = await processConciergeQuery("specialty coffee");
  const blockedPayload = await blocked.json();

  assert.equal(blocked.status, 503);
  assert.equal(blockedPayload.source, "unavailable");
  assert.deepEqual(blockedPayload.recommendedPlaces, []);
  assert.match(blockedPayload.answer, /demo fallback is disabled/i);
});
