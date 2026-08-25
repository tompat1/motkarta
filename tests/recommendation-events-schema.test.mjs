import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("recommendation event migration records impressions, outcomes, position, and model version", async () => {
  const migration = await readFile("drizzle/0007_pale_mikhail_rasputin.sql", "utf8");

  assert.match(migration, /CREATE TABLE `recommendation_events`/);
  assert.match(migration, /`event_type` text NOT NULL/);
  assert.match(migration, /`result_position` integer/);
  assert.match(migration, /`model_version` text NOT NULL/);
  assert.match(migration, /recommendation_events_session_idx/);
  assert.match(migration, /recommendation_events_model_idx/);
});
