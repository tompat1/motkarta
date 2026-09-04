import { requireAdmin, type AdminAuthEnv } from "../../../lib/admin-auth.ts";
import type { PlaceInput, PlaceLifecycleState } from "../../../lib/scoring.ts";

type D1RunResult = {
  success?: boolean;
  meta?: {
    changes?: number;
  };
};

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<D1RunResult>;
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

type ValidationLabel = NonNullable<PlaceInput["validationLabel"]>;
type CandidateStateFilter = PlaceLifecycleState | "unresolved_region" | "needs_input" | "ml_dashboard" | "all";
type AdminAction = "promote" | "merge_duplicate" | "keep_separate" | "update_district" | "update_website" | "create_place" | "mark_closed";

type CandidateRow = {
  id: number;
  name: string;
  kind: string;
  area: string;
  address: string | null;
  website: string | null;
  note: string;
  lifecycleState: PlaceLifecycleState;
  validationLabel: ValidationLabel | null;
  validationNotes: string | null;
  candidateSourceType: string | null;
  candidateSourceId: string | null;
  candidateReviewStatus: string | null;
  candidateAllowedUse: string | null;
  duplicateResolution: "merged" | "keep_separate" | null;
  mergedIntoEstablishmentId: number | null;
  updatedAt: string | null;
  createdAt: string | null;
  evidenceCount: number | null;
  evidenceSourceTypes: string | null;
  latestEvidenceAt: string | null;
  possibleDuplicateCount: number | null;
  possibleDuplicates: string | null;
};

type EstablishmentLookupRow = {
  id: number;
  name: string;
  lifecycleState: PlaceLifecycleState;
};

const lifecycleStates: PlaceLifecycleState[] = ["baseline", "candidate", "verified", "featured"];
const stateFilters: CandidateStateFilter[] = [...lifecycleStates, "unresolved_region", "needs_input", "ml_dashboard", "all"];
const adminActions: AdminAction[] = ["promote", "merge_duplicate", "keep_separate", "update_district", "update_website", "create_place", "mark_closed"];
const validationLabels: ValidationLabel[] = [
  "known_mainstream",
  "known_hidden_gem",
  "not_enough_evidence",
  "closed_wrong_category",
];
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
  const auth = await requireAdmin(context.request, context.env);
  if (auth) return auth;

  const db = context.env.DB as D1Database | undefined;
  if (!db) {
    return Response.json(
      { source: "unavailable", candidates: [], error: "No production D1 dataset is bound." },
      { headers: jsonHeaders, status: 503 },
    );
  }

  const url = new URL(context.request.url);
  const stateParam = url.searchParams.get("state") ?? "candidate";
  const queryParam = url.searchParams.get("q")?.trim() ?? "";
  if (!isStateFilter(stateParam)) {
    return Response.json(
      { error: `Invalid state '${stateParam}'.` },
      { headers: jsonHeaders, status: 400 },
    );
  }

  const limit = clampLimit(url.searchParams.get("limit"));
  const rows = await loadCandidates(db, stateParam, limit, queryParam);

  return Response.json(
    { source: "d1", state: stateParam, query: queryParam, candidates: rows.map(candidateFromRow) },
    { headers: jsonHeaders },
  );
}

