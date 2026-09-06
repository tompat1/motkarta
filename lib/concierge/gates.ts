import policy from './policy.json' with { type: 'json' };
import type { ConciergePlace, Coordinates } from './contracts.ts';
import { includesPhrase, normalize } from './facts.ts';

export function inStockholm(place: ConciergePlace): boolean {
  // The envelope only rejects impossible locations; it never proves municipality membership.
  if (coordinates(place) && (place.latitude < 59.20 || place.latitude > 59.47 || place.longitude < 17.75 || place.longitude > 18.25)) return false;
  const text = ` ${normalize(`${place.area ?? ''} ${place.sourceArea ?? ''} ${place.address ?? ''} ${place.sourceUrl ?? ''}`)} `;
  if (policy.excludedLocalities.some((area) => text.includes(` ${area} `))) return false;
  // Require locality evidence, not just a bounding box which overlaps adjacent municipalities.
  return policy.stockholmLocalities.some((area) => text.includes(` ${normalize(area)} `));
}
export function eligiblePlace(place: ConciergePlace): boolean {
  if (!Number.isSafeInteger(place.id) || !place.name || !['baseline', 'active', 'verified', 'featured'].includes(place.lifecycleState ?? 'baseline')) return false;
  if (place.validationLabel === 'closed_wrong_category' || place.chainStatus === 'chain') return false;
  const name = ` ${normalize(place.name)} `;
  if (policy.excludedExactChains.includes(normalize(place.name))) return false;
  return !policy.excludedChains.some((chain) => name.includes(` ${chain} `)) && inStockholm(place);
}
export function specialtyEligible(place: ConciergePlace): boolean {
  const category = normalize(`${place.name} ${place.kind} ${place.cuisine ?? ''}`);
  if (/\b(\w*grill\w*|gastropub|pub|bar|restaurant|restaurang|burger\w*|pizza\w*|kebab|sushi|steakhouse|taverna|sportsbar)\b/.test(category)) return false;
  return place.specialty?.specialtyVerified === true || policy.specialtyNames.some((name) => includesPhrase(place.name, name)) || /\b(roastery|roaster|rosteri)\b/.test(normalize(place.name));
}
export function distanceKm(a: Coordinates, b: Coordinates): number {
  const rad = Math.PI / 180;
  const lat = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2;
  const lon = Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(lat + lon)));
}
export function coordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== 'object') return false;
  const p = value as Coordinates;
  return typeof p.latitude === 'number' && typeof p.longitude === 'number' && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;
}
