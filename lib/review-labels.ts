export type ReviewEventExportRow = {
  event_id?: number | string | null;
  establishment_id?: number | string | null;
  id?: number | string | null;
  name?: unknown;
  candidate_source_type?: unknown;
  candidate_source_id?: unknown;
  duplicate_resolution?: unknown;
  merged_into_establishment_id?: number | string | null;
  lifecycle_state?: unknown;
  validation_label?: unknown;
  validation_notes?: unknown;
  action?: unknown;
  target_establishment_id?: number | string | null;
  reviewed_at?: unknown;
};

type ReviewLabelExportOptions = {
  updatedAt?: string;
};

export function buildReviewLabelExport(rows: ReviewEventExportRow[], options: ReviewLabelExportOptions = {}) {
  const latestByPlace = new Map<string, ReviewEventExportRow>();

  for (const row of rows) {
    const key = clean(row.establishment_id ?? row.id);
    if (!key) {
      continue;
    }

    const existing = latestByPlace.get(key);
    if (!existing || isNewerReviewEvent(row, existing)) {
      latestByPlace.set(key, row);
    }
  }

  const labels = [];
  const duplicateResolutions = [];

  for (const row of latestByPlace.values()) {
    const placeId = clean(row.establishment_id ?? row.id);
    const action = clean(row.action);
    const duplicateResolution = clean(row.duplicate_resolution);
    const validationLabel = clean(row.validation_label);
    const base = {
      id: `place:${placeId}`,
      name: clean(row.name),
      sourceType: clean(row.candidate_source_type),
      sourceId: clean(row.candidate_source_id),
      notes: clean(row.validation_notes),
      reviewedAt: clean(row.reviewed_at),
    };

    if (validationLabel) {
      labels.push({
        ...base,
        label: validationLabel,
      });
    }

    if (duplicateResolution || action === "merge_duplicate" || action === "keep_separate") {
      duplicateResolutions.push({
        ...base,
        action,
        duplicateResolution,
        targetEstablishmentId: row.target_establishment_id ?? row.merged_into_establishment_id ?? null,
      });
    }
  }

  return {
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    policy:
      "Human validation labels exported from admin review events. Duplicate resolutions are kept separate from hidden-gem/mainstream labels.",
    labels,
    duplicateResolutions,
  };
}

export function extractReviewRows(payload: unknown): ReviewEventExportRow[] {
  if (Array.isArray(payload)) {
    const first = payload[0];
    if (isObject(first) && Array.isArray(first.results)) {
      return first.results as ReviewEventExportRow[];
    }
    return payload as ReviewEventExportRow[];
  }

  if (isObject(payload) && Array.isArray(payload.results)) {
    return payload.results as ReviewEventExportRow[];
  }

  throw new Error("Expected a JSON array, Wrangler D1 JSON response, or object with results.");
}

function isNewerReviewEvent(candidate: ReviewEventExportRow, current: ReviewEventExportRow) {
  const candidateTime = Date.parse(clean(candidate.reviewed_at)) || 0;
  const currentTime = Date.parse(clean(current.reviewed_at)) || 0;
  if (candidateTime !== currentTime) {
    return candidateTime > currentTime;
  }

  return numericSortValue(candidate.event_id) > numericSortValue(current.event_id);
}

function numericSortValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isObject(value: unknown): value is { results?: unknown } {
  return Boolean(value) && typeof value === "object";
}

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
