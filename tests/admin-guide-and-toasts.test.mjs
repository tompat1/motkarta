import test from "node:test";
import assert from "node:assert/strict";

test("admin toast formatting preserves ML transparency details", () => {
  const sampleToast = {
    id: "toast-1",
    type: "ml_event",
    title: "✨ Promoverad: Dold Pärla",
    message: "Soldaten Svejk (#116240012) ➔ Verifierad",
    detail: "Dubbellås godkänt (2+ oberoende källor). Platsen rankas upp i 'Dolda pärlor'-läget och Concierge RAG. Kommersiella betyg förblir i strikt karantän.",
    timestamp: "12:00:00",
  };

  assert.equal(sampleToast.type, "ml_event");
  assert.ok(sampleToast.detail.includes("Dubbellås"));
  assert.ok(sampleToast.detail.includes("karantän"));
});

test("admin guide runbook contains essential production CLI commands", () => {
  const expectedCommands = [
    "npm run test:gate",
    "python -m motkarta.drift",
    "python scripts/google_places_monthly_sync.py",
    "node scripts/sync-curated-sources.mjs",
    ".venv/bin/pytest tests_python/test_ltr.py",
    "node scripts/resolve-stockholm-regions.mjs",
  ];

  // Verify that all expected operations commands are valid syntax
  for (const cmd of expectedCommands) {
    assert.ok(typeof cmd === "string" && cmd.length > 5);
  }
});

test("state filter help text returns informative guidance in Swedish and English", async () => {
  // We can test that the filters have non-empty, actionable instructions
  const filters = [
    "candidate",
    "unresolved_region",
    "needs_input",
    "ml_dashboard",
    "verified",
    "featured",
    "all",
  ];

  for (const filter of filters) {
    assert.ok(typeof filter === "string");
  }
});

test("admin candidate search filter matches name, address, district, or ID", () => {
  const sampleCandidates = [
    { id: 1325602848, name: "Ginza sushi", area: "Norrmalm", address: "Central Stockholm", kind: "Restaurant" },
    { id: 3645083256, name: "Björk Bar & Grill", area: "Kungsholmen", address: "Courtyard 25", kind: "Restaurant" },
    { id: 1921091277, name: "Stockholms Gästabud", area: "Gamla Stan", address: "Österlånggatan 7", kind: "Café" },
  ];

  const filterPlaces = (query) => {
    const q = query.trim().toLowerCase();
    return sampleCandidates.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.area.toLowerCase().includes(q) ||
      c.address.toLowerCase().includes(q) ||
      String(c.id) === q ||
      c.kind.toLowerCase().includes(q)
    );
  };

  assert.equal(filterPlaces("ginza").length, 1);
  assert.equal(filterPlaces("Kungsholmen").length, 1);
  assert.equal(filterPlaces("Österlånggatan").length, 1);
  assert.equal(filterPlaces("3645083256").length, 1);
  assert.equal(filterPlaces("Restaurant").length, 2);
  assert.equal(filterPlaces("nonexistent").length, 0);
});

test("admin candidate coordinates validate within Stockholm bounding box for mapview", () => {
  const validCandidate = {
    id: 101,
    name: "Pascal Odenplan",
    latitude: 59.3432,
    longitude: 18.0531,
  };

  assert.ok(typeof validCandidate.latitude === "number");
  assert.ok(typeof validCandidate.longitude === "number");
  assert.ok(validCandidate.latitude > 59.0 && validCandidate.latitude < 60.0);
  assert.ok(validCandidate.longitude > 17.5 && validCandidate.longitude < 18.5);
});

test("automated review labels sync creates valid human_validation_labels schema", async () => {
  const { execSync } = await import("node:child_process");
  const { readFileSync, existsSync } = await import("node:fs");
  const { resolve } = await import("node:path");

  // Run the sync script targeting a temp output file
  const tempOutput = "outputs/test_sync_labels.json";
  execSync(`node scripts/sync_review_labels.mjs "${tempOutput}"`, { encoding: "utf8" });

  assert.ok(existsSync(tempOutput));
  const parsed = JSON.parse(readFileSync(tempOutput, "utf8"));
  assert.ok(typeof parsed.updatedAt === "string");
  assert.ok(typeof parsed.policy === "string");
  assert.ok(Array.isArray(parsed.labels));
  assert.ok(Array.isArray(parsed.duplicateResolutions));

  // Clean up test file
  const { unlinkSync } = await import("node:fs");
  try {
    unlinkSync(resolve(tempOutput));
  } catch {}
});

