import type { PlaceInput } from "./scoring";

function placeDestinationQuery(place: PlaceInput): string {
  if (place.latitude && place.longitude) {
    return `${place.latitude},${place.longitude}`;
  }
  return encodeURIComponent(`${place.name} ${place.address || place.area || ""} Stockholm`.trim());
}

export function buildGoogleDirectionsUrl(place: PlaceInput): string | null {
  const destination = placeDestinationQuery(place);
  if (!destination) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

export function buildAppleDirectionsUrl(place: PlaceInput): string | null {
  if (place.latitude && place.longitude) {
    return `https://maps.apple.com/?daddr=${place.latitude},${place.longitude}`;
  }
  const query = encodeURIComponent(`${place.name} ${place.address || place.area || ""} Stockholm`.trim());
  if (!query) return null;
  return `https://maps.apple.com/?daddr=${query}`;
}

export function buildDirectionsUrl(place: PlaceInput): string | null {
  if (typeof navigator !== "undefined") {
    const isAppleDevice = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
    if (isAppleDevice) {
      return buildAppleDirectionsUrl(place) ?? buildGoogleDirectionsUrl(place);
    }
  }
  return buildGoogleDirectionsUrl(place);
}
