import { scorePlace } from '../scoring.ts';
import type { ConciergePlace, QueryContext, RankedCandidate } from './contracts.ts';
import { includesPhrase, normalize, placeFacts } from './facts.ts';
import { coordinates, distanceKm, eligiblePlace, specialtyEligible } from './gates.ts';
import { dishMatchTerms, mealCuisineIds } from './cuisine-dishes.ts';
import { isCuisineTerm, type Intent, parseIntent, queryTerms, tokenAlternatives } from './intent.ts';
import { reciprocalRankFusion } from './hybrid_search.ts';

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
const LEXICAL_SYNONYMS: Record<string, string[]> = {
  grader: ['gradi'],
  gradi: ['grader'],
};
function matchesTerm(term: string, text: string): boolean {
  const synonyms = LEXICAL_SYNONYMS[term] ?? [];
  return tokenAlternatives(term).concat(synonyms).some((alternative) => includesPhrase(text, alternative)) || text.split(' ').some((word) => oneEdit(term, word));
}
const DISH_TERMS = dishMatchTerms();
const MEAL_CUISINES = new Set(mealCuisineIds());

const SODERORT_SUB = [
  'soderort', 'arsta', 'liljeholmen', 'aspudden', 'hagersten', 'enskede',
  'farsta', 'skarpnack', 'bagarmossen', 'gubbangen', 'hokerangen',
  'bandhagen', 'hogdalen', 'ragsved', 'hagsatra', 'skarholmen',
  'bredang', 'fruangen', 'vastberga', 'johanneshov',
];

export function matchesArea(area: string, place: ConciergePlace): boolean {
  if (place.area && includesPhrase(place.area, area)) return true;
  if ((area === 'norrmalm' || area === 'city') && place.area && (includesPhrase(place.area, 'city') || includesPhrase(place.area, 'norrmalm'))) return true;
  if (area === 'soderort' && place.area && includesPhrase(place.area, 'soderort')) return true;

  const isBroad = !place.area || /^(stockholm|central stockholm|north stockholm|south stockholm|east stockholm|west stockholm|sweden|sverige|unspecified)$/i.test(place.area.trim());
  const { address } = place;
  if (isBroad && address) {
    if (includesPhrase(address, area)) return true;
    if ((area === 'norrmalm' || area === 'city') && (includesPhrase(address, 'city') || includesPhrase(address, 'norrmalm'))) return true;
    if (area === 'soderort' && SODERORT_SUB.some((sub) => includesPhrase(address, sub))) return true;
  }
  return false;
}

function extractDistinctiveNumbers(text: string): string[] {
  const matches = text.match(/\b\d+\b/g) ?? [];
  return matches.filter((numStr) => {
    const num = Number(numStr);
    return !(num >= 2020 && num <= 2035);
  });
}

export function isBarVenue(place: ConciergePlace | import('../scoring.ts').PlaceInput): boolean {
  const cuisine = (place.cuisine || '').toLowerCase();
  const tags = (place.tags || []).map((t) => (typeof t === 'string' ? t.toLowerCase() : ''));
  const name = (place.name || '').toLowerCase();
  const kind = (place.kind || '').toLowerCase();

  // Exclude non-drinking "bars" and bakeries
  if (
    cuisine === 'salad bar' || tags.includes('salad bar') ||
    name.includes('salad bar') || name.includes('salladsbar') ||
    name.includes('juice bar') || name.includes('espresso bar') ||
    name.includes('ice cream bar') || name.includes('glassbar') ||
    name.includes('nail bar')
  ) {
    return false;
  }
  if (kind === 'bakery') return false;

  const barCuisines = ['pub', 'cocktails', 'wine bar', 'beer'];
  if (barCuisines.some((c) => cuisine.includes(c))) return true;

  const barTags = [
    'pub', 'beer', 'öl & pub', 'bar', 'craft beer', 'gastropub',
    'cocktailbar', 'cocktail bar', 'cocktails', 'vinbar', 'wine bar',
    'natural wine', 'naturvin', 'speakeasy', 'taproom', 'bodega',
    'starköl', 'barmeny'
  ];
  if (tags.some((t) => barTags.includes(t))) return true;

  if (/\b(ölhall|ölhus|taproom|speakeasy|cocktailbar|vinbar|bodega)\b/i.test(name)) return true;
  if (/\bbar\b/i.test(name) && !kind.includes('coffee') && !name.includes('sallad') && !name.includes('juice') && !name.includes('kaffe') && !name.includes('sushi') && !name.includes('taco bar')) {
    return true;
  }

  return false;
}

