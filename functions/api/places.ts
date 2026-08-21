import { demoPlaces } from "../../lib/demo-places.ts";
import { loadPlacesFromD1 } from "../../lib/place-records.ts";
import { demoFallbackEnabled } from "../../lib/runtime-flags.ts";

type EventContext<Env> = {
  env: Env;
};

type Env = {
  ALLOW_DEMO_FALLBACK?: string;
  DB?: unknown;
  MOTKARTA_DEMO_MODE?: string;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=60",
};

export async function onRequestGet(context: EventContext<Env>) {
  const db = context.env.DB;
  const allowDemo = demoFallbackEnabled(context.env);

  if (!db) {
    if (!allowDemo) {
      return Response.json(
        { source: "unavailable", places: [], error: "No production dataset is bound. Demo fallback is disabled." },
        { headers: jsonHeaders, status: 503 },
      );
    }
    return Response.json(
      { source: "demo", places: demoPlaces },
      { headers: jsonHeaders },
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
    if (!allowDemo) {
      return Response.json(
        { source: "unavailable", places: [], error: "Failed to load production dataset. Demo fallback is disabled." },
        { headers: jsonHeaders, status: 503 },
      );
    }
    return Response.json(
      { source: "demo", places: demoPlaces },
      { headers: jsonHeaders },
    );
  }
}
