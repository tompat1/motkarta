import { requireAdmin, type AdminAuthEnv } from "../../../lib/admin-auth.ts";
import { isD1OverloadError, isD1QuotaError } from "../../../lib/admin-d1.ts";
import {
  findDuplicatesInMemory,
  type PublishedEstablishmentLookup,
} from "../../../lib/admin-duplicates.ts";
import {
  sqlEstablishmentCuisineTagsSelect,
  sqlEstablishmentMissingCuisine,
} from "../../../lib/establishment-cuisine.ts";

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
};

type D1Database = {
  prepare(query: string): D1Statement;
};

type EventContext<Env> = {
  request: Request;
  env: Env;
};

type Env = {
  DB?: unknown;
} & AdminAuthEnv;

type CandidateDashboardRow = {
  id: number;
  name?: string | null;
  district?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  website: string | null;
  candidateSourceType: string | null;
  validationLabel: string | null;
  candidateReviewStatus: string | null;
  duplicateResolution?: string | null;
  evidenceSourceTypes: string | null;
  latestEvidenceAt: string | null;
  possibleDuplicateCount: number | null;
  cuisineTags: string | null;
};

type ReviewSummaryRow = {
  reviewEventCount: number | null;
  latestReviewAt: string | null;
};

type LastExportRow = {
  lastExportedAt: string | null;
  lastEventCount: number | null;
  lastLabelCount: number | null;
  lastDuplicateResolutionCount: number | null;
};

type CountRow = {
  value: number | null;
};

const hiddenGemEvidenceSourceTypes = new Set([
  "osm",
  "osm_baseline",
  "inspection",
  "municipal_unmatched",
  "food_control",
  "serving_permit",
  "official_site",
  "editorial",
  "independent_editorial",
  "specialist_guide",
  "curated_submission",
  "field_visit",
  "verified_user_rating",
]);

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-cache",
};

const DASHBOARD_CACHE_TTL_MS = 30_000;
let dashboardCache: { db: D1Database; expiresAt: number; payload: Record<string, unknown> } | null = null;

export async function onRequestGet(context: EventContext<Env>) {
  try {
    const auth = await requireAdmin(context.request, context.env);
    if (auth) return auth;

    const db = context.env.DB as D1Database | undefined;
    if (!db) {
      return Response.json(
        { source: "unavailable", error: "No production D1 dataset is bound." },
        { headers: jsonHeaders, status: 503 },
      );
    }

    const url = new URL(context.request.url);
    const bypassCache = url.searchParams.get("fresh") === "1";
    const now = Date.now();
    if (!bypassCache && dashboardCache && dashboardCache.db === db && dashboardCache.expiresAt > now) {
      return Response.json(dashboardCache.payload, { headers: jsonHeaders });
    }

    // Run sequentially to avoid hammering D1's single-threaded 10-second resource window.
    const { rows: candidateRows, publishedDuplicateCount } = await loadCandidateRows(db);
    const reviewSummary = await loadReviewSummary(db);
    const lastExportResult = await loadLastExport(db);
    const missingCuisineCount = await loadMissingCuisineCount(db);
    const lastExportedAt = lastExportResult.row?.lastExportedAt ?? null;
    const unexportedReviewCount = await loadUnexportedReviewCount(db, lastExportedAt);
    const counts = candidateCounts(candidateRows, reviewSummary, unexportedReviewCount, missingCuisineCount, publishedDuplicateCount);
    const actions = {
      harvestNeeded: counts.needsEvidenceCount > 0,
      reviewNeeded:
        counts.missingCuisineCount > 0 ||
        counts.newCandidateCount > 0 ||
        counts.hiddenGemReadyCount > 0 ||
        counts.possibleDuplicateCount > 0,
      exportNeeded: counts.unexportedReviewCount > 0,
    };
    const nextStep = nextDashboardStep(actions);

    const payload = {
      source: "d1",
      generatedAt: new Date().toISOString(),
      nextStep,
      actions,
      counts,
      latestReviewAt: reviewSummary.latestReviewAt ?? null,
      lastExportedAt,
      lastExport: lastExportResult.row,
      exportLogAvailable: lastExportResult.available,
    };
    dashboardCache = { db, expiresAt: now + DASHBOARD_CACHE_TTL_MS, payload };

    return Response.json(payload, { headers: jsonHeaders });
  } catch (error) {
    const isQuota = isD1QuotaError(error);
    const isOverloaded = isD1OverloadError(error);
    console.error("GET /api/admin/review-dashboard failed:", error);
    return Response.json(
      {
        source: "d1",
        quotaExceeded: isQuota,
        overloaded: isOverloaded,
        error: error instanceof Error ? error.message : "Could not load review dashboard.",
      },
      {
        headers: isOverloaded ? { ...jsonHeaders, "retry-after": "3" } : jsonHeaders,
        status: isQuota ? 429 : isOverloaded ? 503 : 500,
      },
    );
  }
}

