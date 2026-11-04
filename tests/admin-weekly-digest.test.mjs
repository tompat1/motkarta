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
import { sendAdminNotificationEmail } from "../lib/admin-notify.ts";
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

function insertRecentCandidate(sqlite, id = 501) {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO establishments
        (id, name, type, district, description, latitude, longitude, lifecycle_state, candidate_source_type, created_at, updated_at)
       VALUES (?, ?, 'Restaurant', 'Södermalm', '', 59.3, 18.0, 'candidate', 'admin_entry', ?, ?)`,
    )
    .run(id, `Weekly Candidate ${id}`, now, now);
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
  insertRecentCandidate(sqlite);

  const snapshot = await collectWeeklyDigestSnapshot(DB);
  assert.equal(snapshot.newCandidates, 1);
  assert.equal(snapshot.sampleCandidates[0]?.name, "Weekly Candidate 501");
});

test("sendAdminNotificationEmail uses authenticated Cloudflare Email Service", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let request;
  globalThis.fetch = async (input, init) => {
    request = { input: String(input), init };
    return Response.json({
      success: true,
      errors: [],
      result: {
        delivered: ["one@example.test"],
        queued: ["two@example.test"],
        permanent_bounces: [],
      },
    });
  };

  const result = await sendAdminNotificationEmail(
    {
      MOTKARTA_CLOUDFLARE_ACCOUNT_ID: "account-id",
      MOTKARTA_CLOUDFLARE_EMAIL_API_TOKEN: "email-token",
    },
    {
      to: ["one@example.test", "two@example.test", "one@example.test"],
      subject: "Weekly digest",
      text: "Digest body",
    },
  );

  assert.equal(result.delivered, 2);
  assert.deepEqual(result.errors, []);
  assert.equal(request.input, "https://api.cloudflare.com/client/v4/accounts/account-id/email/sending/send");
  assert.equal(request.init.headers.authorization, "Bearer email-token");
  const body = JSON.parse(request.init.body);
  assert.deepEqual(body.to, ["one@example.test", "two@example.test"]);
  assert.equal(body.from.address, "notifications@motkarta.rynell.org");
});

test("sendAdminNotificationEmail fails closed when Email Service is not configured", async () => {
  const result = await sendAdminNotificationEmail(
    {},
    { to: ["admin@example.test"], subject: "Weekly digest", text: "Digest body" },
  );
  assert.equal(result.delivered, 0);
  assert.match(result.errors.join(" "), /not configured/i);
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
  assert.equal(result.outcome, "skipped");
  assert.equal(result.sent, false);
  assert.match(result.reason ?? "", /6 days/i);
});

test("sendWeeklyAdminDigest records a send only after email delivery succeeds", async (t) => {
  const { DB, sqlite } = memoryDb();
  insertRecentCandidate(sqlite);
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => Response.json({
    success: true,
    errors: [],
    result: { delivered: ["admin@example.test"], queued: [], permanent_bounces: [] },
  });

  const result = await sendWeeklyAdminDigest({
    DB,
    MOTKARTA_ADMIN_EMAILS: "admin@example.test",
    MOTKARTA_CLOUDFLARE_ACCOUNT_ID: "account-id",
    MOTKARTA_CLOUDFLARE_EMAIL_API_TOKEN: "email-token",
  });

  assert.equal(result.outcome, "sent");
  assert.equal(result.sent, true);
  assert.equal(result.delivered, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM admin_digest_log").get().count, 1);
});

test("sendWeeklyAdminDigest reports delivery failure without recording a send", async () => {
  const { DB, sqlite } = memoryDb();
  insertRecentCandidate(sqlite);

  const result = await sendWeeklyAdminDigest({
    DB,
    MOTKARTA_ADMIN_EMAILS: "admin@example.test",
  });

  assert.equal(result.outcome, "failed");
  assert.equal(result.sent, false);
  assert.match(result.reason ?? "", /not configured/i);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM admin_digest_log").get().count, 0);
});

test("weekly digest endpoint returns a failing status for delivery errors", async () => {
  const { DB } = memoryDb();
  const response = await runWeeklyDigest({
    request: new Request("https://motkarta.test/api/cron/weekly-admin-digest", {
      method: "POST",
      headers: {
        authorization: "Bearer cron-test-secret",
        "x-motkarta-digest-force": "1",
      },
    }),
    env: {
      DB,
      MOTKARTA_CRON_SECRET: "cron-test-secret",
      MOTKARTA_ADMIN_EMAILS: "admin@example.test",
    },
  });

  assert.equal(response.status, 502);
  assert.equal((await response.json()).outcome, "failed");
});

test("weekly digest workflow bypasses the challenged custom domain and only forces manual runs", () => {
  const workflow = readFileSync(new URL("../.github/workflows/admin-weekly-digest.yml", import.meta.url), "utf8");
  assert.match(workflow, /cron: "17 8 \* \* 1"/);
  assert.match(workflow, /https:\/\/motkarta\.pages\.dev\/api\/cron\/weekly-admin-digest/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.doesNotMatch(workflow, /curl[^\n]* -G /);
});