export async function onRequestPost(context: EventContext<Env>) {
  const auth = await requireAdmin(context.request, context.env);
  if (auth) return auth;

  const db = context.env.DB as D1Database | undefined;
  if (!db) {
    return Response.json(
      { source: "unavailable", error: "No production D1 dataset is bound." },
      { headers: jsonHeaders, status: 503 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "Invalid JSON body." },
      { headers: jsonHeaders, status: 400 },
    );
  }

  const action = normalizeAction(payload.action);
  const validationNotes = normalizeNotes(payload.validationNotes);

  if (action === "create_place") {
    return createPlace(db, payload, validationNotes);
  }

  const id = numericId(payload.id);
  const requestedState = payload.lifecycleState ?? payload.state;
  const lifecycleState = typeof requestedState === "string" && isLifecycleState(requestedState) ? requestedState : null;
  const validationLabel = normalizeValidationLabel(payload.validationLabel);

  if (!id) {
    return Response.json(
      { error: "Missing or invalid establishment id." },
      { headers: jsonHeaders, status: 400 },
    );
  }

  if (!action) {
    return Response.json(
      { error: "Invalid admin review action." },
      { headers: jsonHeaders, status: 400 },
    );
  }

  if (action === "mark_closed") {
    return markClosed(db, id, validationNotes);
  }

  if (action === "merge_duplicate") {
    return mergeDuplicate(db, id, payload, validationNotes);
  }

  if (action === "keep_separate") {
    return keepSeparate(db, id, validationNotes);
  }

  if (action === "update_district") {
    return updateDistrict(db, id, payload, validationNotes);
  }

  if (action === "update_website") {
    return updateWebsite(db, id, payload, validationNotes);
  }

  if (!lifecycleState) {
    return Response.json(
      { error: "Missing or invalid lifecycle state." },
      { headers: jsonHeaders, status: 400 },
    );
  }

  if (validationLabel === "invalid") {
    return Response.json(
      { error: "Invalid validation label." },
      { headers: jsonHeaders, status: 400 },
    );
  }

  if ((lifecycleState === "verified" || lifecycleState === "featured") && validationLabel === "closed_wrong_category") {
    return Response.json(
      { error: "Closed or wrong-category records cannot be promoted to verified or featured." },
      { headers: jsonHeaders, status: 400 },
    );
  }

  if ((lifecycleState === "verified" || lifecycleState === "featured") && validationLabel === "known_hidden_gem") {
    const profile = await loadEvidenceProfile(db, id);
    if (!profile || evidenceGateProfile(profile).independentEvidenceCount < 2) {
      return Response.json(
        { error: "Hidden-gem promotion requires at least 2 independent non-Google evidence signals." },
        { headers: jsonHeaders, status: 409 },
      );
    }
  }

  const updatedAt = new Date().toISOString();
  const updateResult = await db
    .prepare(
      `UPDATE establishments
       SET lifecycle_state = ?, validation_label = ?, validation_notes = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(lifecycleState, validationLabel, validationNotes, updatedAt, id)
    .run();

  if (updateResult.meta?.changes === 0) {
    return Response.json(
      { error: "Establishment not found." },
      { headers: jsonHeaders, status: 404 },
    );
  }

  await recordReviewEvent(db, {
    establishmentId: id,
    lifecycleState,
    validationLabel,
    validationNotes,
    reviewedAt: updatedAt,
    action: "promote",
  });

  return Response.json(
    {
      success: true,
      id,
      lifecycleState,
      validationLabel,
      validationNotes,
      reviewedAt: updatedAt,
    },
    { headers: jsonHeaders },
  );
}

async function createPlace(db: D1Database, payload: Record<string, unknown>, validationNotes: string | null) {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name) {
    return Response.json({ error: "Name is required for a new place." }, { headers: jsonHeaders, status: 400 });
  }

  const kind = typeof payload.kind === "string" && ["Restaurant", "Bakery", "Café", "Specialty coffee"].includes(payload.kind)
    ? payload.kind
    : "Restaurant";
  const area = typeof payload.area === "string" && payload.area.trim() ? payload.area.trim() : "Stockholm";
  const address = typeof payload.address === "string" ? payload.address.trim() : "";
  const website = typeof payload.website === "string" ? payload.website.trim() : "";
  const description = typeof payload.note === "string" ? payload.note.trim() : (typeof payload.description === "string" ? payload.description.trim() : "");
  const lat = typeof payload.latitude === "number" && !Number.isNaN(payload.latitude) ? payload.latitude : 59.3293;
  const lng = typeof payload.longitude === "number" && !Number.isNaN(payload.longitude) ? payload.longitude : 18.0686;
  const lifecycleState = typeof payload.lifecycleState === "string" && isLifecycleState(payload.lifecycleState)
    ? payload.lifecycleState
    : "verified";
  const validationLabel = normalizeValidationLabel(payload.validationLabel) ?? "known_hidden_gem";

  const now = new Date().toISOString();
  const newId = Date.now();

  await db
    .prepare(
      `INSERT INTO establishments (
        id, name, type, district, address, website, description, latitude, longitude,
        lifecycle_state, validation_label, validation_notes, candidate_source_type, candidate_source_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin_entry', ?, ?, ?)`
    )
    .bind(
      newId, name, kind, area, address || null, website || null, description || null, lat, lng,
      lifecycleState, validationLabel, validationNotes || "Created manually by admin", `admin:${newId}`,
      now, now
    )
    .run();

  await db
    .prepare(
      `INSERT INTO evidence_sources (establishment_id, source_type, source_name, confidence, captured_at, summary)
       VALUES (?, 'admin_entry', 'Admin Manual Entry', 1.0, ?, 'Added directly via admin portal')`
    )
    .bind(newId, now)
    .run()
    .catch(() => {});

  if (payload.cuisine && typeof payload.cuisine === "string" && payload.cuisine.trim()) {
    await db
      .prepare(`INSERT INTO establishment_tags (establishment_id, tag) VALUES (?, ?)`)
      .bind(newId, payload.cuisine.trim())
      .run()
      .catch(() => {});
  }

  await recordAdminReviewEvent(db, {
    id: newId,
    name,
    lifecycleState,
    validationLabel,
    validationNotes: validationNotes || "Created manually by admin",
    reviewedAt: now,
    action: "create_place",
  });

  return Response.json(
    {
      success: true,
      candidate: {
        id: newId,
        name,
        kind,
        area,
        address: address || null,
        website: website || null,
        note: description,
        latitude: lat,
        longitude: lng,
        lifecycleState,
        validationLabel,
        validationNotes: validationNotes || "Created manually by admin",
        candidateSourceType: "admin_entry",
        candidateSourceId: `admin:${newId}`,
        candidateReviewStatus: "verified",
        candidateAllowedUse: "unrestricted",
        duplicateResolution: null,
        mergedIntoEstablishmentId: null,
        updatedAt: now,
        createdAt: now,
        evidenceCount: 1,
        evidenceSourceTypes: "admin_entry",
        latestEvidenceAt: now,
        possibleDuplicateCount: 0,
        possibleDuplicates: "",
      },
    },
    { headers: jsonHeaders }
  );
}

async function markClosed(db: D1Database, id: number, validationNotes: string | null) {
  const updatedAt = new Date().toISOString();
  const note = validationNotes || "Stängd / Ej längre i drift (Marked closed by admin)";
  await db
    .prepare(
      `UPDATE establishments
       SET lifecycle_state = 'candidate', validation_label = 'closed_wrong_category', validation_notes = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(note, updatedAt, id)
    .run();

  await recordAdminReviewEvent(db, {
    id,
    lifecycleState: "candidate",
    validationLabel: "closed_wrong_category",
    validationNotes: note,
    reviewedAt: updatedAt,
    action: "mark_closed",
  });

  return Response.json(
    {
      success: true,
      id,
      lifecycleState: "candidate",
      validationLabel: "closed_wrong_category",
      validationNotes: note,
      reviewedAt: updatedAt,
    },
    { headers: jsonHeaders }
  );
}

async function loadCandidates(db: D1Database, state: CandidateStateFilter, limit: number, query = "") {
  const select = `
    SELECT
      e.id,
      e.name,
      e.type AS kind,
      e.district AS area,
      e.address,
      e.website,
      e.description AS note,
      e.lifecycle_state AS lifecycleState,
      e.validation_label AS validationLabel,
      e.validation_notes AS validationNotes,
      e.candidate_source_type AS candidateSourceType,
      e.candidate_source_id AS candidateSourceId,
      e.candidate_review_status AS candidateReviewStatus,
      e.candidate_allowed_use AS candidateAllowedUse,
      e.duplicate_resolution AS duplicateResolution,
      e.merged_into_establishment_id AS mergedIntoEstablishmentId,
      e.updated_at AS updatedAt,
      e.created_at AS createdAt,
      COUNT(DISTINCT ev.id) AS evidenceCount,
      GROUP_CONCAT(DISTINCT ev.source_type) AS evidenceSourceTypes,
      MAX(ev.captured_at) AS latestEvidenceAt,
      ${duplicateCountSubquery()} AS possibleDuplicateCount,
      ${duplicateMatchesSubquery()} AS possibleDuplicates
    FROM establishments e
    LEFT JOIN evidence_sources ev ON ev.establishment_id = e.id
  `;
  const order = `
    GROUP BY e.id
    ORDER BY
      CASE WHEN MAX(ev.captured_at) IS NULL THEN 1 ELSE 0 END ASC,
      MAX(ev.captured_at) DESC,
      e.updated_at DESC,
      e.name ASC
    LIMIT ?
  `;

  if (state === "ml_dashboard") {
    return [];
  }

  const trimmedQuery = query.trim();

  if (trimmedQuery) {
    const qPattern = `%${trimmedQuery}%`;
    const searchClause = `(
      e.name LIKE ?
      OR e.address LIKE ?
      OR e.district LIKE ?
      OR e.description LIKE ?
      OR CAST(e.id AS TEXT) = ?
    )`;

    if (state === "all") {
      const { results } = await db
        .prepare(`${select} WHERE ${searchClause} ${order}`)
        .bind(qPattern, qPattern, qPattern, qPattern, trimmedQuery, limit)
        .all<CandidateRow>();
      return results ?? [];
    }

    if (state === "unresolved_region") {
      const broadWhere = `
        WHERE (${searchClause}) AND (
          e.district IS NULL
          OR e.district = ''
          OR LOWER(e.district) IN ('stockholm', 'central stockholm', 'north stockholm', 'south stockholm', 'east stockholm', 'west stockholm', 'stockholms lan', 'stockholm county', 'stockholms kommun', 'sweden', 'sverige', 'unspecified')
        )
      `;
      const { results } = await db
        .prepare(`${select} ${broadWhere} ${order}`)
        .bind(qPattern, qPattern, qPattern, qPattern, trimmedQuery, limit)
        .all<CandidateRow>();
      return results ?? [];
    }

    if (state === "needs_input") {
      const needsWhere = `
        WHERE (${searchClause}) AND (
          e.website IS NULL OR e.website = ''
          OR e.address IS NULL OR e.address = ''
          OR e.district IS NULL OR e.district = ''
          OR LOWER(e.district) IN ('stockholm', 'central stockholm', 'north stockholm', 'south stockholm', 'east stockholm', 'west stockholm', 'stockholms lan', 'stockholm county', 'stockholms kommun', 'sweden', 'sverige', 'unspecified')
        )
      `;
      const { results } = await db
        .prepare(`${select} ${needsWhere} ${order}`)
        .bind(qPattern, qPattern, qPattern, qPattern, trimmedQuery, limit)
        .all<CandidateRow>();
      return results ?? [];
    }

    const { results } = await db
      .prepare(`${select} WHERE e.lifecycle_state = ? AND ${searchClause} ${order}`)
      .bind(state, qPattern, qPattern, qPattern, qPattern, trimmedQuery, limit)
      .all<CandidateRow>();
    return results ?? [];
  }

  if (state === "all") {
    const { results } = await db.prepare(`${select}${order}`).bind(limit).all<CandidateRow>();
    return results ?? [];
  }

  if (state === "unresolved_region") {
    const broadWhere = `
      WHERE e.district IS NULL
         OR e.district = ''
         OR LOWER(e.district) IN ('stockholm', 'central stockholm', 'north stockholm', 'south stockholm', 'east stockholm', 'west stockholm', 'stockholms lan', 'stockholm county', 'stockholms kommun', 'sweden', 'sverige', 'unspecified')
    `;
    const { results } = await db.prepare(`${select}${broadWhere} ${order}`).bind(limit).all<CandidateRow>();
    return results ?? [];
  }

  if (state === "needs_input") {
    const needsWhere = `
      WHERE e.website IS NULL OR e.website = ''
         OR e.address IS NULL OR e.address = ''
         OR e.district IS NULL OR e.district = ''
         OR LOWER(e.district) IN ('stockholm', 'central stockholm', 'north stockholm', 'south stockholm', 'east stockholm', 'west stockholm', 'stockholms lan', 'stockholm county', 'stockholms kommun', 'sweden', 'sverige', 'unspecified')
    `;
    const { results } = await db.prepare(`${select}${needsWhere} ${order}`).bind(limit).all<CandidateRow>();
    return results ?? [];
  }

  const { results } = await db
    .prepare(`${select}WHERE e.lifecycle_state = ? ${order}`)
    .bind(state, limit)
    .all<CandidateRow>();
  return results ?? [];
}

async function loadEvidenceProfile(db: D1Database, id: number) {
  const { results } = await db
    .prepare(
      `SELECT
        e.id,
        e.website,
        e.candidate_source_type AS candidateSourceType,
        GROUP_CONCAT(DISTINCT ev.source_type) AS evidenceSourceTypes,
        MAX(ev.captured_at) AS latestEvidenceAt
       FROM establishments e
       LEFT JOIN evidence_sources ev ON ev.establishment_id = e.id
       WHERE e.id = ?
       GROUP BY e.id`,
    )
    .bind(id)
    .all<Pick<CandidateRow, "id" | "website" | "candidateSourceType" | "evidenceSourceTypes" | "latestEvidenceAt">>();

  return results?.[0] ?? null;
}

async function loadEstablishment(db: D1Database, id: number) {
  const { results } = await db
    .prepare(
      `SELECT id, name, lifecycle_state AS lifecycleState
       FROM establishments
       WHERE id = ?`,
    )
    .bind(id)
    .all<EstablishmentLookupRow>();

  return results?.[0] ?? null;
}

async function mergeDuplicate(
  db: D1Database,
  id: number,
  payload: Record<string, unknown>,
  validationNotes: string | null,
) {
  const targetId = numericId(payload.targetId ?? payload.targetEstablishmentId);
  if (!targetId || targetId === id) {
    return Response.json(
      { error: "Missing or invalid duplicate merge target." },
      { headers: jsonHeaders, status: 400 },
    );
  }

  const [candidate, target] = await Promise.all([
    loadEstablishment(db, id),
    loadEstablishment(db, targetId),
  ]);

  if (!candidate) {
    return Response.json(
      { error: "Candidate not found." },
      { headers: jsonHeaders, status: 404 },
    );
  }

  if (!target) {
    return Response.json(
      { error: "Merge target not found." },
      { headers: jsonHeaders, status: 404 },
    );
  }

  if (target.lifecycleState === "candidate") {
    return Response.json(
      { error: "Duplicate merge target must be baseline, verified, or featured." },
      { headers: jsonHeaders, status: 400 },
    );
  }

  const reviewedAt = new Date().toISOString();
  const notes = joinNotes([
    validationNotes,
    `Merged duplicate candidate #${id} (${candidate.name}) into #${targetId} (${target.name}).`,
  ]);

  await db
    .prepare(
      `INSERT INTO evidence_sources (establishment_id, source_type, source_name, url, confidence, captured_at, summary)
       SELECT ?, source.source_type, source.source_name, source.url, source.confidence, source.captured_at, source.summary
       FROM evidence_sources source
       WHERE source.establishment_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM evidence_sources existing
         WHERE existing.establishment_id = ?
           AND existing.source_type = source.source_type
           AND existing.source_name = source.source_name
           AND COALESCE(existing.url, '') = COALESCE(source.url, '')
       )`,
    )
    .bind(targetId, id, targetId)
    .run();

  await db
    .prepare(
      `INSERT INTO establishment_tags (establishment_id, tag)
       SELECT ?, source.tag
       FROM establishment_tags source
       WHERE source.establishment_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM establishment_tags existing
         WHERE existing.establishment_id = ?
           AND existing.tag = source.tag
       )`,
    )
    .bind(targetId, id, targetId)
    .run();

  await db
    .prepare(
      `UPDATE establishments
       SET address = COALESCE(NULLIF(address, ''), (SELECT address FROM establishments WHERE id = ?)),
           website = COALESCE(NULLIF(website, ''), (SELECT website FROM establishments WHERE id = ?)),
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(id, id, reviewedAt, targetId)
    .run();

  const updateResult = await db
    .prepare(
      `UPDATE establishments
       SET candidate_review_status = 'merged_duplicate',
           duplicate_resolution = 'merged',
           merged_into_establishment_id = ?,
           validation_notes = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(targetId, notes, reviewedAt, id)
    .run();

  if (updateResult.meta?.changes === 0) {
    return Response.json(
      { error: "Candidate not found." },
      { headers: jsonHeaders, status: 404 },
    );
  }

  await recordReviewEvent(db, {
    establishmentId: id,
    lifecycleState: candidate.lifecycleState,
    validationLabel: null,
    validationNotes: notes,
    reviewedAt,
    action: "merge_duplicate",
    targetEstablishmentId: targetId,
  });

  return Response.json(
    {
      success: true,
      action: "merge_duplicate",
      id,
      targetEstablishmentId: targetId,
      reviewedAt,
    },
    { headers: jsonHeaders },
  );
}

async function keepSeparate(db: D1Database, id: number, validationNotes: string | null) {
  const candidate = await loadEstablishment(db, id);
  if (!candidate) {
    return Response.json(
      { error: "Candidate not found." },
      { headers: jsonHeaders, status: 404 },
    );
  }

  const reviewedAt = new Date().toISOString();
  const notes = joinNotes([validationNotes, "Duplicate check completed: keep as separate place."]);
  const updateResult = await db
    .prepare(
      `UPDATE establishments
       SET candidate_review_status = 'duplicate_checked_keep_separate',
           duplicate_resolution = 'keep_separate',
           validation_notes = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(notes, reviewedAt, id)
    .run();

  if (updateResult.meta?.changes === 0) {
    return Response.json(
      { error: "Candidate not found." },
      { headers: jsonHeaders, status: 404 },
    );
  }

  await recordReviewEvent(db, {
    establishmentId: id,
    lifecycleState: candidate.lifecycleState,
    validationLabel: null,
    validationNotes: notes,
    reviewedAt,
    action: "keep_separate",
  });

  return Response.json(
    {
      success: true,
      action: "keep_separate",
      id,
      reviewedAt,
    },
    { headers: jsonHeaders },
  );
}

async function updateDistrict(db: D1Database, id: number, payload: Record<string, unknown>, validationNotes: string | null) {
  const district = typeof payload.district === "string" ? payload.district.trim() : typeof payload.area === "string" ? payload.area.trim() : null;
  if (!district) {
    return Response.json(
      { error: "Missing or invalid district name." },
      { headers: jsonHeaders, status: 400 },
    );
  }

  const candidate = await loadEstablishment(db, id);
  if (!candidate) {
    return Response.json(
      { error: "Candidate not found." },
      { headers: jsonHeaders, status: 404 },
    );
  }

  const reviewedAt = new Date().toISOString();
  const notes = joinNotes([validationNotes, `Updated region to '${district}'.`]);
  const updateResult = await db
    .prepare(
      `UPDATE establishments
       SET district = ?, validation_notes = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(district, notes, reviewedAt, id)
    .run();

  if (updateResult.meta?.changes === 0) {
    return Response.json(
      { error: "Candidate not found." },
      { headers: jsonHeaders, status: 404 },
    );
  }

  await recordReviewEvent(db, {
    establishmentId: id,
    lifecycleState: candidate.lifecycleState,
    validationLabel: null,
    validationNotes: notes,
    reviewedAt,
    action: "update_district",
  });

  return Response.json(
    {
      success: true,
      action: "update_district",
      id,
      district,
      reviewedAt,
    },
    { headers: jsonHeaders },
  );
}

async function updateWebsite(db: D1Database, id: number, payload: Record<string, unknown>, validationNotes: string | null) {
  const websiteInput = typeof payload.website === "string" ? payload.website.trim() : typeof payload.url === "string" ? payload.url.trim() : null;
  if (!websiteInput) {
    return Response.json(
      { error: "Missing or invalid website URL." },
      { headers: jsonHeaders, status: 400 },
    );
  }

  let websiteUrl = websiteInput;
  if (!websiteUrl.startsWith("http://") && !websiteUrl.startsWith("https://")) {
    websiteUrl = `https://${websiteUrl}`;
  }

  const candidate = await loadEstablishment(db, id);
  if (!candidate) {
    return Response.json(
      { error: "Candidate not found." },
      { headers: jsonHeaders, status: 404 },
    );
  }

  const reviewedAt = new Date().toISOString();
  let scrapedPhotoUrl: string | null = null;

  if (payload.scrapeImage !== false) {
    try {
      const resp = await fetch(websiteUrl, {
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Motkarta/1.0",
        },
      });
      if (resp.ok) {
        const html = await resp.text();
        const ogMatch =
          html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
          html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
          html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);

        if (ogMatch && ogMatch[1]) {
          let imgUrl = ogMatch[1].trim();
          if (imgUrl.startsWith("//")) {
            imgUrl = `https:${imgUrl}`;
          } else if (imgUrl.startsWith("/")) {
            const parsed = new URL(websiteUrl);
            imgUrl = `${parsed.origin}${imgUrl}`;
          }
          if (imgUrl.startsWith("http://") || imgUrl.startsWith("https://")) {
            scrapedPhotoUrl = imgUrl;
          }
        }
      }
    } catch (scrapeErr) {
      console.warn("Website image scrape failed", scrapeErr);
    }
  }

  const notes = joinNotes([
    validationNotes,
    `Updated website to '${websiteUrl}'.${scrapedPhotoUrl ? ` Scraped og:image '${scrapedPhotoUrl}'.` : ""}`,
  ]);

  await db
    .prepare(
      `UPDATE establishments
       SET website = ?, validation_notes = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(websiteUrl, notes, reviewedAt, id)
    .run();

  if (scrapedPhotoUrl) {
    try {
      await db
        .prepare(
          `INSERT INTO place_photos (id, place_id, url, thumbnail_url, caption, credit)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET url = excluded.url, thumbnail_url = excluded.thumbnail_url`,
        )
        .bind(
          `web-scraped-${id}`,
          id,
          scrapedPhotoUrl,
          scrapedPhotoUrl,
          `${candidate.name} Official Web Photo`,
          "Official Venue Website",
        )
        .run();

      await db
        .prepare(
          `INSERT INTO evidence_sources (establishment_id, source_type, source_name, url, confidence, captured_at, summary)
           VALUES (?, 'official_site', 'Official Venue Website', ?, 0.9, ?, ?)`,
        )
        .bind(
          id,
          websiteUrl,
          reviewedAt,
          `Venue website and og:image metadata scraped by admin: ${scrapedPhotoUrl}`,
        )
        .run();
    } catch (dbMediaError) {
      console.warn("Could not insert scraped photo into D1", dbMediaError);
    }
  }

  await recordReviewEvent(db, {
    establishmentId: id,
    lifecycleState: candidate.lifecycleState,
    validationLabel: null,
    validationNotes: notes,
    reviewedAt,
    action: "update_website",
  });

  return Response.json(
    {
      success: true,
      action: "update_website",
      id,
      website: websiteUrl,
      scrapedPhotoUrl,
      reviewedAt,
    },
    { headers: jsonHeaders },
  );
}

async function recordReviewEvent(
  db: D1Database,
  event: {
    establishmentId: number;
    lifecycleState: PlaceLifecycleState;
    validationLabel: ValidationLabel | null;
    validationNotes: string | null;
    reviewedAt: string;
    action: AdminAction;
    targetEstablishmentId?: number;
  },
) {
  try {
    await db
      .prepare(
        `INSERT INTO admin_review_events
          (establishment_id, lifecycle_state, validation_label, validation_notes, reviewed_at, action, target_establishment_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        event.establishmentId,
        event.lifecycleState,
        event.validationLabel,
        event.validationNotes,
        event.reviewedAt,
        event.action,
        event.targetEstablishmentId ?? null,
      )
      .run();
  } catch (error) {
    console.warn("Could not write admin_review_events audit row", error);
  }
}