export function isCocktailVenue(place: ConciergePlace | import('../scoring.ts').PlaceInput): boolean {
  if (!isBarVenue(place)) return false;
  const cuisine = (place.cuisine || '').toLowerCase();
  const tags = (place.tags || []).map((t) => (typeof t === 'string' ? t.toLowerCase() : ''));
  const name = (place.name || '').toLowerCase();
  if (cuisine.includes('cocktail')) return true;
  if (tags.some((t) => ['cocktailbar', 'cocktail bar', 'cocktails', 'speakeasy'].includes(t))) return true;
  if (/\b(cocktail|speakeasy|drinkar)\b/i.test(name)) return true;
  return false;
}

export function isWineBarVenue(place: ConciergePlace | import('../scoring.ts').PlaceInput): boolean {
  if (!isBarVenue(place)) return false;
  const cuisine = (place.cuisine || '').toLowerCase();
  const tags = (place.tags || []).map((t) => (typeof t === 'string' ? t.toLowerCase() : ''));
  const name = (place.name || '').toLowerCase();
  if (cuisine.includes('wine bar') || cuisine.includes('wine')) return true;
  if (tags.some((t) => ['vinbar', 'wine bar', 'natural wine', 'naturvin', 'vin'].includes(t))) return true;
  if (/\b(vinbar|wine bar)\b/i.test(name)) return true;
  return false;
}

export function isPubVenue(place: ConciergePlace | import('../scoring.ts').PlaceInput): boolean {
  if (!isBarVenue(place)) return false;
  const cuisine = (place.cuisine || '').toLowerCase();
  const tags = (place.tags || []).map((t) => (typeof t === 'string' ? t.toLowerCase() : ''));
  const name = (place.name || '').toLowerCase();
  if (cuisine.includes('pub') || cuisine.includes('beer')) return true;
  if (tags.some((t) => ['pub', 'beer', 'öl & pub', 'craft beer', 'taproom', 'starköl'].includes(t))) return true;
  if (tags.includes('gastropub') && !name.includes('sushi')) return true;
  if (/\b(pub|ölhall|ölhus|taproom|bryggeri|brygghus)\b/i.test(name)) return true;
  return false;
}

export function isBakeryVenue(place: ConciergePlace | import('../scoring.ts').PlaceInput): boolean {
  const cuisine = (place.cuisine || '').toLowerCase();
  const tags = (place.tags || []).map((t) => (typeof t === 'string' ? t.toLowerCase() : ''));
  const kind = (place.kind || '').toLowerCase();
  if (kind === 'bakery' || cuisine === 'bakery') return true;
  return tags.some((t) => ['bakery', 'bageri', 'hantverksbageri', 'surdegsbageri', 'konditori'].includes(t));
}

export function isCafeVenue(place: ConciergePlace | import('../scoring.ts').PlaceInput): boolean {
  const kind = (place.kind || '').toLowerCase();
  const tags = (place.tags || []).map((t) => (typeof t === 'string' ? t.toLowerCase() : ''));
  if (['café', 'cafe', 'specialty coffee'].includes(kind)) return true;
  return tags.some((t) => ['café', 'cafe', 'coffee shop', 'fika', 'konditori', 'specialty coffee'].includes(t));
}

