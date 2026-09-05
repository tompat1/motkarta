import { CUISINE_ALIASES, extractStructuredFilters } from './filters.ts';
import { includesPhrase, normalize } from './facts.ts';
import type { QueryContext } from './contracts.ts';
import policy from './policy.json' with { type: 'json' };

const STOP = new Set(normalize('and the for with from some best good great find where what want like near place places food eat get have looking a an in on of to me i och den det ett att som har kan ska med bra för nära mig dig sin sina vara eller alla bästa hitta var deras här där ställe ställen mat äta vill på en i is please show recommend something och and or eller').split(' '));
const DESCRIPTORS = new Set(normalize('family owned run familjeägd familjeägt handmade handgjorda handgjord independent local authentic artisan hantverks cozy cosy quiet dinner middag lunch breakfast frukost cheap affordable budget billigt prisvärt filter hidden gems dolda pärlor').split(' '));
const normalizedAliases = new Map(Object.entries(CUISINE_ALIASES).map(([key, values]) => [normalize(key), values.map(normalize)]));
export function tokenAlternatives(token: string): string[] { return [token, ...(normalizedAliases.get(token) ?? [])]; }
export function queryTerms(query: string): string[] {
  return [...new Set(normalize(query).split(' ').filter((token) => token.length > 1 && !STOP.has(token) && !DESCRIPTORS.has(token)))];
}
export function parseIntent(query: string, context: QueryContext = {}) {
  const normalized = normalize(query);
  const negative: string[] = [];
  // Scope negation through punctuation or an explicit contrast. Never discard "not".
  const positive = query.replace(/\b(?:not|no|without|inte|utan|ej)\s+([^,;.!?]+?)(?=\b(?:but|men)\b|[,;.!?]|$)/gi, (whole, value: string) => {
    if (/^(expensive|dyrt|dyr)\b/i.test(value.trim())) return whole;
    negative.push(value); return ' ';
  });
  const filters = extractStructuredFilters(positive);
  const explicitPrice = normalized.match(/(?:under|below|less than|max|hogst)\s+(\d{1,4})(?:\s*(?:kr|sek|kronor))?\b/);
  const priceMax = explicitPrice ? Number(explicitPrice[1]) : filters.price_max;
  const area = policy.stockholmLocalities.filter((value) => value !== 'stockholm' && includesPhrase(positive, value)).sort((a, b) => b.length - a.length)[0];
  const excludedBrandRequested = policy.excludedChains.some((name) => includesPhrase(positive, name));
  const outsideStockholm = policy.excludedLocalities.some((value) => includesPhrase(positive, value));
  const dishes = [
    ['pierogi', 'pierogi'], ['tacos', 'tacos'], ['ramen', 'ramen'], ['sushi', 'sushi'],
    ['cardamom bun', 'cardamom'], ['kardemummabulle', 'cardamom'], ['kardemumma', 'cardamom'],
    ['sourdough', 'sourdough'], ['surdegsbrod', 'sourdough'], ['surdeg', 'sourdough'],
  ].filter(([word]) => includesPhrase(positive, word)).map(([, dish]) => dish);
  const specialty = /\b(specialty|specialkaffe|roastery|roaster|rosteri)\b/.test(normalize(positive));
  const bakery = /\b(bakery|bageri|hantverksbageri)\b/.test(normalize(positive));
  const dinner = /\b(dinner|middag|kvallsmat|restaurant|restaurang)\b/.test(normalize(positive));
  const near = /\b(near me|nearby|nara mig|narmaste|close to me)\b/.test(normalized);
  const openNow = /\b(open now|oppet nu|open tonight|oppet ikvall)\b/.test(normalized);
  const exclusions = negative.flatMap((value) => queryTerms(value)).flatMap(tokenAlternatives);
  const cuisineKinds = filters.cuisines.filter((c) => !['coffee', 'bakery'].includes(c));
  const terms = queryTerms(positive).filter((token) => !area?.split(' ').includes(token) && !/^\d+$/.test(token) && !['under', 'below', 'less', 'than', 'max', 'hogst', 'sek', 'kr', 'kronor'].includes(token));
  return { positive, filters, priceMax, area, outsideStockholm, excludedBrandRequested, dishes: [...new Set(dishes)], specialty, bakery, dinner, near, openNow, exclusions, cuisineKinds, terms,
    hiddenGem: /\b(hidden gems?|dolda parlor|dold parla)\b/.test(normalized),
    language: context.language ?? (/\b(och|jag|nara|mig|basta|hitta|kaffe|middag|pa|oppet|polska)\b/.test(normalized) ? 'sv' : 'en'),
  };
}
export type Intent = ReturnType<typeof parseIntent>;
export function parseAction(query: string) {
  const q = normalize(query);
  const actions = [
    ['add_place', /^(add place|lagg till stalle|skapa stalle|nytt stalle)(?: .+)?$/],
    ['add_review', /^(add review|skriv recension|lamna recension)(?: .+)?$/],
    ['add_photo', /^(add photo|lagg till foto|ladda upp bild|lagg till bild)(?: .+)?$/],
    ['rate_place', /^(rate place|ge betyg|betygsatt stalle|satt betyg)(?: .+)?$/],
  ] as const;
  return actions.find(([, pattern]) => pattern.test(q))?.[0];
}
