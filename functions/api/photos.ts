import { parsePhotoIdentity, photoPlaceId, uploadedPhotos, type PhotoDatabase } from "../../lib/photo-uploads.ts";
import type { PlacePhoto } from "../../lib/lazy-media.ts";

type EventContext<Env> = {
  request: Request;
  env: Env;
};

type Env = { DB?: unknown };

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export async function onRequestGet(context: EventContext<Env>) {
  const url = new URL(context.request.url);
  const placeIdParam = url.searchParams.get("place_id") || url.searchParams.get("placeId");

  if (!placeIdParam) {
    return Response.json(
      { error: "Missing place_id query parameter" },
      { status: 400, headers: jsonHeaders },
    );
  }

  const placeId = photoPlaceId(placeIdParam);
  if (placeId === null) {
    return Response.json(
      { error: "Invalid place_id" },
      { status: 400, headers: jsonHeaders },
    );
  }

  const osmIdentity = url.searchParams.get("osm_identity");
  if (osmIdentity && !parsePhotoIdentity(osmIdentity)) {
    return Response.json({ error: "Invalid place identity" }, { status: 400, headers: jsonHeaders });
  }
  const db = context.env.DB as PhotoDatabase | undefined;
  if (db) {
    try {
      const { results } = await db
        .prepare(
          `SELECT id, place_id as placeId, url, thumbnail_url as thumbnailUrl, caption, credit, width, height,
            hero_focus_x as heroFocusX, hero_focus_y as heroFocusY, hero_scale as heroScale, hero_fit as heroFit
           FROM place_photos WHERE place_id = ?`,
        )
        .bind(placeId)
        .all<PlacePhoto>();

      const uploads = await uploadedPhotos(db, placeId, osmIdentity);
      return Response.json(
        { source: "d1", placeId, photos: [...uploads, ...(results ?? [])] },
        { headers: jsonHeaders },
      );
    } catch (error) {
      console.error("Failed to query D1 place_photos", error);
    }
  }

  return Response.json(
    { source: "unavailable", placeId, photos: [] },
    { headers: jsonHeaders },
  );
}
