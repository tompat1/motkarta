import { uploadedPhotos } from "../../../lib/photo-uploads.ts";
import { requireAdmin, type AdminAuthEnv } from "../../../lib/admin-auth.ts";

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};

type D1Database = { prepare(query: string): D1Statement };
type Env = { DB?: unknown } & AdminAuthEnv;
type Context = { request: Request; env: Env };

type AdminPhoto = {
  id: string;
  placeId: number;
  url: string;
  thumbnailUrl: string;
  caption: string;
  credit?: string | null;
  width?: number | null;
  height?: number | null;
};

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export async function onRequestGet(context: Context) {
  const auth = await requireAdmin(context.request, context.env);
  if (auth) return auth;
  const placeId = parsePlaceId(context.request);
  if (placeId === null) return Response.json({ error: "Invalid place_id." }, { status: 400, headers });
  const db = context.env.DB as D1Database | undefined;
  if (!db) return Response.json({ error: "No production D1 dataset is bound." }, { status: 503, headers });

  const { results } = await db.prepare(
    `SELECT id, place_id AS placeId, url, thumbnail_url AS thumbnailUrl, caption, credit, width, height
     FROM place_photos WHERE place_id = ? ORDER BY id DESC`,
  ).bind(placeId).all<AdminPhoto>();
  return Response.json({ placeId, photos: [...await uploadedPhotos(db, placeId), ...(results ?? [])] }, { headers });
}

export async function onRequestDelete(context: Context) {
  const auth = await requireAdmin(context.request, context.env);
  if (auth) return auth;
  const placeId = parsePlaceId(context.request);
  const photoId = new URL(context.request.url).searchParams.get("photo_id")?.trim();
  if (placeId === null || !photoId) return Response.json({ error: "Invalid place_id or photo_id." }, { status: 400, headers });
  const db = context.env.DB as D1Database | undefined;
  if (!db) return Response.json({ error: "No production D1 dataset is bound." }, { status: 503, headers });

  const table = photoId.startsWith("upload-") ? "place_photo_uploads" : "place_photos";
  const result = await db.prepare(`DELETE FROM ${table} WHERE id = ? AND place_id = ?`).bind(photoId, placeId).run();
  if (!result.meta?.changes) return Response.json({ error: "Photo not found." }, { status: 404, headers });
  return Response.json({ success: true, placeId, photoId }, { headers });
}

function parsePlaceId(request: Request) {
  const value = Number(new URL(request.url).searchParams.get("place_id"));
  return Number.isInteger(value) && value > 0 ? value : null;
}
