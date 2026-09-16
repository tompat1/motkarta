import type { PlacePhoto } from "./lazy-media.ts";

export const MAX_UPLOAD_BYTES = 1024 * 1024;
export const MAX_UPLOAD_BODY_BYTES = Math.ceil(MAX_UPLOAD_BYTES / 3) * 4 + 4096;
export const photoHeaders = { "cache-control": "no-store" };

export type PhotoStatement = {
  bind(...values: unknown[]): PhotoStatement;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};
export type PhotoDatabase = { prepare(query: string): PhotoStatement };
export type PhotoEnv = { DB?: unknown };

export function photoPlaceId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function parsePhotoIdentity(value: unknown): string[] | null {
  return typeof value === "string" && /^(node|way|relation):\d+$/.test(value) ? value.split(":") : null;
}

export async function uploadedPhotos(db: PhotoDatabase, placeId: number, osmIdentity?: string | null): Promise<PlacePhoto[]> {
  const identity = parsePhotoIdentity(osmIdentity);
  const { results } = await db.prepare(`SELECT u.id, u.caption FROM place_photo_uploads u
    JOIN establishments e ON e.id = u.place_id
    WHERE ${identity ? "e.osm_type = ? AND e.osm_id = ?" : "u.place_id = ?"}
    ORDER BY u.created_at DESC, u.id DESC`)
    .bind(...(identity ?? [placeId])).all<{ id: string; caption: string }>();
  return (results ?? []).map(({ id, caption }) => ({
    id, placeId, caption, credit: "Community upload",
    url: `/api/photo-upload?id=${id}`, thumbnailUrl: `/api/photo-upload?id=${id}`,
  }));
}

// Limit the stream itself: Content-Length is optional and cannot be trusted.
export async function readUploadBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("empty");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_UPLOAD_BODY_BYTES) {
      await reader.cancel();
      throw new Error("size");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(body));
}

export function decodePhoto(dataUrl: unknown): { contentType: string; base64: string } | null {
  if (typeof dataUrl !== "string") return null;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || match[2].length % 4 !== 0) return null;
  let bytes: string;
  try { bytes = atob(match[2]); } catch { return null; }
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) return null;
  const type = match[1];
  const valid = type === "image/jpeg" ? bytes.startsWith("\xff\xd8\xff") && bytes.endsWith("\xff\xd9")
    : type === "image/png" ? bytes.startsWith("\x89PNG\r\n\x1a\n") && bytes.length >= 33
    : bytes.startsWith("RIFF") && bytes.slice(8, 12) === "WEBP" && bytes.length >= 20;
  return valid ? { contentType: type, base64: match[2] } : null;
}
