export type Language = "sv" | "en";

export function formatDistance(distKm: number, _lang: Language = "sv"): string {
  if (distKm === Number.POSITIVE_INFINITY || isNaN(distKm)) return "";
  if (distKm < 1) {
    return `${Math.round(distKm * 1000)} m`;
  }
  return `${distKm.toFixed(1)} km`;
}

export function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceFromPoint(
  place: { latitude?: number; longitude?: number },
  center: { latitude: number; longitude: number } = { latitude: 59.3293, longitude: 18.0686 }
) {
  if (typeof place.latitude !== "number" || typeof place.longitude !== "number") {
    return Number.POSITIVE_INFINITY;
  }

  const earthRadius = 6371;
  const latDelta = degreesToRadians(place.latitude - center.latitude);
  const lonDelta = degreesToRadians(place.longitude - center.longitude);
  const startLat = degreesToRadians(center.latitude);
  const endLat = degreesToRadians(place.latitude);
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(lonDelta / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
}