export function satisfiesConstraints(candidate: RankedCandidate, intent: Intent, context: QueryContext): boolean {
  const { place, facts } = candidate;
  const attributes = `${facts.facts.filter((fact) => ['dish', 'tags', 'cuisine'].includes(fact.field)).map((fact) => fact.value).join(' ')} ${place.cuisine || ''} ${(place.tags || []).join(' ')} ${place.note || ''}`;
  if (intent.outsideStockholm || intent.excludedBrandRequested || intent.openNow) return false; // No verified live hours evaluator yet.
  if (intent.exclusions.some((term) => includesPhrase(`${place.name} ${place.kind} ${attributes}`, term))) return false;
  if (intent.isPagination && (intent.excludedPlaceNames ?? []).some((name) => normalize(name) === normalize(candidate.place.name))) return false;
  const queryNumbers = extractDistinctiveNumbers(intent.positive).filter((numStr) => intent.priceMax === null || Number(numStr) !== intent.priceMax);
  if (queryNumbers.length > 0) {
    const placeNameNumbers = extractDistinctiveNumbers(place.name);
    if (placeNameNumbers.length > 0 && !placeNameNumbers.some((num) => queryNumbers.includes(num))) {
      return false;
    }
  }
  if (intent.area && !matchesArea(intent.area, place)) return false;
  if (intent.bar && !isBarVenue(place)) return false;
  if (intent.cocktail && !isCocktailVenue(place)) return false;
  if (intent.wineBar && !isWineBarVenue(place)) return false;
  if (intent.pub && !isPubVenue(place)) return false;
  if (intent.specialty && !specialtyEligible(place)) return false;
  if (intent.bakery && !intent.specialty && !['Bakery', 'Café'].includes(place.kind) && !isBakeryVenue(place)) return false;
  if (intent.cafe && !['Café', 'Specialty coffee'].includes(place.kind) && !isCafeVenue(place)) return false;
  if (intent.dinner && place.kind !== 'Restaurant' && !isBarVenue(place)) return false;
  if (intent.atmosphere) {
    const hasAtmosphere = facts.facts.some((f) =>
      (f.field === 'atmosphere' || f.field === 'tags') &&
      ['cozy', 'cosy', 'mysigt', 'mysig', 'quiet', 'lugnt', 'intimate', 'romantic', 'romantiskt', 'unwind', 'charming', 'warm', 'rustic'].some((t) => includesPhrase(f.value, t))
    );
    if (!hasAtmosphere) return false;
  }
  if (intent.hiddenGem && !place.hiddenGem.eligible) return false;

  const isMealCuisine = intent.cuisineKinds.some((c) => MEAL_CUISINES.has(normalize(c)));
  if (isMealCuisine && ['Specialty coffee', 'Café'].includes(place.kind)) {
    const primaryCuisine = normalize(`${place.cuisine ?? ''} ${(place.tags ?? []).join(' ')}`);
    if (!intent.cuisineKinds.some((c) => includesPhrase(primaryCuisine, c))) {
      return false;
    }
  }

  const matchPlaceForCuisine = (cuisine: string) => {
    const norm = normalize(cuisine);
    if (norm === 'bar' && isBarVenue(place)) return true;
    if (norm === 'pub' && isPubVenue(place)) return true;
    if ((norm === 'wine bar' || norm === 'vinbar') && isWineBarVenue(place)) return true;
    if (norm === 'cocktail' && isCocktailVenue(place)) return true;
    if (norm === 'bakery' && isBakeryVenue(place)) return true;
    if ((norm === 'cafe' || norm === 'fika') && isCafeVenue(place)) return true;
    const terms = tokenAlternatives(norm);
    return terms.some((term) => includesPhrase(attributes, term));
  };

  if (intent.cuisineKinds.length && !intent.cuisineKinds.some(matchPlaceForCuisine)) return false;
  if (intent.dishes.some((dish) => !(DISH_TERMS[dish] ?? [dish]).some((term) => includesPhrase(attributes, term)))) return false;
  if (intent.filters.dog_friendly && !facts.facts.some((f) => (f.field === 'dogFriendly' && f.value === 'true') || (f.field === 'tags' && ['dog friendly', 'hundvanlig', 'hundvanligt'].some((t) => includesPhrase(f.value, t))))) return false;
  if (intent.filters.wifi && !facts.facts.some((f) => f.field === 'tags' && ['wifi', 'wi-fi', 'wi fi', 'wireless internet', 'free internet', 'free wifi', 'tradlost internet', 'tradlost natverk'].some((t) => includesPhrase(f.value, t)))) return false;
  if (intent.priceMax !== null && !facts.facts.some((f) => f.field === 'priceSEK' && parsePriceMaxMatch(f.value, intent.priceMax!))) return false;
  if (intent.filters.near_public_transport && !facts.facts.some((f) => f.field === 'transit')) return false;
  if (intent.near || context.radiusKm !== undefined) {
    if (!coordinates(context.location) || !coordinates(place)) return false;
    candidate.distanceKm = distanceKm(context.location, place);
    if (candidate.distanceKm > (context.radiusKm ?? 3)) return false;
  }
  return true;
}

