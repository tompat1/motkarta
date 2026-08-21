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
  MOTKARTA_ADMIN_TOKEN?: string;
};

type CandidateDashboardRow = {
  id: number;
  website: string | null;
  candidateSourceType: string | null;
  validationLabel: string | null;
  candidateReviewStatus: string | null;
  evidenceSourceTypes: string | null;
  latestEvidenceAt: string | null;
  possibleDuplicateCount: number | null;
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

export async function onRequestGet(context: EventContext<Env>) {
  const auth = requireAdmin(context.request, context.env);
  if (auth) return auth;

  const db = context.env.DB as D1Database | undefined;
  if (!db) {
    return Response.json(
      { source: "unavailable", error: "No production D1 dataset is bound." },
      { headers: jsonHeaders, status: 503 },
    );
  }

  const [candidateRows, reviewSummary, lastExportResult] = await Promise.all([
    loadCandidateRows(db),
    loadReviewSummary(db),
    loadLastExport(db),
  ]);
  const lastExportedAt = lastExportResult.row?.lastExportedAt ?? null;
  const unexportedReviewCount = await loadUnexportedReviewCount(db, lastExportedAt);
  const counts = candidateCounts(candidateRows, reviewSummary, unexportedReviewCount);
  const actions = {
    harvestNeeded: counts.needsEvidenceCount > 0,
    reviewNeeded: counts.newCandidateCount > 0 || counts.hiddenGemReadyCount > 0 || counts.possibleDuplicateCount > 0,
    exportNeeded: counts.unexportedReviewCount > 0,
  };
  const nextStep = nextDashboardStep(actions);

  return Response.json(
    {
      source: "d1",
      generatedAt: new Date().toISOString(),
      nextStep,
      actions,
      counts,
      latestReviewAt: reviewSummary.latestReviewAt ?? null,
      lastExportedAt,
      lastExport: lastExportResult.row,
      exportLogAvailable: lastExportResult.available,
    },
    { headers: jsonHeaders },
  );
}

async function loadCandidateRows(db: D1Database) {
  const { results } = await db.prepare(candidateDashboardQuery()).all<CandidateDashboardRow>();
  return results ?? [];
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
) {
  let newCandidateCount = 0;
  let hiddenGemReadyCount = 0;
  let needsEvidenceCount = 0;
  let possibleDuplicateCount = 0;

  for (const row of rows) {
    const evidenceGate = evidenceGateProfile(row);
    if (!row.validationLabel && row.candidateReviewStatus !== "duplicate_checked_keep_separate") {
      newCandidateCount += 1;
    }
    if (evidenceGate.canPromoteHiddenGem) {
      hiddenGemReadyCount += 1;
    }
    if (evidenceGate.sourceGaps.length > 0) {
      needsEvidenceCount += 1;
    }
    if (Number(row.possibleDuplicateCount ?? 0) > 0) {
      possibleDuplicateCount += 1;
    }
  }

  return {
    candidateCount: rows.length,
    newCandidateCount,
    hiddenGemReadyCount,
    needsEvidenceCount,
    possibleDuplicateCount,
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
      e.website,
      e.candidate_source_type AS candidateSourceType,
      e.validation_label AS validationLabel,
      e.candidate_review_status AS candidateReviewStatus,
      GROUP_CONCAT(DISTINCT ev.source_type) AS evidenceSourceTypes,
      MAX(ev.captured_at) AS latestEvidenceAt,
      CASE
        WHEN COALESCE(e.duplicate_resolution, '') = ''
          AND EXISTS (SELECT 1 FROM establishments m WHERE ${duplicatePredicate("m", "e")})
        THEN 1 ELSE 0
      END AS possibleDuplicateCount
    FROM establishments e
    LEFT JOIN evidence_sources ev ON ev.establishment_id = e.id
    WHERE e.lifecycle_state = 'candidate'
      AND COALESCE(e.duplicate_resolution, '') != 'merged'
    GROUP BY e.id
  `;
}

function duplicatePredicate(matchAlias: string, candidateAlias: string) {
  const nameMatch = `${normalizedSql(`${matchAlias}.name`)} = ${normalizedSql(`${candidateAlias}.name`)}
    AND LOWER(COALESCE(${matchAlias}.district, '')) = LOWER(COALESCE(${candidateAlias}.district, ''))`;
  const addressMatch = `COALESCE(${candidateAlias}.address, '') != ''
    AND COALESCE(${matchAlias}.address, '') != ''
    AND ${normalizedSql(`${matchAlias}.address`)} = ${normalizedSql(`${candidateAlias}.address`)}`;
  const nearbyNameMatch = `${candidateAlias}.latitude IS NOT NULL
    AND ${candidateAlias}.longitude IS NOT NULL
    AND ${matchAlias}.latitude IS NOT NULL
    AND ${matchAlias}.longitude IS NOT NULL
    AND ABS(${candidateAlias}.latitude - ${matchAlias}.latitude) <= 0.0008
    AND ABS(${candidateAlias}.longitude - ${matchAlias}.longitude) <= 0.0012
    AND (
      INSTR(${normalizedSql(`${matchAlias}.name`)}, ${normalizedSql(`${candidateAlias}.name`)}) > 0
      OR INSTR(${normalizedSql(`${candidateAlias}.name`)}, ${normalizedSql(`${matchAlias}.name`)}) > 0
    )`;

  return `${matchAlias}.id != ${candidateAlias}.id
    AND ${matchAlias}.lifecycle_state IN ('baseline', 'verified', 'featured')
    AND (${nameMatch} OR ${addressMatch} OR ${nearbyNameMatch})`;
}

function normalizedSql(column: string) {
  return `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${column}, ''), ' ', ''), '-', ''), '.', ''), '''', ''))`;
}

function evidenceGateProfile(
  row: Pick<CandidateDashboardRow, "candidateSourceType" | "evidenceSourceTypes" | "latestEvidenceAt" | "website">,
) {
  const evidenceSourceTypes = parseEvidenceSources(row.evidenceSourceTypes);
  const independentEvidenceTypes = independentEvidenceTypesFor(evidenceSourceTypes, row.candidateSourceType);
  const hasGoogleOnlySignal =
    independentEvidenceTypes.length === 0 &&
    [row.candidateSourceType, ...evidenceSourceTypes].some((sourceType) => sourceType === "google_metadata");
  const hasCurrentExistence = Boolean(row.latestEvidenceAt || row.website);
  const sourceGaps = [
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

function requireAdmin(request: Request, env: Env) {
  const configuredToken = env.MOTKARTA_ADMIN_TOKEN?.trim();
  if (!configuredToken) {
    return Response.json(
      { error: "Admin review is not configured." },
      { headers: jsonHeaders, status: 503 },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const suppliedToken =
    request.headers.get("x-motkarta-admin-token") ??
    authHeader.replace(/^Bearer\s+/i, "").trim();

  if (suppliedToken !== configuredToken) {
    return Response.json(
      { error: "Unauthorized admin review request." },
      { headers: jsonHeaders, status: 401 },
    );
  }

  return null;
}
