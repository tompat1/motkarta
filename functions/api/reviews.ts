import type { PlaceReview } from "../../lib/lazy-media.ts";

type EventContext<Env> = {
  request: Request;
  env: Env;
};

type Env = {
  DB?: {
    prepare(query: string): {
      bind(...values: unknown[]): {
        all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
      };
    };
  };
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=3600, s-maxage=86400",
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

  const placeId = parseInt(placeIdParam, 10);
  if (isNaN(placeId)) {
    return Response.json(
      { error: "Invalid place_id" },
      { status: 400, headers: jsonHeaders },
    );
  }

  const db = context.env.DB;
  if (db) {
    try {
      const { results } = await db
        .prepare(
          "SELECT id, place_id as placeId, author, rating, date, source, content, verified FROM place_reviews WHERE place_id = ? ORDER BY date DESC",
        )
        .bind(placeId)
        .all<PlaceReview>();

      if (results && results.length > 0) {
        return Response.json(
          { source: "d1", placeId, reviews: results },
          { headers: jsonHeaders },
        );
      }
    } catch (error) {
      console.error("Failed to query D1 place_reviews", error);
    }
  }

  return Response.json(
    { source: "unavailable", placeId, reviews: [] },
    { headers: jsonHeaders },
  );
}