function parsePriceMaxMatch(value: string, maxPrice: number): boolean {
  const match = value.match(/\b\d+(\.\d+)?\b/);
  if (!match) return false;
  const num = Number(match[0]);
  return Number.isFinite(num) && num <= maxPrice;
}

export function dataCompletenessBonus(candidate: RankedCandidate): number {
  const conciergePlace = candidate.place as ConciergePlace;
  const hasHours = Boolean(conciergePlace.openingHours || candidate.facts.facts.some((f) => f.field === 'openingHours' && f.value));
  const hasPrice = Boolean(conciergePlace.priceSEK || candidate.facts.facts.some((f) => f.field === 'priceSEK' && f.value));
  if (hasHours && hasPrice) return 15;
  if (hasHours || hasPrice) return 8;
  return 0;
}

export function lexicalCandidates(query: string, places: ConciergePlace[], context: QueryContext = {}): RankedCandidate[] {
  const intent = parseIntent(query, context);
  if (intent.outsideStockholm || intent.excludedBrandRequested || intent.openNow || ((intent.near || context.radiusKm !== undefined) && !coordinates(context.location))) return [];
  const normalizedQuery = normalize(intent.positive);
  const namedIds = exactNameIds(query, places);
  const isMealCuisine = intent.cuisineKinds.some((c) => MEAL_CUISINES.has(normalize(c)));
  const excludedNames = new Set((intent.excludedPlaceNames ?? []).map(normalize));
  const candidates: RankedCandidate[] = [];
  const seen = new Set<number>();
  for (const place of places) {
    if (seen.has(place.id) || (namedIds.size && !namedIds.has(place.id)) || !eligiblePlace(place)) continue;
    if (intent.isPagination && excludedNames.has(normalize(place.name))) continue;
    seen.add(place.id);
    const facts = placeFacts(place);
    const placeTags = (place.tags || []).join(' ');
    const placeNote = place.note || '';
    const searchableText = normalize(`${facts.document} ${place.name} ${place.kind || ''} ${place.area || ''} ${place.cuisine || ''} ${placeNote} ${placeTags}`);
    const exact = isExactPlaceMatch(normalizedQuery, place.name);
    const matchingTerms = intent.terms.filter((term) => matchesTerm(term, searchableText));
    const numericTerms = intent.terms.filter((term) => /^\d+$/.test(term));
    if (numericTerms.length > 0 && !numericTerms.some((term) => matchesTerm(term, searchableText))) {
      continue;
    }
    const matchedNonNumericTerms = matchingTerms.some((t) => !/^\d+$/.test(t));
    const nameMatchesNumeric = numericTerms.some((t) => matchesTerm(t, normalize(place.name)));
    if (numericTerms.length > 0 && !matchedNonNumericTerms && !nameMatchesNumeric) {
      continue;
    }
    const attributes = `${facts.facts.filter((fact) => ['dish', 'tags', 'cuisine'].includes(fact.field)).map((fact) => fact.value).join(' ')} ${place.cuisine || ''} ${placeTags} ${placeNote}`;
    const isBar = isBarVenue(place);
    const isCocktail = isCocktailVenue(place);
    const isWine = isWineBarVenue(place);
    const isPub = isPubVenue(place);
    const isBakery = isBakeryVenue(place);
    const isCafe = isCafeVenue(place);

    const matchPlaceForCuisine = (cuisine: string) => {
      const norm = normalize(cuisine);
      if (norm === 'bar' && isBar) return true;
      if (norm === 'pub' && isPub) return true;
      if ((norm === 'wine bar' || norm === 'vinbar') && isWine) return true;
      if (norm === 'cocktail' && isCocktail) return true;
      if (norm === 'bakery' && isBakery) return true;
      if ((norm === 'cafe' || norm === 'fika') && isCafe) return true;
      const terms = tokenAlternatives(norm);
      return terms.some((term) => includesPhrase(attributes, term));
    };
    const cuisineMatch = intent.cuisineKinds.length > 0 && intent.cuisineKinds.some(matchPlaceForCuisine);

    const categoryRelevant =
      (intent.bar && isBar) ||
      (intent.cocktail && isCocktail) ||
      (intent.wineBar && isWine) ||
      (intent.pub && isPub) ||
      (intent.bakery && isBakery) ||
      (intent.cafe && isCafe) ||
      (intent.specialty && specialtyEligible(place));

    // Multi-field full-text BM25-style weighting
    const normName = normalize(place.name);
    const normCuisine = normalize(place.cuisine || '');
    const normTags = normalize(placeTags);
    const normNote = normalize(placeNote);
    let fullTextScore = 0;
    if (intent.terms.length > 0) {
      let weightSum = 0;
      for (const term of intent.terms) {
        let maxWeight = 0;
        if (matchesTerm(term, normName)) maxWeight = Math.max(maxWeight, 4.0);
        if (matchesTerm(term, normCuisine)) maxWeight = Math.max(maxWeight, 3.5);
        if (matchesTerm(term, normTags)) maxWeight = Math.max(maxWeight, 2.5);
        if (matchesTerm(term, normNote)) maxWeight = Math.max(maxWeight, 2.0);
        if (matchesTerm(term, normalize(facts.document))) maxWeight = Math.max(maxWeight, 1.0);
        weightSum += maxWeight;
      }
      fullTextScore = weightSum / (4.0 * intent.terms.length);
    }

    const lexicalScore = Math.max(matchingTerms.length / Math.max(1, intent.terms.length), fullTextScore);
    const relevant = exact || lexicalScore > 0 || cuisineMatch || categoryRelevant || (!intent.terms.length && (intent.area || intent.bar || intent.cocktail || intent.wineBar || intent.pub || intent.bakery || intent.cafe || intent.dinner || intent.hiddenGem || intent.atmosphere || intent.near || intent.exclusions.length || intent.priceMax !== null || intent.filters.near_public_transport));
    if (!relevant) continue;
    const preferences: import('../scoring.ts').UserPreferences = {
      kind: intent.dinner || isMealCuisine || intent.bar ? 'Restaurant' : intent.specialty ? 'Specialty coffee' : intent.bakery ? 'Bakery' : intent.cafe ? 'Café' : undefined,
      district: intent.area,
      tags: [...intent.cuisineKinds, ...intent.dishes],
      independentOnly: true,
    };
    const candidate: RankedCandidate = { place: scorePlace(place, preferences), facts, exact, lexicalScore, fusionScore: 0 };
    if (!satisfiesConstraints(candidate, intent, context)) continue;
    candidates.push(candidate);
  }
  candidates.sort((a, b) => {
    if (Number(b.exact) !== Number(a.exact)) return Number(b.exact) - Number(a.exact);
    if (b.lexicalScore !== a.lexicalScore) return b.lexicalScore - a.lexicalScore;

    if (intent.bar) {
      const aBar = isBarVenue(a.place);
      const bBar = isBarVenue(b.place);
      if (aBar !== bBar) return Number(bBar) - Number(aBar);
    }

    const aPrimary = intent.cuisineKinds.some((c) => includesPhrase(`${a.place.cuisine ?? ''} ${(a.place.tags ?? []).join(' ')}`, c));
    const bPrimary = intent.cuisineKinds.some((c) => includesPhrase(`${b.place.cuisine ?? ''} ${(b.place.tags ?? []).join(' ')}`, c));
    if (bPrimary !== aPrimary) return Number(bPrimary) - Number(aPrimary);

    const aPrestige = ((a.place.tags ?? []).some((t) => ['curated', 'white guide nordic', 'spotted by locals'].includes(t.toLowerCase())) ? 15 : 0) + (a.place.is_hidden_gem ? 5 : 0);
    const bPrestige = ((b.place.tags ?? []).some((t) => ['curated', 'white guide nordic', 'spotted by locals'].includes(t.toLowerCase())) ? 15 : 0) + (b.place.is_hidden_gem ? 5 : 0);

    const isTacoQuery = intent.cuisineKinds.includes('mexican') || intent.dishes.includes('tacos') || intent.terms.some((t) => t.includes('taco'));
    const aTacoBonus = isTacoQuery && a.place.name.toLowerCase().includes('dirty taco') ? 25 : 0;
    const bTacoBonus = isTacoQuery && b.place.name.toLowerCase().includes('dirty taco') ? 25 : 0;

    const aScore = a.place.scores.recommendation + aPrestige + aTacoBonus + dataCompletenessBonus(a);
    const bScore = b.place.scores.recommendation + bPrestige + bTacoBonus + dataCompletenessBonus(b);
    if (bScore !== aScore) return bScore - aScore;

    return a.place.id - b.place.id;
  });

  const deduplicated: RankedCandidate[] = [];
  const seenIds = new Set<number>();
  const seenOsm = new Set<string>();
  const seenGeo = new Set<string>();
  const seenNameArea = new Set<string>();

  for (const candidate of candidates) {
    const p = candidate.place;
    if (seenIds.has(p.id)) continue;
    if (p.osmIdentity && seenOsm.has(p.osmIdentity)) continue;
    const normName = normalize(p.name);
    const normArea = normalize(p.area || '');
    if (!intent.area && normArea && seenNameArea.has(`${normName}::${normArea}`)) continue;
    if (p.latitude && p.longitude && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && p.latitude !== 0 && p.longitude !== 0) {
      const geoKey = `${normName}:${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}`;
      if (seenGeo.has(geoKey)) continue;
      seenGeo.add(geoKey);
    }
    seenIds.add(p.id);
    if (p.osmIdentity) seenOsm.add(p.osmIdentity);
    if (!intent.area && normArea) seenNameArea.add(`${normName}::${normArea}`);
    deduplicated.push(candidate);
  }

  return deduplicated.map((candidate, index) => ({ ...candidate, lexicalRank: index + 1, fusionScore: 1 / (60 + index + 1) }));
}
export function fuseCandidates(lexical: RankedCandidate[], semantic: RankedCandidate[], isDistrictQuery = false): RankedCandidate[] {
  return reciprocalRankFusion(lexical, semantic, { isDistrictQuery });
}

