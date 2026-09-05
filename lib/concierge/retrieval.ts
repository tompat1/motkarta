import { scorePlace } from '../scoring.ts';
import type { ConciergePlace, QueryContext, RankedCandidate } from './contracts.ts';
import { includesPhrase, normalize, placeFacts } from './facts.ts';
import { coordinates, distanceKm, eligiblePlace, specialtyEligible } from './gates.ts';
import { type Intent, parseIntent, queryTerms, tokenAlternatives } from './intent.ts';

function oneEdit(a: string, b: string): boolean {
  if (a.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
function matchesTerm(term: string, text: string): boolean {
  return tokenAlternatives(term).some((alternative) => includesPhrase(text, alternative)) || text.split(' ').some((word) => oneEdit(term, word));
}
const DISH_TERMS: Record<string, string[]> = { cardamom: ['cardamom', 'kardemumma', 'kardemummabulle'], sourdough: ['sourdough', 'surdeg', 'surdegsbrod'] };
export function satisfiesConstraints(candidate: RankedCandidate, intent: Intent, context: QueryContext): boolean {
  const { place, facts } = candidate;
  const attributes = facts.facts.filter((fact) => ['dish', 'tags', 'cuisine'].includes(fact.field)).map((fact) => fact.value).join(' ');
  if (intent.outsideStockholm || intent.excludedBrandRequested || intent.openNow) return false; // No verified live hours evaluator yet.
  if (intent.exclusions.some((term) => includesPhrase(`${place.name} ${place.kind} ${attributes}`, term))) return false;
  if (intent.area && !includesPhrase(`${place.area} ${place.address ?? ''}`, intent.area)) return false;
  if (intent.specialty && !specialtyEligible(place)) return false;
  if (intent.bakery && !intent.specialty && !['Bakery', 'Café'].includes(place.kind)) return false;
  if (intent.dinner && place.kind !== 'Restaurant') return false;
  if (intent.hiddenGem && !place.hiddenGem.eligible) return false;
  if (intent.cuisineKinds.length && !intent.cuisineKinds.some((cuisine) => tokenAlternatives(normalize(cuisine)).some((term) => includesPhrase(attributes, term)))) return false;
  if (intent.dishes.some((dish) => !(DISH_TERMS[dish] ?? [dish]).some((term) => includesPhrase(attributes, term)))) return false;
  if (intent.filters.dog_friendly && !facts.facts.some((f) => (f.field === 'dogFriendly' && f.value === 'true') || (f.field === 'tags' && ['dog friendly', 'hundvanlig', 'hundvanligt'].some((t) => includesPhrase(f.value, t))))) return false;
  if (intent.priceMax !== null && !facts.facts.some((f) => f.field === 'priceSEK' && /^\d+(\.\d+)?$/.test(f.value) && Number(f.value) <= intent.priceMax!)) return false;
  if (intent.filters.near_public_transport && !facts.facts.some((f) => f.field === 'transit')) return false;
  if (intent.near || context.radiusKm !== undefined) {
    if (!coordinates(context.location) || !coordinates(place)) return false;
    candidate.distanceKm = distanceKm(context.location, place);
    if (candidate.distanceKm > (context.radiusKm ?? 3)) return false;
  }
  return true;
}
export function lexicalCandidates(query: string, places: ConciergePlace[], context: QueryContext = {}): RankedCandidate[] {
  const intent = parseIntent(query, context);
  const normalizedQuery = normalize(intent.positive);
  const namedIds = exactNameIds(query, places);
  const candidates: RankedCandidate[] = [];
  const seen = new Set<number>();
  for (const place of places) {
    if (seen.has(place.id) || !eligiblePlace(place) || (namedIds.size && !namedIds.has(place.id))) continue;
    seen.add(place.id);
    const facts = placeFacts(place);
    const text = normalize(facts.document);
    const exact = isExactPlaceMatch(normalizedQuery, place.name);
    const matchingTerms = intent.terms.filter((term) => matchesTerm(term, text));
    // Area alone must not make an unsupported food query relevant.
    const lexicalScore = matchingTerms.length / Math.max(1, intent.terms.length);
    const candidate: RankedCandidate = { place: scorePlace(place), facts, exact, lexicalScore, fusionScore: 0 };
    if (!satisfiesConstraints(candidate, intent, context)) continue;
    if (exact || lexicalScore > 0 || (!intent.terms.length && (intent.area || intent.dinner || intent.hiddenGem || intent.near || intent.exclusions.length || intent.priceMax !== null || intent.filters.near_public_transport))) candidates.push(candidate);
  }
  candidates.sort((a, b) => Number(b.exact) - Number(a.exact) || b.lexicalScore - a.lexicalScore || b.place.scores.recommendation - a.place.scores.recommendation || a.place.id - b.place.id);
  return candidates.map((candidate, index) => ({ ...candidate, lexicalRank: index + 1, fusionScore: 1 / (60 + index + 1) }));
}
export function fuseCandidates(lexical: RankedCandidate[], semantic: RankedCandidate[]): RankedCandidate[] {
  const merged = new Map<number, RankedCandidate>();
  for (const candidate of lexical.slice(0, 50).concat(lexical.filter((c) => c.exact))) merged.set(candidate.place.id, { ...candidate });
  for (const candidate of semantic) {
    const old = merged.get(candidate.place.id);
    merged.set(candidate.place.id, { ...(old ?? candidate), vectorRank: candidate.vectorRank });
  }
  return [...merged.values()].map((c) => ({ ...c, fusionScore: (c.lexicalRank ? 1 / (60 + c.lexicalRank) : 0) + (c.vectorRank ? 1 / (60 + c.vectorRank) : 0) }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.fusionScore - a.fusionScore || b.place.scores.recommendation - a.place.scores.recommendation || a.place.id - b.place.id);
}

export function exactNameIds(query: string, places: ConciergePlace[]): Set<number> {
  const positive = parseIntent(query).positive;
  return new Set(places.filter((p) => isExactPlaceMatch(positive, p.name)).map((p) => p.id));
}

function isExactPlaceMatch(query: string, name: string): boolean {
  const distinctive = queryTerms(name).some((term) => !['cafe', 'coffee', 'bakery', 'restaurant', 'restaurang', 'stockholm', 'bar'].includes(term));
  return distinctive && normalize(name).length >= 3 && includesPhrase(query, name);
}
