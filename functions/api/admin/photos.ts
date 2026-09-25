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

export async function onRequestPost(context: Context) {
  const auth = await requireAdmin(context.request, context.env);
  if (auth) return auth;

  const db = context.env.DB as D1Database | undefined;
  if (!db) return Response.json({ error: "No production D1 dataset is bound." }, { status: 503, headers });

  let payload: Record<string, unknown>;
  try {
    payload = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400, headers });
  }

  const placeId = photoPlaceId(payload.placeId ?? payload.place_id);
  const photoId = typeof payload.photoId === "string" ? payload.photoId.trim() : typeof payload.photo_id === "string" ? payload.photo_id.trim() : "";
  const url = normalizePhotoUrl(typeof payload.url === "string" ? payload.url : "");
  const thumbnailUrl = normalizePhotoUrl(typeof payload.thumbnailUrl === "string" ? payload.thumbnailUrl : typeof payload.thumbnail_url === "string" ? payload.thumbnail_url : url);
  const caption = typeof payload.caption === "string" ? payload.caption.trim() : "";
  const credit = typeof payload.credit === "string" ? payload.credit.trim() : "Admin curated";

  if (!placeId || !url) {
    return Response.json({ error: "Missing or invalid placeId/url." }, { status: 400, headers });
  }

  const reviewedAt = new Date().toISOString();
  const resolvedPhotoId = photoId || `admin-${placeId}-${Date.now()}`;
  const resolvedCaption = caption || "Admin curated place photo";

  await db
    .prepare(
      `INSERT INTO place_photos (id, place_id, url, thumbnail_url, caption, credit, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         url = excluded.url,
         thumbnail_url = excluded.thumbnail_url,
         caption = excluded.caption,
         credit = excluded.credit`,
    )
    .bind(resolvedPhotoId, placeId, url, thumbnailUrl || url, resolvedCaption, credit, reviewedAt)
    .run();

  return Response.json(
    {
      success: true,
      placeId,
      photo: {
        id: resolvedPhotoId,
        placeId,
        url,
        thumbnailUrl: thumbnailUrl || url,
        caption: resolvedCaption,
        credit,
      },
    },
    { headers },
  );
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

function photoPlaceId(value: unknown) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizePhotoUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed.replace(/^http:\/\//i, "https://");
}
