import { loadUnpublishedPlaces, type VisibilityDatabase } from "../../lib/place-visibility.ts";

export async function onRequestGet({ env }: { env: { DB?: unknown } }) {
  const headers = { "cache-control": "no-store" };
  if (!env.DB) {
    return Response.json({ error: "Publication status is unavailable." }, { status: 503, headers });
  }
  try {
    return Response.json({ blocked: await loadUnpublishedPlaces(env.DB as VisibilityDatabase) }, { headers });
  } catch {
    return Response.json({ error: "Publication status is unavailable." }, { status: 503, headers });
  }
}
