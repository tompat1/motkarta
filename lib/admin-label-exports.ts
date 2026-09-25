import { buildReviewLabelExport, type ReviewEventExportRow } from "./review-labels.ts";

type LabelExportStatement = {
  bind(...values: unknown[]): LabelExportStatement;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ success?: boolean; meta?: { changes?: number } }>;
};

export type LabelExportDatabase = {
  prepare(query: string): LabelExportStatement;
};

type RecordReviewLabelCheckpointOptions = {
  exportedBy?: string;
  updatedAt?: string;
};

export function reviewEventExportQuery() {
  return `
    SELECT
      ev.id AS event_id,
      ev.establishment_id,
      e.name,
      e.candidate_source_type,
      e.candidate_source_id,
      e.duplicate_resolution,
      e.merged_into_establishment_id,
      ev.lifecycle_state,
      ev.validation_label,
      ev.validation_notes,
      ev.action,
      ev.target_establishment_id,
      ev.reviewed_at
    FROM admin_review_events ev
    JOIN establishments e ON e.id = ev.establishment_id
    ORDER BY ev.reviewed_at DESC, ev.id DESC
  `;
}

export async function recordReviewLabelCheckpoint(
  db: LabelExportDatabase,
  options: RecordReviewLabelCheckpointOptions = {},
) {
  const { results } = await db.prepare(reviewEventExportQuery()).all<ReviewEventExportRow>();
  const rows = results ?? [];
  const output = buildReviewLabelExport(rows, { updatedAt: options.updatedAt });

  await db
    .prepare(
      `INSERT INTO admin_label_exports
        (exported_at, event_count, label_count, duplicate_resolution_count, exported_by)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      output.updatedAt,
      rows.length,
      output.labels.length,
      output.duplicateResolutions.length,
      options.exportedBy ?? "auto_review",
    )
    .run();

  return {
    ...output,
    eventCount: rows.length,
  };
}

export async function syncReviewLabelCheckpoint(
  db: LabelExportDatabase,
  options: RecordReviewLabelCheckpointOptions = {},
) {
  try {
    return await recordReviewLabelCheckpoint(db, options);
  } catch (error) {
    console.warn("Could not sync review label checkpoint", error);
    return null;
  }
}