async function loadCandidateRows(db: D1Database) {
  const { results } = await db.prepare(candidateDashboardQuery()).all<CandidateDashboardRow>();
  const rows = results ?? [];
  const unresolvedRows = rows.filter(
    (row) => !row.duplicateResolution && (row.possibleDuplicateCount === null || row.possibleDuplicateCount === undefined),
  );
  let publishedDuplicateCount = 0;
  if (unresolvedRows.length > 0) {
    const publishedRes = await db
      .prepare(
        `SELECT id, name, type, district, address, latitude, longitude, lifecycle_state
         FROM establishments
         WHERE lifecycle_state IN ('baseline', 'verified', 'featured')
           AND COALESCE(validation_label, '') != 'closed_wrong_category'
           AND COALESCE(duplicate_resolution, '') = ''`,
      )
      .all<PublishedEstablishmentLookup>()
      .catch(() => ({ results: [] as PublishedEstablishmentLookup[] }));
    const published = publishedRes.results ?? [];
    if (published.length > 0) {
      const dupMap = findDuplicatesInMemory(unresolvedRows, published);
      for (const row of unresolvedRows) {
        row.possibleDuplicateCount = (dupMap.get(row.id) ?? []).length > 0 ? 1 : 0;
      }
      // Also count baseline/published-vs-published duplicate pairs (count secondary side once: id > match.id).
      const pubDupMap = findDuplicatesInMemory(published, published);
      for (const pub of published) {
        const matches = pubDupMap.get(pub.id) ?? [];
        if (matches.some((m) => pub.id > m.id)) {
          publishedDuplicateCount += 1;
        }
      }
    }
  }
  return { rows, publishedDuplicateCount };
}

