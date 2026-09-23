import { requireAdmin, type AdminAuthEnv } from "../../../lib/admin-auth.ts";
import { mergeDistrictNames, listCanonicalDistricts } from "../../../lib/admin-districts.ts";
import { isD1QuotaError } from "../../../lib/admin-d1.ts";

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

type DistrictCountRow = {
  district: string;
  placeCount: number;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-cache",
};

export async function onRequestGet(context: EventContext<Env>) {
  try {
    const auth = await requireAdmin(context.request, context.env);
    if (auth) return auth;

    const db = context.env.DB as D1Database | undefined;
    if (!db) {
      return Response.json(
        { source: "unavailable", districts: [], error: "No production D1 dataset is bound." },
        { headers: jsonHeaders, status: 503 },
      );
    }

    const districts = await loadDistrictCatalog(db);
    return Response.json({ source: "d1", districts }, { headers: jsonHeaders });
  } catch (error) {
    const isQuota = isD1QuotaError(error);
    console.error("GET /api/admin/districts failed:", error);
    return Response.json(
      {
        source: "d1",
        districts: [],
        quotaExceeded: isQuota,
        error: error instanceof Error ? error.message : "Could not load districts.",
      },
      { headers: jsonHeaders, status: isQuota ? 429 : 500 },
    );
  }
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
    return Response.json({ error: "Invalid JSON body." }, { headers: jsonHeaders, status: 400 });
  }

  const action = typeof payload.action === "string" ? payload.action : "";
  if (action === "rename") {
    return renameDistrict(db, payload);
  }
  if (action === "merge") {
    return mergeDistrict(db, payload);
  }
  if (action === "reassign") {
    return reassignDistrict(db, payload);
  }

  return Response.json({ error: "Invalid district action." }, { headers: jsonHeaders, status: 400 });
}

async function loadDistrictCatalog(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT district, COUNT(*) AS placeCount
       FROM establishments
       WHERE district IS NOT NULL AND TRIM(district) != ''
       GROUP BY district
       ORDER BY district ASC`,
    )
    .all<DistrictCountRow>();

  const counts = new Map<string, number>();
  for (const row of results ?? []) {
    const name = row.district?.trim();
    if (!name) continue;
    counts.set(name, Number(row.placeCount ?? 0));
  }

  const names = mergeDistrictNames(listCanonicalDistricts(), [...counts.keys()]);
  return names.map((name) => ({
    name,
    placeCount: counts.get(name) ?? 0,
    canonical: (listCanonicalDistricts() as readonly string[]).includes(name),
  }));
}

async function renameDistrict(db: D1Database, payload: Record<string, unknown>) {
  const from = normalizeDistrictName(payload.from);
  const to = normalizeDistrictName(payload.to);
  if (!from || !to) {
    return Response.json({ error: "Both from and to district names are required." }, { headers: jsonHeaders, status: 400 });
  }
  if (from.toLowerCase() === to.toLowerCase()) {
    return Response.json({ error: "Source and target district names must differ." }, { headers: jsonHeaders, status: 400 });
  }

  const updatedAt = new Date().toISOString();
  const result = await db
    .prepare(`UPDATE establishments SET district = ?, updated_at = ? WHERE LOWER(TRIM(district)) = LOWER(TRIM(?))`)
    .bind(to, updatedAt, from)
    .run();

  return Response.json(
    {
      success: true,
      action: "rename",
      from,
      to,
      updatedCount: result.meta?.changes ?? 0,
      reviewedAt: updatedAt,
    },
    { headers: jsonHeaders },
  );
}

async function mergeDistrict(db: D1Database, payload: Record<string, unknown>) {
  const from = normalizeDistrictName(payload.from);
  const into = normalizeDistrictName(payload.into ?? payload.to);
  if (!from || !into) {
    return Response.json({ error: "Both from and into district names are required." }, { headers: jsonHeaders, status: 400 });
  }
  return renameDistrict(db, { from, to: into });
}

async function reassignDistrict(db: D1Database, payload: Record<string, unknown>) {
  const from = normalizeDistrictName(payload.from);
  const to = normalizeDistrictName(payload.to);
  if (!from || !to) {
    return Response.json({ error: "Both from and to district names are required." }, { headers: jsonHeaders, status: 400 });
  }
  return renameDistrict(db, { from, to });
}

function normalizeDistrictName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 120);
}
