import { requireAdmin, type AdminAuthEnv } from "../../../lib/admin-auth.ts";

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

type TableInfoRow = {
  name: string;
};

type ColumnInfoRow = {
  name: string;
};

type SchemaIssue = {
  kind: "missing_table" | "missing_column";
  table: string;
  column?: string;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-cache",
};

const establishmentColumns = [
  {
    table: "establishments",
    column: "lifecycle_state",
    sql: "ALTER TABLE establishments ADD COLUMN lifecycle_state text DEFAULT 'baseline' NOT NULL CHECK (lifecycle_state IN ('baseline', 'candidate', 'verified', 'featured'))",
  },
  {
    table: "establishments",
    column: "validation_label",
    sql: "ALTER TABLE establishments ADD COLUMN validation_label text CHECK (validation_label IS NULL OR validation_label IN ('known_mainstream', 'known_hidden_gem', 'not_enough_evidence', 'closed_wrong_category'))",
  },
  {
    table: "establishments",
    column: "validation_notes",
    sql: "ALTER TABLE establishments ADD COLUMN validation_notes text",
  },
  {
    table: "establishments",
    column: "address",
    sql: "ALTER TABLE establishments ADD COLUMN address text",
  },
  {
    table: "establishments",
    column: "website",
    sql: "ALTER TABLE establishments ADD COLUMN website text",
  },
  {
    table: "establishments",
    column: "candidate_source_type",
    sql: "ALTER TABLE establishments ADD COLUMN candidate_source_type text",
  },
  {
    table: "establishments",
    column: "candidate_source_id",
    sql: "ALTER TABLE establishments ADD COLUMN candidate_source_id text",
  },
  {
    table: "establishments",
    column: "candidate_review_status",
    sql: "ALTER TABLE establishments ADD COLUMN candidate_review_status text",
  },
  {
    table: "establishments",
    column: "candidate_allowed_use",
    sql: "ALTER TABLE establishments ADD COLUMN candidate_allowed_use text",
  },
  {
    table: "establishments",
    column: "duplicate_resolution",
    sql: "ALTER TABLE establishments ADD COLUMN duplicate_resolution text CHECK (duplicate_resolution IS NULL OR duplicate_resolution IN ('merged', 'keep_separate'))",
  },
  {
    table: "establishments",
    column: "merged_into_establishment_id",
    sql: "ALTER TABLE establishments ADD COLUMN merged_into_establishment_id integer",
  },
] as const;

const adminReviewEventColumns = [
  {
    table: "admin_review_events",
    column: "action",
    sql: "ALTER TABLE admin_review_events ADD COLUMN action text DEFAULT 'promote' NOT NULL CHECK (action IN ('promote', 'merge_duplicate', 'keep_separate'))",
  },
  {
    table: "admin_review_events",
    column: "target_establishment_id",
    sql: "ALTER TABLE admin_review_events ADD COLUMN target_establishment_id integer",
  },
] as const;

export async function onRequestGet(context: EventContext<Env>) {
  const auth = await requireAdmin(context.request, context.env);
  if (auth) return auth;

  const db = context.env.DB as D1Database | undefined;
  if (!db) {
    return Response.json(
      { source: "unavailable", error: "No production D1 dataset is bound." },
      { headers: jsonHeaders, status: 503 },
    );
  }

  const status = await loadSchemaStatus(db);
  return Response.json({ source: "d1", ...status }, { headers: jsonHeaders });
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

  const before = await loadSchemaStatus(db);
  if (before.baseSchemaReady) {
    await ensureAdminSchema(db);
  }
  const after = await loadSchemaStatus(db);

  return Response.json(
    {
      source: "d1",
      success: after.ready,
      applied: before.missing.length - after.missing.length,
      before,
      ...after,
    },
    { headers: jsonHeaders, status: after.ready ? 200 : 409 },
  );
}

