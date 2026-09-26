import { adminNotificationEmails, type AdminNotifyEnv as AdminAuthNotifyEnv } from "./admin-auth.ts";
import { postAdminDigestWebhook, sendAdminNotificationEmail, type AdminNotifyEnv as AdminMailEnv } from "./admin-notify.ts";

type D1Database = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
      run(): Promise<{ success?: boolean; meta?: { changes?: number } }>;
    };
    all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
    run(): Promise<{ success?: boolean; meta?: { changes?: number } }>;
  };
};

export type WeeklyDigestSnapshot = {
  generatedAt: string;
  windowDays: number;
  newCandidates: number;
  hiddenGemReady: number;
  coverageGaps: {
    address: number;
    photos: number;
    openingHours: number;
    price: number;
    website: number;
  };
  adminReviewEvents: number;
  sampleCandidates: Array<{ id: number; name: string; area: string; sourceType: string | null }>;
};

export type WeeklyDigestEnv = AdminAuthNotifyEnv & AdminMailEnv & {
  DB?: D1Database;
  MOTKARTA_PUBLIC_SITE_URL?: string;
  MOTKARTA_CRON_SECRET?: string;
};

const WINDOW_DAYS = 7;
const MIN_DAYS_BETWEEN_SENDS = 6;

export async function collectWeeklyDigestSnapshot(db: D1Database): Promise<WeeklyDigestSnapshot> {
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const generatedAt = new Date().toISOString();

  const [
    newCandidates,
    hiddenGemReady,
    addressGaps,
    photoGaps,
    hoursGaps,
    priceGaps,
    websiteGaps,
    reviewEvents,
    sampleRows,
  ] = await Promise.all([
    countQuery(
      db,
      `SELECT COUNT(*) AS value FROM establishments
       WHERE lifecycle_state = 'candidate'
         AND COALESCE(duplicate_resolution, '') != 'merged'
         AND datetime(COALESCE(updated_at, created_at)) >= datetime(?)`,
      windowStart,
    ),
    countHiddenGemReady(db, windowStart).catch(() => 0),
    countCoverageGap(db, "address"),
    countCoverageGap(db, "photos"),
    countCoverageGap(db, "opening_hours"),
    countCoverageGap(db, "price"),
    countCoverageGap(db, "website"),
    countQuery(
      db,
      `SELECT COUNT(*) AS value FROM admin_review_events WHERE datetime(reviewed_at) >= datetime(?)`,
      windowStart,
    ).catch(() => 0),
    db
      .prepare(
        `SELECT e.id, e.name, e.district AS area, e.candidate_source_type AS sourceType
         FROM establishments e
         WHERE e.lifecycle_state = 'candidate'
           AND COALESCE(e.duplicate_resolution, '') != 'merged'
           AND datetime(COALESCE(e.updated_at, e.created_at)) >= datetime(?)
         ORDER BY datetime(COALESCE(e.updated_at, e.created_at)) DESC
         LIMIT 8`,
      )
      .bind(windowStart)
      .all<{ id: number; name: string; area: string; sourceType: string | null }>(),
  ]);

  return {
    generatedAt,
    windowDays: WINDOW_DAYS,
    newCandidates,
    hiddenGemReady,
    coverageGaps: {
      address: addressGaps,
      photos: photoGaps,
      openingHours: hoursGaps,
      price: priceGaps,
      website: websiteGaps,
    },
    adminReviewEvents: reviewEvents,
    sampleCandidates: (sampleRows.results ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      area: row.area,
      sourceType: row.sourceType,
    })),
  };
}

async function countHiddenGemReady(db: D1Database, windowStart: string) {
  const { results } = await db
    .prepare(
      `SELECT COUNT(*) AS value FROM (
         SELECT e.id
         FROM establishments e
         LEFT JOIN evidence_sources ev ON ev.establishment_id = e.id
         WHERE e.lifecycle_state = 'candidate'
           AND COALESCE(e.duplicate_resolution, '') != 'merged'
           AND datetime(COALESCE(e.updated_at, e.created_at)) >= datetime(?)
         GROUP BY e.id
         HAVING COUNT(DISTINCT CASE
           WHEN ev.source_type IN (
             'osm','osm_baseline','inspection','municipal_unmatched','food_control','serving_permit',
             'official_site','editorial','independent_editorial','specialist_guide','curated_submission',
             'field_visit','verified_user_rating','admin_entry','admin_override'
           ) THEN ev.source_type END) >= 2
       )`,
    )
    .bind(windowStart)
    .all<{ value: number }>();
  return Number(results?.[0]?.value ?? 0);
}

async function countQuery(db: D1Database, query: string, bindValue: string) {
  const { results } = await db.prepare(query).bind(bindValue).all<{ value: number }>();
  return Number(results?.[0]?.value ?? 0);
}

