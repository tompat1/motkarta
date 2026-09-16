import { decodePhoto, parsePhotoIdentity, photoHeaders, photoPlaceId, readUploadBody, type PhotoDatabase, type PhotoEnv } from "../../lib/photo-uploads.ts";

type Context = { request: Request; env: PhotoEnv };
const error = (message: string, status: number) => Response.json({ error: message }, { status, headers: photoHeaders });

export async function onRequestPost({ request, env }: Context) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return error("Cross-origin uploads are not allowed.", 403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) return error("Expected JSON.", 415);
  const db = env.DB as PhotoDatabase | undefined;
  if (!db) return error("Photo uploads are temporarily unavailable.", 503);
  let payload;
  try { payload = await readUploadBody(request); }
  catch (cause) { return error("Invalid or oversized upload (maximum 1 MiB image).", cause instanceof Error && cause.message === "size" ? 413 : 400); }
  if (!payload || typeof payload !== "object") return error("Invalid upload.", 400);
  const body = payload as Record<string, unknown>;
  const publicPlaceId = photoPlaceId(body.placeId);
  const photo = decodePhoto(body.dataUrl);
  if (!publicPlaceId || !photo || typeof body.caption !== "string" || body.caption.length > 160) return error("Invalid place, caption or image. Use JPG, PNG or WebP up to 1 MiB.", 400);
  if (body.osmIdentity !== undefined && !parsePhotoIdentity(body.osmIdentity)) return error("Invalid place identity.", 400);
  try {
    // Public static IDs and D1 IDs can differ. Resolve full OSM identity when supplied.
    const identity = parsePhotoIdentity(body.osmIdentity);
    const { results } = await db.prepare(`SELECT id FROM establishments WHERE ${identity ? "osm_type = ? AND osm_id = ?" : "id = ?"} LIMIT 1`)
      .bind(...(identity ?? [publicPlaceId])).all<{ id: number }>();
    const placeId = results?.[0]?.id;
    if (!placeId) return error("This place is not available for photo uploads yet.", 404);
    const id = `upload-${crypto.randomUUID()}`;
    // One statement atomically persists bytes + metadata and enforces a per-venue daily cap.
    const saved = await db.prepare(`INSERT INTO place_photo_uploads
      (id, place_id, caption, content_type, image_base64)
      SELECT ?, ?, ?, ?, ? WHERE
      (SELECT COUNT(*) FROM place_photo_uploads WHERE place_id = ? AND created_at >= datetime('now', '-1 day')) < 20`)
      .bind(id, placeId, body.caption.trim(), photo.contentType, photo.base64, placeId).run();
    if (!saved.meta?.changes) return error("This place has reached its daily photo limit. Try again later.", 429);
    const url = `/api/photo-upload?id=${id}`;
    return Response.json({ photo: { id, placeId: publicPlaceId, url, thumbnailUrl: url, caption: body.caption.trim(), credit: "Community upload" } }, { status: 201, headers: photoHeaders });
  } catch (cause) {
    console.error("Photo upload failed", cause);
    return error("Could not save the photo. Please try again later.", 503);
  }
}

export async function onRequestGet({ request, env }: Context) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^upload-[0-9a-f-]{36}$/.test(id)) return error("Invalid photo ID.", 400);
  const db = env.DB as PhotoDatabase | undefined;
  if (!db) return error("Photos are temporarily unavailable.", 503);
  try {
    const { results } = await db.prepare("SELECT content_type, image_base64 FROM place_photo_uploads WHERE id = ?")
      .bind(id).all<{ content_type: string; image_base64: string }>();
    const photo = results?.[0];
    if (!photo) return error("Photo not found.", 404);
    const bytes = Uint8Array.from(atob(photo.image_base64), (char) => char.charCodeAt(0));
    return new Response(bytes, { headers: { ...photoHeaders, "content-type": photo.content_type, "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" } });
  } catch (cause) {
    console.error("Photo read failed", cause);
    return error("Photos are temporarily unavailable.", 503);
  }
}