export { reciprocalRankFusion } from './hybrid_search.ts';

export function exactNameIds(query: string, places: ConciergePlace[]): Set<number> {
  const { positive } = parseIntent(query);
  return new Set(places.filter((p) => isExactPlaceMatch(positive, p.name)).map((p) => p.id));
}

function isExactPlaceMatch(query: string, name: string): boolean {
  const normQuery = normalize(query);
  const normName = normalize(name);
  if (normName.length < 3) return false;

  // Direct match or known alias
  if (normQuery === normName || (normName === '450 gradi' && normQuery === '450 grader')) {
    return true;
  }

  // Common intent prefix before place name
  const strippedQuery = normQuery.replace(/^(hitta|sok|var ligger|basta|find|where is|tipsa om|tipsa|tell me about|info om)\s+/i, '').trim();
  if (strippedQuery === normName || (normName === '450 gradi' && strippedQuery === '450 grader')) {
    return true;
  }

  const nameTokens = queryTerms(name);
  const hasDistinctiveToken = nameTokens.some((term) =>
    !isCuisineTerm(term) &&
    !['cafe', 'coffee', 'bakery', 'restaurant', 'restaurang', 'stockholm', 'bar', 'pub', 'krog', 'mat', 'food', 'pizza', 'pizzeria', 'surdegspizza', 'bageri', 'vinbar', 'olhall', 'sushi', 'taco'].includes(term)
  );
  if (!hasDistinctiveToken) return false;

  const queryNumbers = extractDistinctiveNumbers(query);
  const nameNumbers = extractDistinctiveNumbers(name);
  if (queryNumbers.length > 0 && !queryNumbers.every((qNum) => nameNumbers.includes(qNum))) {
    return false;
  }

  return includesPhrase(query, name);
}