async function countCoverageGap(db: D1Database, gap: "address" | "photos" | "opening_hours" | "price" | "website") {
  const clauses: Record<string, string> = {
    address: "(e.address IS NULL OR e.address = '' OR e.address NOT GLOB '*[0-9]*')",
    website: "(e.website IS NULL OR e.website = '')",
    opening_hours: "(e.opening_hours IS NULL OR e.opening_hours = '' OR e.opening_hours = 'undefined')",
    price: "NOT ((e.price_sek IS NOT NULL AND e.price_sek != '') OR (e.price_level IS NOT NULL AND e.price_level > 0))",
    photos: `NOT EXISTS (
      SELECT 1 FROM place_photos p
      WHERE p.place_id = e.id
        AND p.url IS NOT NULL AND p.url != ''
        AND p.url NOT LIKE '%unsplash.com%'
        AND p.url NOT LIKE '%wikimedia.org%'
    )`,
  };
  const clause = clauses[gap];
  if (!clause) {
    return 0;
  }
  try {
    const { results } = await db
      .prepare(
        `SELECT COUNT(*) AS value FROM establishments e
         WHERE e.lifecycle_state IN ('baseline', 'candidate', 'verified', 'featured')
           AND COALESCE(e.validation_label, '') != 'closed_wrong_category'
           AND ${clause}`,
      )
      .all<{ value: number }>();
    return Number(results?.[0]?.value ?? 0);
  } catch {
    return 0;
  }
}

export function formatWeeklyDigestEmail(snapshot: WeeklyDigestSnapshot, adminUrl: string) {
  const lines = [
    `Motkarta weekly admin digest (${snapshot.windowDays}-day window)`,
    "",
    `Generated: ${snapshot.generatedAt}`,
    "",
    `New / updated review candidates: ${snapshot.newCandidates}`,
    `Hidden-gem ready (2+ independent sources, this window): ${snapshot.hiddenGemReady}`,
    `Admin review events: ${snapshot.adminReviewEvents}`,
    "",
    "Coverage gaps (published catalog):",
    `  • Missing address: ${snapshot.coverageGaps.address}`,
    `  • Missing photos: ${snapshot.coverageGaps.photos}`,
    `  • Missing opening hours: ${snapshot.coverageGaps.openingHours}`,
    `  • Missing price: ${snapshot.coverageGaps.price}`,
    `  • Missing website: ${snapshot.coverageGaps.website}`,
    "",
    "Recent candidates:",
    ...(snapshot.sampleCandidates.length
      ? snapshot.sampleCandidates.map(
          (row) => `  • #${row.id} ${row.name} (${row.area})${row.sourceType ? ` — ${row.sourceType}` : ""}`,
        )
      : ["  • None in this window"]),
    "",
    `Open admin: ${adminUrl}`,
  ];
  return lines.join("\n");
}

export async function sendWeeklyAdminDigest(
  env: WeeklyDigestEnv,
  options: { force?: boolean } = {},
): Promise<{ sent: boolean; reason?: string; snapshot?: WeeklyDigestSnapshot; delivered?: number }> {
  const db = env.DB;
  if (!db) {
    return { sent: false, reason: "No D1 database bound." };
  }

  if (!options.force && await recentlySentDigest(db)) {
    return { sent: false, reason: "Digest already sent within the last 6 days." };
  }

  const snapshot = await collectWeeklyDigestSnapshot(db);
  const hasSignal =
    snapshot.newCandidates > 0
    || snapshot.hiddenGemReady > 0
    || snapshot.adminReviewEvents > 0
    || Object.values(snapshot.coverageGaps).some((count) => count > 0);

  if (!hasSignal && !options.force) {
    return { sent: false, reason: "No new admin work in the digest window.", snapshot };
  }

  const recipients = adminNotificationEmails(env);
  const adminUrl = `${(env.MOTKARTA_PUBLIC_SITE_URL ?? "https://motkarta.rynell.org").replace(/\/$/, "")}/admin`;
  const subject = `Motkarta admin digest — ${snapshot.newCandidates} new candidates`;
  const text = formatWeeklyDigestEmail(snapshot, adminUrl);

  const emailResult = await sendAdminNotificationEmail(env, { to: recipients, subject, text });
  await postAdminDigestWebhook(env, { type: "weekly_admin_digest", snapshot, text });

  await recordDigestSend(db, recipients.length, snapshot);

  if (emailResult.delivered === 0 && recipients.length > 0) {
    return {
      sent: false,
      reason: emailResult.errors.join("; ") || "Email delivery failed.",
      snapshot,
      delivered: 0,
    };
  }

  return { sent: true, snapshot, delivered: emailResult.delivered };
}

async function recentlySentDigest(db: D1Database) {
  try {
    const { results } = await db
      .prepare(
        `SELECT sent_at AS sentAt FROM admin_digest_log
         ORDER BY sent_at DESC, id DESC
         LIMIT 1`,
      )
      .all<{ sentAt: string }>();
    const lastSent = results?.[0]?.sentAt;
    if (!lastSent) {
      return false;
    }
    const elapsedDays = (Date.now() - new Date(lastSent).getTime()) / 86_400_000;
    return elapsedDays < MIN_DAYS_BETWEEN_SENDS;
  } catch {
    return false;
  }
}

async function recordDigestSend(db: D1Database, recipientCount: number, snapshot: WeeklyDigestSnapshot) {
  try {
    await db
      .prepare(
        `INSERT INTO admin_digest_log (sent_at, recipient_count, summary_json)
         VALUES (?, ?, ?)`,
      )
      .bind(new Date().toISOString(), recipientCount, JSON.stringify(snapshot))
      .run();
  } catch (error) {
    console.warn("Could not write admin_digest_log", error);
  }
}

export function authorizeCronRequest(request: Request, env: { MOTKARTA_CRON_SECRET?: string }) {
  const secret = env.MOTKARTA_CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization === `Bearer ${secret}`) {
    return true;
  }
  return request.headers.get("x-motkarta-cron-secret") === secret;
}