async function loadReviewSummary(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT
        COUNT(*) AS reviewEventCount,
        MAX(reviewed_at) AS latestReviewAt
       FROM admin_review_events`,
    )
    .all<ReviewSummaryRow>();
  return results?.[0] ?? { reviewEventCount: 0, latestReviewAt: null };
}

async function loadLastExport(db: D1Database) {
  try {
    const { results } = await db
      .prepare(
        `SELECT
          exported_at AS lastExportedAt,
          event_count AS lastEventCount,
          label_count AS lastLabelCount,
          duplicate_resolution_count AS lastDuplicateResolutionCount
         FROM admin_label_exports
         ORDER BY exported_at DESC, id DESC
         LIMIT 1`,
      )
      .all<LastExportRow>();
    return { available: true, row: results?.[0] ?? null };
  } catch (error) {
    console.warn("Could not read admin_label_exports", error);
    return { available: false, row: null };
  }
}

async function loadMissingCuisineCount(db: D1Database) {
  try {
    const { results } = await db
      .prepare(`SELECT COUNT(*) AS value FROM establishments e WHERE ${sqlEstablishmentMissingCuisine("e")}`)
      .all<CountRow>();
    return Number(results?.[0]?.value ?? 0);
  } catch (error) {
    console.warn("Could not count establishments missing cuisine", error);
    return 0;
  }
}

async function loadUnexportedReviewCount(db: D1Database, lastExportedAt: string | null) {
  const { results } = await db
    .prepare(
      `SELECT COUNT(*) AS value
       FROM admin_review_events
       WHERE reviewed_at > ?`,
    )
    .bind(lastExportedAt ?? "0000-01-01T00:00:00.000Z")
    .all<CountRow>();
  return Number(results?.[0]?.value ?? 0);
}

function candidateCounts(
  rows: CandidateDashboardRow[],
  reviewSummary: ReviewSummaryRow,
  unexportedReviewCount: number,
  missingCuisineCount: number,
  publishedDuplicateCount = 0,
) {
  let newCandidateCount = 0;
  let hiddenGemReadyCount = 0;
  let needsEvidenceCount = 0;
  let missingCuisineCandidateCount = 0;
  let possibleDuplicateCount = 0;

  for (const row of rows) {
    const evidenceGate = evidenceGateProfile(row);
    if (!row.cuisineTags?.trim()) {
      missingCuisineCandidateCount += 1;
    }
    if (!row.validationLabel && row.candidateReviewStatus !== "duplicate_checked_keep_separate") {
      newCandidateCount += 1;
    }
    if (evidenceGate.canPromoteHiddenGem) {
      hiddenGemReadyCount += 1;
    }
    if (evidenceGate.sourceGaps.length > 0) {
      needsEvidenceCount += 1;
    }
    if (Number(row.possibleDuplicateCount ?? 0) > 0 && row.validationLabel !== "closed_wrong_category") {
      possibleDuplicateCount += 1;
    }
  }

  return {
    candidateCount: rows.length,
    newCandidateCount,
    hiddenGemReadyCount,
    needsEvidenceCount,
    missingCuisineCount,
    missingCuisineCandidateCount,
    possibleDuplicateCount: possibleDuplicateCount + publishedDuplicateCount,
    reviewEventCount: Number(reviewSummary.reviewEventCount ?? 0),
    unexportedReviewCount,
  };
}

function nextDashboardStep(actions: { exportNeeded: boolean; reviewNeeded: boolean; harvestNeeded: boolean }) {
  if (actions.exportNeeded) {
    return "export";
  }
  if (actions.reviewNeeded) {
    return "review";
  }
  if (actions.harvestNeeded) {
    return "harvest";
  }
  return "caught_up";
}

function candidateDashboardQuery() {
  return `
    SELECT
      e.id,
      e.name,
      e.district,
      e.address,
      e.latitude,
      e.longitude,
      e.website,
      e.candidate_source_type AS candidateSourceType,
      e.validation_label AS validationLabel,
      e.candidate_review_status AS candidateReviewStatus,
      e.duplicate_resolution AS duplicateResolution,
      GROUP_CONCAT(DISTINCT ev.source_type) AS evidenceSourceTypes,
      MAX(ev.captured_at) AS latestEvidenceAt,
      NULL AS possibleDuplicateCount,
      ${sqlEstablishmentCuisineTagsSelect("e", "cuisineTags")}
    FROM establishments e
    LEFT JOIN evidence_sources ev ON ev.establishment_id = e.id
    WHERE e.lifecycle_state = 'candidate'
      AND COALESCE(e.duplicate_resolution, '') != 'merged'
    GROUP BY e.id
  `;
}

function evidenceGateProfile(
  row: Pick<CandidateDashboardRow, "candidateSourceType" | "evidenceSourceTypes" | "latestEvidenceAt" | "website"> & {
    cuisineTags?: string | null;
  },
) {
  const evidenceSourceTypes = parseEvidenceSources(row.evidenceSourceTypes);
  const independentEvidenceTypes = independentEvidenceTypesFor(evidenceSourceTypes, row.candidateSourceType);
  const hasGoogleOnlySignal =
    independentEvidenceTypes.length === 0 &&
    [row.candidateSourceType, ...evidenceSourceTypes].some((sourceType) => sourceType === "google_metadata");
  const hasCurrentExistence = Boolean(row.latestEvidenceAt || row.website);
  const hasCuisineLabel = Boolean(row.cuisineTags?.trim());
  const sourceGaps = [
    hasCuisineLabel ? "" : "needs_cuisine_label",
    independentEvidenceTypes.length < 2 ? "needs_second_independent_evidence" : "",
    evidenceSourceTypes.includes("osm") || row.candidateSourceType === "osm_baseline" ? "" : "needs_osm_or_open_data_match",
    hasCurrentExistence ? "" : "needs_current_existence_signal",
    hasGoogleOnlySignal ? "google_metadata_only" : "",
  ].filter(Boolean);

  return {
    canPromoteHiddenGem: independentEvidenceTypes.length >= 2,
    sourceGaps,
  };
}

function independentEvidenceTypesFor(evidenceSourceTypes: string[], candidateSourceType: string | null) {
  const sourceTypes = new Set([candidateSourceType, ...evidenceSourceTypes].filter((item): item is string => Boolean(item)));
  const independent = new Set<string>();
  for (const sourceType of sourceTypes) {
    const normalized = normalizeEvidenceSourceType(sourceType);
    if (hiddenGemEvidenceSourceTypes.has(normalized)) {
      independent.add(normalized);
    }
  }
  return [...independent].sort();
}

function parseEvidenceSources(value: string | null) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeEvidenceSourceType(sourceType: string) {
  if (sourceType === "osm_baseline") {
    return "osm";
  }
  if (sourceType === "municipal_unmatched") {
    return "inspection";
  }
  if (sourceType === "independent_editorial") {
    return "editorial";
  }
  return sourceType;
}
