import exclusions from './catalog-exclusions.json' with { type: 'json' };

const tasstipsetOnlyNames = new Map(exclusions.tasstipsetOnlyPlaces.map((place) => [place.id, place.name.toLowerCase()]));

export function isExcludedCatalogPlace(place: { id?: number; name?: unknown; sourceName?: string }): boolean {
  return isExcludedCatalogName(place.name)
    || (place.id !== undefined && typeof place.name === 'string' && tasstipsetOnlyNames.get(place.id) === place.name.toLowerCase())
    || (typeof place.sourceName === 'string' && place.sourceName.toLowerCase().includes('tasstipset'));
}

/** Explicit catalog exclusions apply to every branch, regardless of chain metadata. */
export function isExcludedCatalogName(name: unknown): boolean {
  return typeof name === "string" && (
    /\bo[\s'’‘`´-]*learys\b/i.test(name)
    || /^stf\s+stockholm(?:\s|\/).*\bvandrarhem\b/i.test(name.trim())
  );
}
