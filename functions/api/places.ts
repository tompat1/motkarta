import { loadPlacesFromD1 } from "../../lib/place-records.ts";
import { normalize } from "../../lib/concierge/facts.ts";

type EventContext<Env> = {
  request?: Request;
  env: Env;
};

type Env = {
  DB?: unknown;
  ASSETS?: { fetch(input: Request | string, init?: RequestInit): Promise<Response> };
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=60",
};

async function loadFallbackPlaces(context: EventContext<Env>) {
  if (!context.env.ASSETS || !context.request) return null;
  try {
    const assetRes = await context.env.ASSETS.fetch(new URL("/data/places.json", context.request.url).toString());
    if (assetRes.ok) {
      const json = await assetRes.json();
      const places = Array.isArray(json) ? json : (json as { places?: unknown[] }).places;
      if (Array.isArray(places) && places.length > 0) {
        return places;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export async function onRequestGet(context: EventContext<Env>) {
  const db = context.env.DB;

  if (!db) {
    const fallbackPlaces = await loadFallbackPlaces(context);
    if (fallbackPlaces) {
      return Response.json(
        { source: "published_dataset", places: fallbackPlaces },
        { headers: jsonHeaders },
      );
    }
    return Response.json(
      { source: "unavailable", places: [], error: "No production dataset is bound." },
      { headers: jsonHeaders, status: 503 },
    );
  }

  try {
    const places = await loadPlacesFromD1(db as Parameters<typeof loadPlacesFromD1>[0]);
    const fallbackPlaces = await loadFallbackPlaces(context);
    if (!places.length && fallbackPlaces) {
      return Response.json(
        { source: "published_dataset", places: fallbackPlaces },
        { headers: jsonHeaders },
      );
    }
    if (places.length && Array.isArray(fallbackPlaces)) {
      const existingIds = new Set(places.map((p) => p.id));
      const existingOsm = new Set(places.map((p) => (p as any).osmIdentity).filter(Boolean) as string[]);
      const existingNameArea = new Set(places.map((p) => `${normalize(p.name)}::${normalize(p.area || '')}`));
      for (const fp of fallbackPlaces as Array<{ id: number; name?: string; area?: string; osmIdentity?: string }>) {
        if (fp && typeof fp.id === "number") {
          if (existingIds.has(fp.id)) continue;
          if (fp.osmIdentity && existingOsm.has(fp.osmIdentity)) continue;
          const nameArea = fp.name ? `${normalize(fp.name)}::${normalize(fp.area || '')}` : '';
          if (nameArea && existingNameArea.has(nameArea)) continue;

          places.push(fp as any);
          existingIds.add(fp.id);
          if (fp.osmIdentity) existingOsm.add(fp.osmIdentity);
          if (nameArea) existingNameArea.add(nameArea);
        }
      }
    }
    return Response.json(
      { source: "d1", places },
      { headers: jsonHeaders },
    );
  } catch (error) {
    console.error("Failed to load places from D1", error);
    const fallbackPlaces = await loadFallbackPlaces(context);
    if (fallbackPlaces) {
      return Response.json(
        { source: "published_dataset", places: fallbackPlaces },
        { headers: jsonHeaders },
      );
    }
    return Response.json(
      { source: "unavailable", places: [], error: "Failed to load production dataset." },
      { headers: jsonHeaders, status: 503 },
    );
  }
}

