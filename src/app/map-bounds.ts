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