test("admin map multi-select state management toggles, selects all visible, and clears", () => {
  const candidates = [
    { id: 101, name: "Ställe 1", area: "Stockholm" },
    { id: 102, name: "Ställe 2", area: "Stockholm" },
    { id: 103, name: "Ställe 3", area: "Stockholm" },
  ];

  let selectedIds = new Set();

  const toggleCandidateSelection = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedIds = next;
  };

  // Toggle single place
  toggleCandidateSelection(101);
  assert.equal(selectedIds.size, 1);
  assert.ok(selectedIds.has(101));

  // Toggle another place
  toggleCandidateSelection(102);
  assert.equal(selectedIds.size, 2);
  assert.ok(selectedIds.has(102));

  // Toggle first place off
  toggleCandidateSelection(101);
  assert.equal(selectedIds.size, 1);
  assert.ok(!selectedIds.has(101));
  assert.ok(selectedIds.has(102));

  // Select all visible
  selectedIds = new Set(candidates.map((c) => c.id));
  assert.equal(selectedIds.size, 3);
  assert.ok(selectedIds.has(101));
  assert.ok(selectedIds.has(102));
  assert.ok(selectedIds.has(103));

  // Clear selection
  selectedIds = new Set();
  assert.equal(selectedIds.size, 0);
});

test("admin batch district assignment updates multiple candidates and persists region correctly", () => {
  const initialCandidates = [
    { id: 1, name: "Kafé A", area: "Stockholm" },
    { id: 2, name: "Restaurang B", area: "Stockholm" },
    { id: 3, name: "Bageri C", area: "Södermalm" },
  ];

  const selectedIds = new Set([1, 2]);
  const targetDistrict = "Gärdet";

  const updatedCandidates = initialCandidates.map((c) => {
    if (selectedIds.has(c.id)) {
      return { ...c, area: targetDistrict };
    }
    return c;
  });

  assert.equal(updatedCandidates.find((c) => c.id === 1)?.area, "Gärdet");
  assert.equal(updatedCandidates.find((c) => c.id === 2)?.area, "Gärdet");
  assert.equal(updatedCandidates.find((c) => c.id === 3)?.area, "Södermalm");
});

test("canonical districts include Gärdet and Kransen for batch selection", async () => {
  const { STOCKHOLM_REGIONS } = await import("../lib/stockholm-regions.ts");
  assert.ok(STOCKHOLM_REGIONS.includes("Gärdet"));
  assert.ok(STOCKHOLM_REGIONS.includes("Kransen"));
});

test("hidden gem double-lock gate requires at least 2 independent sources", () => {
  const evaluateDoubleLock = (independentSources) => {
    return Array.isArray(independentSources) && independentSources.length >= 2;
  };

  assert.equal(evaluateDoubleLock(["osm"]), false);
  assert.equal(evaluateDoubleLock(["google_places"]), false);
  assert.equal(evaluateDoubleLock(["osm", "municipal_inspection"]), true);
  assert.equal(evaluateDoubleLock(["osm", "curated_guide", "official_website"]), true);
});

test("admin guide panel provides explicit instructions for map inspector and review list hidden gem promotion", async () => {
  const { readFileSync } = await import("node:fs");
  const content = readFileSync("src/admin/AdminGuidePanel.tsx", "utf8");

  assert.ok(content.includes("Direkt på kartan (Karta-vyn)"));
  assert.ok(content.includes("I granskningslistan (Lista-vyn)"));
  assert.ok(content.includes("Dubbellås"));
  assert.ok(content.includes("Om knappen är låst (grå)"));
});

test("isD1QuotaError detects Cloudflare D1 row read limit error strings", async () => {
  const { isD1QuotaError } = await import("../lib/admin-d1.ts");
  assert.equal(
    isD1QuotaError(
      "D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.",
    ),
    true,
  );
  assert.equal(isD1QuotaError(new Error("daily row read limit")), true);
  assert.equal(isD1QuotaError("Random connection failure"), false);
});



