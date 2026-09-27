import type { CatalogDebug, CatalogMode, LiveApiStatus } from "./catalog-debug.ts";
import { catalogDebugLoading, catalogDebugUnavailable } from "./catalog-debug.ts";
import type { PlaceInput } from "./scoring.ts";
import { overlayCatalogWithLivePlaces } from "./place-catalog-merge.ts";
import { filterPublishedPlaces, type PlaceIdentity } from "./place-visibility.ts";

export type DataSource = "loading" | "d1" | "osm" | "unavailable";

export type PlacesPayloadResult = {
  source: DataSource;
  places: PlaceInput[];
  blocked: PlaceIdentity[];
  catalogDebug: CatalogDebug;
};

export { catalogDebugLoading, catalogDebugUnavailable };
export type { CatalogDebug, CatalogMode, LiveApiStatus };

type PlacesPayload = {
  source?: string;
  places?: PlaceInput[];
};

export async function fetchPlacesPayload(): Promise<PlacesPayloadResult> {
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
      const { places: mergedPlaces, liveApi } = await mergeLiveCatalogPlaces(staticPlaces, visibility.blocked);
      const overlayApplied = catalogUsesLiveOverlay(staticPlaces, mergedPlaces);
      const source = overlayApplied ? "d1" : sourceFromPayload(payload.source, "osm");
      const catalogMode: CatalogMode = overlayApplied ? "d1_overlay" : "static";
      return {
        source,
        places: mergedPlaces,
        blocked: visibility.blocked,
        catalogDebug: { catalogMode, placeCount: mergedPlaces.length, liveApi },
      };
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
        const places = filterPublishedPlaces(payload.places, visibility.blocked);
        return {
          source: sourceFromPayload(payload.source, "d1"),
          places,
          blocked: visibility.blocked,
          catalogDebug: { catalogMode: "d1_only", placeCount: places.length, liveApi: "ok" },
        };
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

async function mergeLiveCatalogPlaces(
  staticPlaces: PlaceInput[],
  blocked: PlaceIdentity[],
): Promise<{ places: PlaceInput[]; liveApi: LiveApiStatus }> {
  try {
    const apiResponse = await fetch("/api/places", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!apiResponse.ok) {
      return { places: staticPlaces, liveApi: "failed" };
    }
    const payload = (await apiResponse.json()) as PlacesPayload;
    if (!payload.places?.length) {
      return { places: staticPlaces, liveApi: "empty" };
    }
    const livePlaces = filterPublishedPlaces(payload.places, blocked);
    return {
      places: overlayCatalogWithLivePlaces(staticPlaces, livePlaces),
      liveApi: "ok",
    };
  } catch {
    return { places: staticPlaces, liveApi: "failed" };
  }
}

function catalogUsesLiveOverlay(before: PlaceInput[], after: PlaceInput[]) {
  if (after.length !== before.length) {
    return true;
  }
  return after.some((place, index) => {
    const previous = before[index];
    return !previous
      || place.id !== previous.id
      || place.address !== previous.address
      || place.priceLevel !== previous.priceLevel
      || place.lifecycleState !== previous.lifecycleState
      || place.validationLabel !== previous.validationLabel
      || place.cuisine !== previous.cuisine;
  });
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
