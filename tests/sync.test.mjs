import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "../functions/api/sync.ts";

test("POST /api/sync generates 6-character sync code and stores savedPlaceIds", async () => {
  const request = new Request("https://motkarta.se/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ savedPlaceIds: [1, 3, 14] }),
  });

  const response = await onRequestPost({ request, env: {} });
  assert.equal(response.status, 200);

  const data = await response.json();
  assert.equal(data.success, true);
  assert.ok(data.syncCode.startsWith("MOT-"));
  assert.deepEqual(data.savedPlaceIds, [1, 3, 14]);
});

test("GET /api/sync fetches stored savedPlaceIds by code", async () => {
  // First save a sync payload
  const postRequest = new Request("https://motkarta.se/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ savedPlaceIds: [5, 12, 39], existingCode: "MOT-TEST" }),
  });
  await onRequestPost({ request: postRequest, env: {} });

  // Then retrieve it by code
  const getRequest = new Request("https://motkarta.se/api/sync?code=MOT-TEST", { method: "GET" });
  const response = await onRequestGet({ request: getRequest, env: {} });

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.syncCode, "MOT-TEST");
  assert.deepEqual(data.savedPlaceIds, [5, 12, 39]);
});

test("GET /api/sync handles missing or invalid sync codes cleanly", async () => {
  const getRequest = new Request("https://motkarta.se/api/sync?code=MOT-INVALID999", { method: "GET" });
  const response = await onRequestGet({ request: getRequest, env: {} });

  assert.equal(response.status, 404);
  const data = await response.json();
  assert.ok(data.error.includes("not found"));
});

test("getSyncShareableUrl generates canonical https://motkarta.rynell.org/ with sync code and saved places", async () => {
  const { getSyncShareableUrl, parseSyncDirectPlaces, CANONICAL_SYNC_URL } = await import("../src/app/sync-utils.ts");
  assert.equal(CANONICAL_SYNC_URL, "https://motkarta.rynell.org");

  const urlStr = getSyncShareableUrl("MOT-RE3R", [1, 3, 14]);
  const url = new URL(urlStr);

  assert.equal(url.origin, "https://motkarta.rynell.org");
  assert.equal(url.pathname, "/");
  assert.equal(url.searchParams.get("sync"), "MOT-RE3R");
  assert.equal(url.searchParams.get("places"), "1,3,14");

  // Verify places array parses back identically using parseSyncDirectPlaces
  const parsedPlaces = parseSyncDirectPlaces(url.searchParams.get("places"));
  assert.deepEqual(parsedPlaces, [1, 3, 14]);
});

test("getSyncShareableUrl handles code without places or places without code cleanly", async () => {
  const { getSyncShareableUrl } = await import("../src/app/sync-utils.ts");

  const codeOnlyUrl = new URL(getSyncShareableUrl("MOT-AB12", []));
  assert.equal(codeOnlyUrl.searchParams.get("sync"), "MOT-AB12");
  assert.equal(codeOnlyUrl.searchParams.has("places"), false);

  const placesOnlyUrl = new URL(getSyncShareableUrl(null, [42, 99]));
  assert.equal(placesOnlyUrl.searchParams.has("sync"), false);
  assert.equal(placesOnlyUrl.searchParams.get("places"), "42,99");
});

test("QRCode generates valid scannable SVG for canonical sync URL", async () => {
  const { getSyncShareableUrl } = await import("../src/app/sync-utils.ts");
  const QRCode = (await import("qrcode")).default;

  const url = getSyncShareableUrl("MOT-RE3R", [1, 3, 14]);
  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 2,
    errorCorrectionLevel: "M",
  });

  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes("viewBox="));
  assert.ok(svg.includes("<path"));
  assert.ok(svg.trim().endsWith("</svg>"));

  // Verify internal QR matrix structure
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  assert.ok(qr.modules.size >= 21);
  assert.ok(qr.version >= 1);
});

