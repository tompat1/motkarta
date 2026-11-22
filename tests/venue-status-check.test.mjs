import assert from "node:assert/strict";
import test from "node:test";
import {
  combineVenueStatusSignals,
  detectClosureTextInHtml,
  interpretGoogleBusinessStatus,
  interpretOsmTags,
  isSafePublicHttpUrl,
} from "../lib/venue-status-check.ts";
import { onRequestPost as checkStatusPost } from "../functions/api/admin/check-status.ts";

test("detectClosureTextInHtml identifies Swedish and English permanent and temporary closure banners", () => {
  assert.deepEqual(
    detectClosureTextInHtml("<html><body><h1>Tack för dessa år!</h1><p>Nu har vi stängt för gott.</p></body></html>"),
    { status: "permanently_closed", matchedPhrase: "vi har stängt för gott" },
  );
  assert.deepEqual(
    detectClosureTextInHtml("<div>Notice: We are permanently closed.</div>"),
    { status: "permanently_closed", matchedPhrase: "permanently closed" },
  );
  assert.deepEqual(
    detectClosureTextInHtml("<p>Tillfälligt stängt för renovering under november.</p>"),
    { status: "temporarily_closed", matchedPhrase: "tillfälligt stängt" },
  );
  assert.deepEqual(
    detectClosureTextInHtml("<html><body><h1>Välkommen till Bistro Stockholm</h1></body></html>"),
    { status: null, matchedPhrase: null },
  );
});

test("isSafePublicHttpUrl allows public domains and blocks localhost/private IP SSRF targets", () => {
  assert.equal(isSafePublicHttpUrl("https://dropcoffee.com"), "https://dropcoffee.com/");
  assert.equal(isSafePublicHttpUrl("dropcoffee.com"), "https://dropcoffee.com/");
  assert.equal(isSafePublicHttpUrl("http://localhost:8788/admin"), null);
  assert.equal(isSafePublicHttpUrl("http://127.0.0.1/secret"), null);
  assert.equal(isSafePublicHttpUrl("http://192.168.1.10/"), null);
  assert.equal(isSafePublicHttpUrl("javascript:alert(1)"), null);
});

test("interpretOsmTags and interpretGoogleBusinessStatus map operational states accurately", () => {
  assert.equal(interpretOsmTags({ "disused:amenity": "restaurant" }, true).status, "permanently_closed");
  assert.equal(interpretOsmTags({ amenity: "cafe", name: "Drop" }, true).status, "open");
  assert.equal(interpretOsmTags(null, false).status, "unknown");

  assert.equal(interpretGoogleBusinessStatus("OPERATIONAL")?.status, "open");
  assert.equal(interpretGoogleBusinessStatus("CLOSED_TEMPORARILY")?.status, "temporarily_closed");
  assert.equal(interpretGoogleBusinessStatus("CLOSED_PERMANENTLY")?.status, "permanently_closed");
  assert.equal(interpretGoogleBusinessStatus(null), null);
});

test("combineVenueStatusSignals prioritizes permanent closure over other signals", () => {
  const combined = combineVenueStatusSignals([
    { source: "osm", status: "open", detail: "OSM active" },
    { source: "google_places", status: "permanently_closed", detail: "Google Places: CLOSED_PERMANENTLY" },
  ]);
  assert.equal(combined.status, "permanently_closed");

  const downOnly = combineVenueStatusSignals([
    { source: "website", status: "website_down", detail: "Website HTTP 404" },
  ]);
  assert.equal(downOnly.status, "website_down");
});

test("admin check-status endpoint requires admin authentication", async () => {
  const res = await checkStatusPost({
    request: new Request("https://motkarta.test/api/admin/check-status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ venues: [{ id: 1, name: "Test" }] }),
    }),
    env: { MOTKARTA_ADMIN_TOKEN: "secret-token" },
  });
  assert.equal(res.status, 401);
});
