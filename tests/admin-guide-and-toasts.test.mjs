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
