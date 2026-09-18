export type MapBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export function expandBounds(bounds: MapBounds, paddingRatio = 0.08): MapBounds {
  const latSpan = bounds.north - bounds.south;
  const lngSpan = bounds.east - bounds.west;
  const latPad = latSpan * paddingRatio;
  const lngPad = lngSpan * paddingRatio;

  return {
    south: bounds.south - latPad,
    north: bounds.north + latPad,
    west: bounds.west - lngPad,
    east: bounds.east + lngPad,
  };
}

export function placeInBounds(
  place: { latitude: number; longitude: number },
  bounds: MapBounds,
): boolean {
  return (
    place.latitude >= bounds.south &&
    place.latitude <= bounds.north &&
    place.longitude >= bounds.west &&
    place.longitude <= bounds.east
  );
}

export function filterPlacesByBounds<T extends { latitude: number; longitude: number }>(
  places: T[],
  bounds: MapBounds,
  paddingRatio = 0.08,
): T[] {
  const expanded = expandBounds(bounds, paddingRatio);
  return places.filter((place) => placeInBounds(place, expanded));
}

export function boundsFromLeaflet(latLngBounds: {
  getSouthWest: () => { lat: number; lng: number };
  getNorthEast: () => { lat: number; lng: number };
}): MapBounds {
  const southWest = latLngBounds.getSouthWest();
  const northEast = latLngBounds.getNorthEast();

  return {
    south: southWest.lat,
    west: southWest.lng,
    north: northEast.lat,
    east: northEast.lng,
  };
}

/** Only auto-fit the map when the filtered result set is small enough to be useful. */
export const MAP_AUTO_FIT_MAX_PLACES = 80;

export const DESKTOP_LIST_ROW_HEIGHT = 118;
export const MOBILE_CARD_ROW_HEIGHT = 236;
export const LIST_WINDOW_OVERSCAN = 8;
export const LIST_SCROLL_BATCH_SIZE = 60;

function hasValidCoordinates(place: {
  latitude?: number;
  longitude?: number;
}): place is { latitude: number; longitude: number } {
  return Number.isFinite(place.latitude) && Number.isFinite(place.longitude);
}

/** Keep ranked order while limiting to places inside the current map viewport. */
export function filterRankedPlacesByBounds<T extends { id: number; latitude?: number; longitude?: number }>(
  ranked: T[],
  bounds: MapBounds | null,
  activePlaceId: number | null = null,
): T[] {
  if (!bounds) {
    return ranked;
  }

  const expanded = expandBounds(bounds);
  const inBoundsIds = new Set<number>();
  for (const place of ranked) {
    if (hasValidCoordinates(place) && placeInBounds(place, expanded)) {
      inBoundsIds.add(place.id);
    }
  }
  let filtered = ranked.filter((place) => inBoundsIds.has(place.id));

  if (activePlaceId !== null && !inBoundsIds.has(activePlaceId)) {
    const activePlace = ranked.find((place) => place.id === activePlaceId);
    if (activePlace) {
      filtered = [activePlace, ...filtered.filter((place) => place.id !== activePlaceId)];
    }
  }

  return filtered;
}
