import type { PlaceInput } from "./scoring.ts";

export type DataSource = "loading" | "d1" | "osm" | "unavailable";

type PlacesPayload = {
  source?: string;
  places?: PlaceInput[];
};

export async function fetchPlacesPayload(): Promise<{ source: DataSource; places: PlaceInput[] }> {
  let staticError: unknown;

  try {
    const staticResponse = await fetch("/data/places.json");
    if (!staticResponse.ok) {
      throw new Error(`Static places responded ${staticResponse.status}`);
    }

    const payload = (await staticResponse.json()) as PlacesPayload;
    if (payload.places?.length) {
      return { source: sourceFromPayload(payload.source, "osm"), places: payload.places };
    }

    throw new Error("Static places returned no places");
  } catch (error) {
    staticError = error;
  }

  try {
    const apiResponse = await fetch("/api/places");
    if (apiResponse.ok) {
      const payload = (await apiResponse.json()) as PlacesPayload;
      if (payload.places?.length) {
        return { source: sourceFromPayload(payload.source, "d1"), places: payload.places };
      }
    }
  } catch {
    // Report the static dataset failure below; that is the primary public data path.
  }

  if (staticError instanceof Error) {
    throw staticError;
  }

  throw new Error("Static places returned no places");
}

function sourceFromPayload(rawSource: string | undefined, fallback: DataSource): DataSource {
  const source = rawSource ?? fallback;
  if (source === "d1") {
    return "d1";
  }
  if (source === "osm" || source.startsWith("osm")) {
    return "osm";
  }
  return fallback;
}
