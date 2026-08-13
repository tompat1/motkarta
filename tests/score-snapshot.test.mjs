import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { demoPlaces } from "../lib/demo-places.ts";

const execFileAsync = promisify(execFile);

test("score snapshot generator emits score inserts from PlaceInput records", async () => {
  const source = join(tmpdir(), `motkarta-score-input-${process.pid}.json`);
  const target = join(tmpdir(), `motkarta-score-output-${process.pid}.sql`);
  await writeFile(source, JSON.stringify(demoPlaces.slice(0, 2)), "utf8");

  await execFileAsync("node", ["scripts/generate_score_snapshot_sql.mjs", source, target]);
  const sql = await readFile(target, "utf8");

  assert.match(sql, /INSERT INTO score_snapshots/);
  assert.match(sql, /quality_score/);
  assert.match(sql, /recommendation_score/);
  assert.match(sql, /COMMIT;/);
});

test("score snapshot generator accepts combined D1 row exports", async () => {
  const source = join(tmpdir(), `motkarta-score-d1-input-${process.pid}.json`);
  const target = join(tmpdir(), `motkarta-score-d1-output-${process.pid}.sql`);
  await writeFile(
    source,
    JSON.stringify({
      rows: [
        {
          id: 42,
          name: "Exported Place",
          type: "Restaurant",
          district: "Stockholm",
          description: "A place exported from D1.",
          price_level: 2,
          latitude: 59.3,
          longitude: 18.05,
          chain_status: "unknown",
          rating_average: 4.4,
          reliable_rating_count: 50,
          review_count: 70,
          category_mean_rating: 4.1,
          search_impressions: 1000,
          profile_views: 100,
          map_marker_clicks: 50,
          saves: 20,
          direction_requests: 12,
          confirmed_visits: 8,
          repeat_visits: 2,
          recommendations: 1,
          recent_saves: 8,
          latest_rating_at: new Date().toISOString(),
          latest_engagement_at: new Date().toISOString(),
          specialty_verified: null,
          own_roastery: null,
          traceable_coffee: null,
          filter_coffee: null,
          espresso_based: null,
          rotating_roasters: null,
          single_origin: null,
          manual_brew_methods_json: null,
          decaf_available: null,
          beans_for_sale: null,
          verification_sources: null,
        },
      ],
      evidenceRows: [
        {
          establishment_id: 42,
          source_type: "editorial",
          source_name: "Local editorial",
          confidence: 0.8,
          captured_at: new Date().toISOString(),
        },
      ],
      tagRows: [{ establishment_id: 42, tag: "Dinner" }],
    }),
    "utf8",
  );

  await execFileAsync("node", ["scripts/generate_score_snapshot_sql.mjs", source, target]);
  const sql = await readFile(target, "utf8");

  assert.match(sql, /VALUES \(42,/);
});