async function ensureAdminSchema(db: D1Database) {
  await ensureColumns(db, "establishments", establishmentColumns);
  await db.prepare(createAdminReviewEventsSql()).run();
  await ensureColumns(db, "admin_review_events", adminReviewEventColumns);
  await db.prepare(createAdminLabelExportsSql()).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS establishments_lifecycle_idx ON establishments (lifecycle_state)").run();
  await tryRun(
    db,
    "CREATE UNIQUE INDEX IF NOT EXISTS establishments_candidate_source_unique_idx ON establishments (candidate_source_type, candidate_source_id)",
  );
  await db.prepare("CREATE INDEX IF NOT EXISTS establishments_duplicate_resolution_idx ON establishments (duplicate_resolution, merged_into_establishment_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS admin_review_events_establishment_idx ON admin_review_events (establishment_id, reviewed_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS admin_label_exports_exported_at_idx ON admin_label_exports (exported_at)").run();
}

async function tryRun(db: D1Database, sql: string) {
  try {
    await db.prepare(sql).run();
  } catch (error) {
    console.warn("Optional admin schema statement failed", error);
  }
}

async function ensureColumns(
  db: D1Database,
  table: string,
  columns: readonly { table: string; column: string; sql: string }[],
) {
  const existingColumns = await loadColumnSet(db, table);
  for (const column of columns) {
    if (!existingColumns.has(column.column)) {
      await db.prepare(column.sql).run();
    }
  }
}

async function loadSchemaStatus(db: D1Database) {
  const missing: SchemaIssue[] = [];
  const establishmentsReady = await tableExists(db, "establishments");
  const adminReviewEventsReady = await tableExists(db, "admin_review_events");
  const adminLabelExportsReady = await tableExists(db, "admin_label_exports");

  if (!establishmentsReady) {
    missing.push({ kind: "missing_table", table: "establishments" });
  } else {
    await pushMissingColumns(db, missing, "establishments", establishmentColumns);
  }

  if (!adminReviewEventsReady) {
    missing.push({ kind: "missing_table", table: "admin_review_events" });
  } else {
    await pushMissingColumns(db, missing, "admin_review_events", adminReviewEventColumns);
  }

  if (!adminLabelExportsReady) {
    missing.push({ kind: "missing_table", table: "admin_label_exports" });
  }

  return {
    checkedAt: new Date().toISOString(),
    ready: missing.length === 0,
    baseSchemaReady: establishmentsReady,
    missing,
  };
}

async function pushMissingColumns(
  db: D1Database,
  missing: SchemaIssue[],
  table: string,
  columns: readonly { table: string; column: string; sql: string }[],
) {
  const existingColumns = await loadColumnSet(db, table);
  for (const column of columns) {
    if (!existingColumns.has(column.column)) {
      missing.push({ kind: "missing_column", table, column: column.column });
    }
  }
}

async function tableExists(db: D1Database, table: string) {
  const { results } = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(table)
    .all<TableInfoRow>();
  return Boolean(results?.[0]?.name);
}

async function loadColumnSet(db: D1Database, table: string) {
  const { results } = await db.prepare(`PRAGMA table_info(${table})`).all<ColumnInfoRow>();
  return new Set((results ?? []).map((row) => row.name));
}

function createAdminReviewEventsSql() {
  return `CREATE TABLE IF NOT EXISTS admin_review_events (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    establishment_id integer NOT NULL,
    lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('baseline', 'candidate', 'verified', 'featured')),
    validation_label text CHECK (validation_label IS NULL OR validation_label IN ('known_mainstream', 'known_hidden_gem', 'not_enough_evidence', 'closed_wrong_category')),
    validation_notes text,
    reviewed_at text NOT NULL,
    action text DEFAULT 'promote' NOT NULL CHECK (action IN ('promote', 'merge_duplicate', 'keep_separate')),
    target_establishment_id integer,
    FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON UPDATE no action ON DELETE cascade
  )`;
}

function createAdminLabelExportsSql() {
  return `CREATE TABLE IF NOT EXISTS admin_label_exports (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    exported_at text NOT NULL,
    event_count integer NOT NULL DEFAULT 0,
    label_count integer NOT NULL DEFAULT 0,
    duplicate_resolution_count integer NOT NULL DEFAULT 0,
    exported_by text,
    notes text
  )`;
}
