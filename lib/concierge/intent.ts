import { CUISINE_ALIASES, extractStructuredFilters } from './filters.ts';
import { includesPhrase, normalize } from './facts.ts';
import type { QueryContext } from './contracts.ts';
import policy from './policy.json' with { type: 'json' };

const STOP = new Set(normalize('and the for with from some best good great find where what want like near place places spot spots food eat get have looking a an in on of to me i och den det ett att som har kan ska med bra för nära mig dig sin sina vara eller alla bästa hitta var deras här där ställe ställen ställena stället restaurang restauranger krog krogar kafe kafeer cafe cafes bageri bagerier mat äta vill på en i is please show recommend something tips rekommendationer stan och and or eller ge fler mer visa andra annat nagra nagot more other give next suggestions forslag då ju väl nu').split(' '));
const DESCRIPTORS = new Set(normalize('family owned run familjeägd familjeägt handmade handgjorda handgjord independent local authentic artisan hantverks cozy cosy quiet dinner middag lunch breakfast frukost cheap affordable budget billigt prisvärt filter hidden gems dolda pärlor').split(' '));
const normalizedAliases = new Map(Object.entries(CUISINE_ALIASES).map(([key, values]) => [normalize(key), values.map(normalize)]));
const normalizedCuisineTerms = new Set([...normalizedAliases.entries()].flatMap(([key, values]) => [key, ...values]));
export function tokenAlternatives(token: string): string[] { return [token, ...(normalizedAliases.get(token) ?? [])]; }
export function isCuisineTerm(token: string): boolean { return normalizedCuisineTerms.has(normalize(token)); }
export function queryTerms(query: string): string[] {
  return [...new Set(normalize(query).split(' ').filter((token) => token.length > 1 && !STOP.has(token) && !DESCRIPTORS.has(token)))];
}
function parseSingleIntent(query: string, context: QueryContext = {}) {
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
  let rawArea = policy.stockholmLocalities.filter((value) => value !== 'stockholm' && includesPhrase(positive, value)).sort((a, b) => b.length - a.length)[0];
  if (!rawArea) {
    if (/\b(soder|sodermalm|pa soder|pa sodermalm)\b/i.test(normalized)) rawArea = 'sodermalm';
    else if (/\b(vasastan|vasan|pa vasastan)\b/i.test(normalized)) rawArea = 'vasastan';
    else if (/\b(ostermalm|oster|pa ostermalm)\b/i.test(normalized)) rawArea = 'ostermalm';
    else if (/\b(kungsholmen)\b/i.test(normalized)) rawArea = 'kungsholmen';
    else if (/\b(gamla stan)\b/i.test(normalized)) rawArea = 'gamla stan';
  }
  const area = rawArea;
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
  const localityTokens = new Set(['soder', 'sodermalm', 'vasastan', 'vasan', 'ostermalm', 'oster', 'kungsholmen', 'gamla', 'stan', ...(area ? area.split(' ') : [])]);
  const terms = queryTerms(positive).filter((token) => !localityTokens.has(token) && !/^\d+$/.test(token) && !['under', 'below', 'less', 'than', 'max', 'hogst', 'sek', 'kr', 'kronor'].includes(token));
  return { positive, filters, priceMax, area, outsideStockholm, excludedBrandRequested, dishes: [...new Set(dishes)], specialty, bakery, dinner, near, openNow, exclusions, cuisineKinds, terms,
    hiddenGem: /\b(hidden gems?|dolda parlor|dold parla)\b/.test(normalized),
    language: context.language ?? (/\b(och|jag|nara|mig|basta|hitta|kaffe|middag|pa|oppet|polska)\b/.test(normalized) ? 'sv' : 'en'),
  };
}
export function parseIntent(query: string, context: QueryContext = {}) {
  const base = parseSingleIntent(query, context);
  const normalized = normalize(query);
  const isPagination = /\b(fler|mer|andra|visa fler|fler stallen|ge mig fler|andra alternativ|visa andra|andra forslag|more|more places|other options|show more|next)\b/i.test(normalized);

  const messages = context.messages ?? [];
  const userMessages = messages.filter((m) => m.role === 'user');

  let prevTopicIntent: ReturnType<typeof parseSingleIntent> | undefined;
  for (let i = userMessages.length - 1; i >= 0; i--) {
    const candidate = parseSingleIntent(userMessages[i].content, { language: base.language });
    if (candidate.cuisineKinds.length > 0 || candidate.dishes.length > 0 || candidate.specialty || candidate.bakery || candidate.dinner) {
      prevTopicIntent = candidate;
      break;
    }
  }
  if (!prevTopicIntent && userMessages.length > 0) {
    prevTopicIntent = parseSingleIntent(userMessages[userMessages.length - 1].content, { language: base.language });
  }

  const excludedPlaceNames: string[] = [];
  for (const msg of messages.filter((m) => m.role === 'assistant')) {
    const headerMatches = msg.content.matchAll(/###\s*\*\*([^*]+)\*\*/g);
    for (const match of headerMatches) {
      if (match[1]) excludedPlaceNames.push(match[1].trim());
    }
  }

  let isFollowUp = false;
  if (prevTopicIntent) {
    if (isPagination) {
      isFollowUp = true;
      return {
        ...base,
        cuisineKinds: base.cuisineKinds.length ? base.cuisineKinds : prevTopicIntent.cuisineKinds,
        dishes: base.dishes.length ? base.dishes : prevTopicIntent.dishes,
        area: base.area ?? prevTopicIntent.area,
        specialty: base.specialty || prevTopicIntent.specialty,
        bakery: base.bakery || prevTopicIntent.bakery,
        dinner: base.dinner || prevTopicIntent.dinner,
        hiddenGem: base.hiddenGem || prevTopicIntent.hiddenGem,
        priceMax: base.priceMax ?? prevTopicIntent.priceMax,
        filters: { ...prevTopicIntent.filters, ...base.filters },
        terms: base.terms.length ? base.terms : prevTopicIntent.terms,
        isPagination: true,
        isFollowUp: true,
        excludedPlaceNames,
      };
    }

    const hasNewCuisine = base.cuisineKinds.length > 0 || base.dishes.length > 0 || base.specialty || base.bakery;
    if (!hasNewCuisine && (prevTopicIntent.cuisineKinds.length > 0 || prevTopicIntent.dishes.length > 0 || prevTopicIntent.specialty || prevTopicIntent.bakery)) {
      isFollowUp = true;
      const combinedTerms = [...new Set([...prevTopicIntent.terms, ...base.terms])];
      return {
        ...base,
        cuisineKinds: prevTopicIntent.cuisineKinds,
        dishes: prevTopicIntent.dishes,
        area: base.area ?? prevTopicIntent.area,
        specialty: prevTopicIntent.specialty,
        bakery: prevTopicIntent.bakery,
        dinner: base.dinner || prevTopicIntent.dinner,
        hiddenGem: base.hiddenGem || prevTopicIntent.hiddenGem,
        priceMax: base.priceMax ?? prevTopicIntent.priceMax,
        filters: { ...prevTopicIntent.filters, ...base.filters },
        terms: combinedTerms,
        isPagination: false,
        isFollowUp: true,
        excludedPlaceNames,
      };
    }
  }

  return {
    ...base,
    isPagination,
    isFollowUp,
    excludedPlaceNames,
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
