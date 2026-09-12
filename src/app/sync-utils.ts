export const CANONICAL_SYNC_URL = "https://motkarta.rynell.org";

export const MAX_DIRECT_PLACES_IN_QR = 40;

/**
 * Builds the canonical shareable URL for device sync, ensuring phone cameras scanning
 * from computer screens or printed material resolve directly to https://motkarta.rynell.org/.
 *
 * When savedPlaceIds are provided (up to MAX_DIRECT_PLACES_IN_QR), they are encoded directly
 * into the URL query parameters so scanning the QR code immediately imports favorites without
 * depending on network roundtrips.
 */
export function getSyncShareableUrl(
  syncCode: string | null,
  savedPlaceIds: number[] = [],
): string {
  const url = new URL("/", CANONICAL_SYNC_URL);
  if (syncCode) {
    url.searchParams.set("sync", syncCode);
  }
  const validIds = savedPlaceIds.filter((id) => Number.isFinite(id) && id > 0);
  if (validIds.length > 0 && validIds.length <= MAX_DIRECT_PLACES_IN_QR) {
    url.searchParams.set("places", validIds.join(","));
  }
  return url.toString();
}

/**
 * Parses comma-separated place IDs from direct query parameters like 'places' or 'favs'.
 */
export function parseSyncDirectPlaces(param: string | null): number[] {
  if (!param) return [];
  return param
    .split(",")
    .map((item) => parseInt(item.trim(), 10))
    .filter((id) => Number.isFinite(id) && id > 0);
}
