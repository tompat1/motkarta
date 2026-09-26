import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  authorizeCronRequest,
  collectWeeklyDigestSnapshot,
  formatWeeklyDigestEmail,
  sendWeeklyAdminDigest,
} from "../lib/admin-weekly-digest.ts";
import { onRequestPost as runWeeklyDigest } from "../functions/api/cron/weekly-admin-digest.ts";

function memoryDb() {
  const sqlite = new DatabaseSync(":memory:");
  const dir = new URL("../drizzle/", import.meta.url);
  for (const filename of readdirSync(dir).filter((name) => /^\d.*\.sql$/.test(name)).sort()) {
    sqlite.exec(readFileSync(new URL(filename, dir), "utf8"));
  }
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
          return { success: true, meta: { changes: Number(statement.run(...values).changes) } };
        },
      };
    },
  };
  return { DB, sqlite };
}

test("formatWeeklyDigestEmail includes coverage and candidate summary", () => {
  const text = formatWeeklyDigestEmail(
    {
      generatedAt: "2026-09-26T08:00:00.000Z",
      windowDays: 7,
      newCandidates: 2,
      hiddenGemReady: 1,
      coverageGaps: { address: 10, photos: 5, openingHours: 3, price: 4, website: 6 },
      adminReviewEvents: 3,
      sampleCandidates: [{ id: 1, name: "LUCA", area: "Södermalm", sourceType: "admin_entry" }],
    },
    "https://motkarta.test/admin",
  );
  assert.match(text, /LUCA/);
  assert.match(text, /Missing address: 10/);
});

test("collectWeeklyDigestSnapshot counts recent candidates", async () => {
  const { DB, sqlite } = memoryDb();
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO establishments
        (id, name, type, district, description, latitude, longitude, lifecycle_state, candidate_source_type, created_at, updated_at)
       VALUES (?, ?, 'Restaurant', 'Södermalm', '', 59.3, 18.0, 'candidate', 'admin_entry', ?, ?)`,
    )
    .run(501, "Weekly Candidate", now, now);

  const snapshot = await collectWeeklyDigestSnapshot(DB);
  assert.equal(snapshot.newCandidates, 1);
  assert.equal(snapshot.sampleCandidates[0]?.name, "Weekly Candidate");
});

test("weekly digest cron endpoint requires shared secret", async () => {
  const { DB } = memoryDb();
  const env = { DB, MOTKARTA_CRON_SECRET: "cron-test-secret", MOTKARTA_ADMIN_EMAILS: "admin@example.test" };

  const unauthorized = await runWeeklyDigest({
    request: new Request("https://motkarta.test/api/cron/weekly-admin-digest", { method: "POST" }),
    env,
  });
  assert.equal(unauthorized.status, 401);

  assert.equal(
    authorizeCronRequest(
      new Request("https://motkarta.test/api/cron/weekly-admin-digest", {
        headers: { authorization: "Bearer cron-test-secret" },
      }),
      env,
    ),
    true,
  );
});

test("sendWeeklyAdminDigest skips duplicate sends within six days", async () => {
  const { DB, sqlite } = memoryDb();
  sqlite
    .prepare("INSERT INTO admin_digest_log (sent_at, recipient_count, summary_json) VALUES (?, 1, '{}')")
    .run(new Date().toISOString());

  const result = await sendWeeklyAdminDigest({
    DB,
    MOTKARTA_ADMIN_EMAILS: "admin@example.test",
  });
  assert.equal(result.sent, false);
  assert.match(result.reason ?? "", /6 days/i);
});