function candidateFromRow(row: CandidateRow) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    area: row.area,
    address: row.address,
    website: row.website,
    note: row.note,
    lifecycleState: row.lifecycleState,
    validationLabel: row.validationLabel ?? null,
    validationNotes: row.validationNotes ?? null,
    candidateSourceType: row.candidateSourceType,
    candidateSourceId: row.candidateSourceId,
    candidateReviewStatus: row.candidateReviewStatus,
    candidateAllowedUse: row.candidateAllowedUse,
    duplicateResolution: row.duplicateResolution,
    mergedIntoEstablishmentId: row.mergedIntoEstablishmentId,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
    evidenceCount: Number(row.evidenceCount ?? 0),
    evidenceSourceTypes: parseEvidenceSources(row.evidenceSourceTypes),
    latestEvidenceAt: row.latestEvidenceAt,
    evidenceGate: evidenceGateProfile(row),
    possibleDuplicateCount: Number(row.possibleDuplicateCount ?? 0),
    possibleDuplicates: parsePossibleDuplicates(row.possibleDuplicates),
  };
}

function duplicateCountSubquery() {
  return `(SELECT COUNT(*)
      FROM establishments m
      WHERE ${duplicatePredicate("m", "e")})`;
}

function duplicateMatchesSubquery() {
  return `(SELECT GROUP_CONCAT(
        m.id || '|' ||
        REPLACE(COALESCE(m.name, ''), '|', ' ') || '|' ||
        REPLACE(COALESCE(m.type, ''), '|', ' ') || '|' ||
        REPLACE(COALESCE(m.district, ''), '|', ' ') || '|' ||
        COALESCE(m.lifecycle_state, '') || '|' ||
        ${duplicateReasonExpression("m", "e")},
        ';;'
      )
      FROM establishments m
      WHERE ${duplicatePredicate("m", "e")})`;
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

function duplicateReasonExpression(matchAlias: string, candidateAlias: string) {
  return `CASE
      WHEN ${normalizedSql(`${matchAlias}.name`)} = ${normalizedSql(`${candidateAlias}.name`)}
        AND LOWER(COALESCE(${matchAlias}.district, '')) = LOWER(COALESCE(${candidateAlias}.district, '')) THEN 'name_area'
      WHEN COALESCE(${candidateAlias}.address, '') != ''
        AND COALESCE(${matchAlias}.address, '') != ''
        AND ${normalizedSql(`${matchAlias}.address`)} = ${normalizedSql(`${candidateAlias}.address`)} THEN 'address'
      ELSE 'nearby_name'
    END`;
}

function normalizedSql(column: string) {
  return `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${column}, ''), ' ', ''), '-', ''), '.', ''), '''', ''))`;
}

function evidenceGateProfile(
  row: Pick<CandidateRow, "candidateSourceType" | "evidenceSourceTypes" | "latestEvidenceAt" | "website">,
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
    independentEvidenceCount: independentEvidenceTypes.length,
    independentEvidenceTypes,
    canPromoteHiddenGem: independentEvidenceTypes.length >= 2,
    hasCurrentExistence,
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

function isLifecycleState(value: string): value is PlaceLifecycleState {
  return lifecycleStates.includes(value as PlaceLifecycleState);
}

function isStateFilter(value: string): value is CandidateStateFilter {
  return stateFilters.includes(value as CandidateStateFilter);
}

function normalizeAction(value: unknown): AdminAction | null {
  if (value === undefined || value === null || value === "") {
    return "promote";
  }

  if (typeof value === "string" && adminActions.includes(value as AdminAction)) {
    return value as AdminAction;
  }

  return null;
}

function normalizeValidationLabel(value: unknown): ValidationLabel | null | "invalid" {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "string" && validationLabels.includes(value as ValidationLabel)) {
    return value as ValidationLabel;
  }

  return "invalid";
}

function normalizeNotes(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 2_000) : null;
}

function numericId(value: unknown) {
  const id = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

function clampLimit(value: string | null) {
  const parsed = Number(value ?? 100);
  if (!Number.isFinite(parsed)) {
    return 100;
  }

  return Math.min(200, Math.max(1, Math.floor(parsed)));
}

function parseEvidenceSources(value: string | null) {
  if (!value) {
    return [];
  }

  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parsePossibleDuplicates(value: string | null) {
  if (!value) {
    return [];
  }

  return value
    .split(";;")
    .map((entry) => {
      const [id, name, kind, area, lifecycleState, reason] = entry.split("|");
      const parsedId = Number(id);
      if (!Number.isInteger(parsedId)) {
        return null;
      }
      return {
        id: parsedId,
        name: name ?? "",
        kind: kind ?? "",
        area: area ?? "",
        lifecycleState: lifecycleState ?? "",
        reason: reason ?? "possible_match",
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

function joinNotes(notes: Array<string | null>) {
  return notes.map((note) => note?.trim()).filter(Boolean).join(" ");
}
