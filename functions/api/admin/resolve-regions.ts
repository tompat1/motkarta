import { requireAdmin, type AdminAuthEnv } from "../../../lib/admin-auth.ts";
import { isBroadStockholmArea, resolveStockholmRegion } from "../../../lib/stockholm-regions.ts";

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

type EstablishmentRow = {
  id: number;
  name: string;
  district: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-cache",
};

export async function onRequestPost(context: EventContext<Env>) {
  return handleResolveRegions(context);
}

export async function onRequestGet(context: EventContext<Env>) {
  return handleResolveRegions(context);
}

async function handleResolveRegions(context: EventContext<Env>) {
  const auth = await requireAdmin(context.request, context.env);
  if (auth) return auth;

  const db = context.env.DB as D1Database | undefined;
  if (!db) {
    return Response.json(
      { source: "unavailable", error: "No production D1 dataset is bound." },
      { headers: jsonHeaders, status: 503 },
    );
  }

  const { results } = await db
    .prepare(
      `SELECT id, name, district, address, latitude, longitude
       FROM establishments
       ORDER BY id ASC`,
    )
    .all<EstablishmentRow>();

  const rows = results ?? [];
  const updatedAt = new Date().toISOString();
  const updatedPlaces: Array<{
    id: number;
    name: string;
    previousDistrict: string;
    resolvedDistrict: string;
  }> = [];

  for (const row of rows) {
    const currentDistrict = row.district?.trim() ?? "";
    if (!isBroadStockholmArea(currentDistrict)) {
      continue;
    }

    const resolved = resolveStockholmRegion({
      name: row.name,
      area: currentDistrict,
      address: row.address ?? undefined,
      latitude: row.latitude ?? undefined,
      longitude: row.longitude ?? undefined,
    });

    if (resolved && resolved !== currentDistrict && !isBroadStockholmArea(resolved)) {
      await db
        .prepare(
          `UPDATE establishments
           SET district = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(resolved, updatedAt, row.id)
        .run();

      try {
        await db
          .prepare(
            `INSERT INTO admin_review_events
              (establishment_id, lifecycle_state, validation_label, validation_notes, reviewed_at, action)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            row.id,
            "candidate",
            null,
            `Automated region resolution: updated district from '${currentDistrict || "unspecified"}' to '${resolved}'.`,
            updatedAt,
            "resolve_region",
          )
          .run();
      } catch (auditError) {
        console.warn("Could not record audit log for region resolution", auditError);
      }

      updatedPlaces.push({
        id: row.id,
        name: row.name,
        previousDistrict: currentDistrict || "unspecified",
        resolvedDistrict: resolved,
      });
    }
  }

  return Response.json(
    {
      success: true,
      totalChecked: rows.length,
      resolvedCount: updatedPlaces.length,
      updatedPlaces,
    },
    { headers: jsonHeaders },
  );
}
