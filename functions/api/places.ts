import { loadPlacesFromD1 } from "../../lib/place-records.ts";

type EventContext<Env> = {
  env: Env;
};

type Env = {
  DB?: unknown;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=60",
};

export async function onRequestGet(context: EventContext<Env>) {
  const db = context.env.DB;

  if (!db) {
    return Response.json(
      { source: "unavailable", places: [], error: "No production dataset is bound." },
      { headers: jsonHeaders, status: 503 },
    );
  }

  try {
    const places = await loadPlacesFromD1(db as Parameters<typeof loadPlacesFromD1>[0]);
    return Response.json(
      { source: "d1", places },
      { headers: jsonHeaders },
    );
  } catch (error) {
    console.error("Failed to load places from D1", error);
    return Response.json(
      { source: "unavailable", places: [], error: "Failed to load production dataset." },
      { headers: jsonHeaders, status: 503 },
    );
  }
}
