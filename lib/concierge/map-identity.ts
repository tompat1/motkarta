import type { PlaceInput } from '../scoring.ts';
import type { ConciergeCard } from './contracts.ts';
import { normalize } from './facts.ts';
import { coordinates, distanceKm, eligiblePlace } from './gates.ts';

export function resolveConciergeMapPlace(card: ConciergeCard, places: PlaceInput[]): PlaceInput | undefined {
  const namespace = card.idNamespace ?? 'public';
  const native = places.filter((place) => place.id === card.id && (place.idNamespace ?? 'public') === namespace);
  const candidates = native.length ? native : card.osmIdentity && /^(node|way|relation):\d+$/.test(card.osmIdentity)
    ? places.filter((place) => place.osmIdentity === card.osmIdentity || place.osmAliases?.includes(card.osmIdentity!)) : [];
  // Ambiguous identities/branches are never resolved through ordering or a name guess.
  if (candidates.length !== 1) return undefined;
  const place = candidates[0];
  const alias = Boolean(card.osmIdentity && place.osmAliases?.includes(card.osmIdentity));
  const sameName = normalize(place.name) === normalize(card.name) || (alias && normalize(place.name).replaceAll(' ', '') === normalize(card.name).replaceAll(' ', ''));
  if (!eligiblePlace(place) || !sameName) return undefined;
  if (card.osmIdentity && place.osmIdentity && card.osmIdentity !== place.osmIdentity && !alias) return undefined;
  if (!native.length && (!coordinates(card) || !coordinates(place))) return undefined;
  if (coordinates(card) && coordinates(place) && distanceKm(card, place) > 0.15) return undefined;
  return place;
}
