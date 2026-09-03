import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CURATED_SOURCES } from "../lib/db-sources-prompts.ts";

test("DEFAULT_CURATED_SOURCES contains all 7 audited curated sources", () => {
  assert.equal(DEFAULT_CURATED_SOURCES.length, 7);

  const sourceIds = DEFAULT_CURATED_SOURCES.map((s) => s.id);
  assert.ok(sourceIds.includes("husa-guide"));
  assert.ok(sourceIds.includes("stockholm-stad"));
  assert.ok(sourceIds.includes("openstreetmap"));
  assert.ok(sourceIds.includes("white-guide"));
  assert.ok(sourceIds.includes("specialty-coffee-se"));
  assert.ok(sourceIds.includes("visit-stockholm"));
  assert.ok(sourceIds.includes("tasstipset"));

  for (const src of DEFAULT_CURATED_SOURCES) {
    assert.ok(src.id, "Source must have id");
    assert.ok(src.name, "Source must have name");
    assert.ok(src.url, "Source must have url");
    assert.ok(src.type, "Source must have type");
    assert.ok(src.description, "Source must have description");
    assert.ok(src.license, "Source must have license");
    assert.ok(src.verifiedCount > 0, "Source must have verifiedCount > 0");
  }
});
