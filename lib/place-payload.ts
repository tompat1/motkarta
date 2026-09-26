import type { PlaceInput } from "./scoring.ts";
import { mergeSupplementalCatalogPlaces } from "./place-catalog-merge.ts";
import { filterPublishedPlaces, type PlaceIdentity } from "./place-visibility.ts";

export type DataSource = "loading" | "d1" | "osm" | "unavailable";

type PlacesPayload = {
  source?: string;
  places?: PlaceInput[];
};

export async function fetchPlacesPayload(): Promise<{ source: DataSource; places: PlaceInput[]; blocked: PlaceIdentity[] }> {
  // Read current admin exclusions even when the primary dataset is a static asset.
  // Fail closed if unavailable: falling back must not resurrect removed venues.
  const visibilityResponse = await fetch("/api/place-visibility", { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!visibilityResponse.ok) throw new Error("Publication status is unavailable");
  const visibility = await visibilityResponse.json() as { blocked?: PlaceIdentity[] };
  if (!Array.isArray(visibility.blocked)) throw new Error("Invalid publication status");
  let staticError: unknown;

  try {
    const staticResponse = await fetch("/data/places.json");
    if (!staticResponse.ok) {
      throw new Error(`Static places responded ${staticResponse.status}`);
    }

    const payload = (await staticResponse.json()) as PlacesPayload;
    if (payload.places?.length) {
      const staticPlaces = filterPublishedPlaces(payload.places, visibility.blocked);
      const mergedPlaces = await mergeLiveCatalogPlaces(staticPlaces, visibility.blocked);
      const source = mergedPlaces.length > staticPlaces.length ? "d1" : sourceFromPayload(payload.source, "osm");
      return { source, places: mergedPlaces, blocked: visibility.blocked };
    }

    throw new Error("Static places returned no places");
  } catch (error) {
    staticError = error;
  }

  try {
    const apiResponse = await fetch("/api/places", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (apiResponse.ok) {
      const payload = (await apiResponse.json()) as PlacesPayload;
      if (payload.places?.length) {
        return { source: sourceFromPayload(payload.source, "d1"), places: filterPublishedPlaces(payload.places, visibility.blocked), blocked: visibility.blocked };
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

async function mergeLiveCatalogPlaces(staticPlaces: PlaceInput[], blocked: PlaceIdentity[]): Promise<PlaceInput[]> {
  try {
    const apiResponse = await fetch("/api/places", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!apiResponse.ok) {
      return staticPlaces;
    }
    const payload = (await apiResponse.json()) as PlacesPayload;
    if (!payload.places?.length) {
      return staticPlaces;
    }
    const livePlaces = filterPublishedPlaces(payload.places, blocked);
    return mergeSupplementalCatalogPlaces(staticPlaces, livePlaces);
  } catch {
    return staticPlaces;
  }
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
