import { VERSIONS, type ConciergeAbstentionReason, type ConciergeResponse, type ConciergeCard, type QueryContext, type RankedCandidate, type WebSearchFallback } from './contracts.ts';
import { extractStructuredFilters } from './filters.ts';
import { parseAction, parseIntent } from './intent.ts';
import { plainText, safeUrl } from './facts.ts';
import { lexicalCandidates } from './retrieval.ts';
import type { ConciergePlace } from './contracts.ts';

export function buildWebSearchFallback(query: string, language: 'sv' | 'en'): WebSearchFallback {
  const cleanQuery = query.trim();
  const searchPrompt = `${cleanQuery} Stockholm café restaurang mat`;
  const osmQuery = `${cleanQuery} Stockholm`;
  const sv = language === 'sv';
  return {
    query: cleanQuery,
    links: [
      {
        title: sv ? 'Sök på Google' : 'Search on Google',
        url: `https://www.google.com/search?q=${encodeURIComponent(searchPrompt)}`,
        provider: 'google',
      },
      {
        title: sv ? 'Sök på DuckDuckGo' : 'Search on DuckDuckGo',
        url: `https://duckduckgo.com/?q=${encodeURIComponent(searchPrompt)}`,
        provider: 'duckduckgo',
      },
      {
        title: sv ? 'Sök på OpenStreetMap' : 'Search on OpenStreetMap',
        url: `https://www.openstreetmap.org/search?query=${encodeURIComponent(osmQuery)}`,
        provider: 'osm',
      },
    ],
  };
}

export function makeCard(candidate: RankedCandidate, language: 'sv' | 'en'): ConciergeCard {
  const sv = language === 'sv';
  const { place, facts } = candidate;
  const unknown = sv ? 'Uppgift saknas' : 'Unknown';
  const hours = facts.facts.find((f) => f.field === 'openingHours');
  const price = facts.facts.find((f) => f.field === 'priceSEK');
  const citations = facts.facts;
  const listed = facts.facts.filter((f) => ['cuisine', 'kind', 'area'].includes(f.field)).map((f) => f.value).join('; ');
  const conciergePlace = place as ConciergePlace;
  const lastVerifiedVal = plainText(conciergePlace.lastVerified || conciergePlace.verifiedAt) || unknown;
  return {
    id: place.id, name: plainText(place.name), kind: place.kind, area: plainText(place.area),
    idNamespace: place.idNamespace, osmIdentity: place.osmIdentity,
    latitude: place.latitude, longitude: place.longitude,
    whyItMatches: candidate.exact ? (sv ? 'Namnet matchar din sökning.' : 'The name matches your search.') : `${sv ? 'Listade uppgifter' : 'Listed attributes'}: ${listed}.`,
    hoursConfidence: hours ? `${hours.value} (${sv ? 'listade tider, öppet nu ej verifierat' : 'listed hours; open now unverified'})` : unknown,
    priceConfidence: price ? (price.value.includes('SEK') ? `${price.value} (${sv ? 'listat pris' : 'listed price'})` : `${price.value} SEK (${sv ? 'listat pris' : 'listed price'})`) : unknown,
    lastVerified: lastVerifiedVal,
    missingInfo: [!hours && (sv ? 'Öppettider saknas' : 'Opening hours missing'), !price && (sv ? 'Pris saknas' : 'Price missing')].filter(Boolean).join('; ') || (sv ? 'Inga saknade basfakta' : 'None (complete baseline facts)'),
    dataSources: [...new Set(citations.map((f) => f.source))].join('; '), citations,
    distanceKm: candidate.distanceKm, website: safeUrl(place.website),
  };
}
export function renderAnswer(result: Pick<ConciergeResponse, 'intro' | 'cards'> & { webSearch?: WebSearchFallback }): string {
  if (!result.cards.length && result.webSearch?.externalResults?.length) {
    const webCards = result.webSearch.externalResults.map((ext) => [
      `### **${ext.title}** (${ext.domain})`,
      ext.snippet ? `• ${ext.snippet}` : null,
      `• [Besök hemsida](${ext.url})`,
    ].filter(Boolean).join('\n'));
    return [result.intro, ...webCards].join('\n\n');
  }

  return [result.intro, ...result.cards.map((c) => [
    `### **${c.name}**`, `• **Why it matches**: ${c.whyItMatches}`,
    `• **Area / Location**: ${c.area}`, `• **Price confidence**: ${c.priceConfidence}`,
    `• **Opening-hours confidence**: ${c.hoursConfidence}`, `• **Data sources & License**: ${c.dataSources}`,
    `• **Last verified date**: ${c.lastVerified}`, `• **Missing/Uncertain info**: ${c.missingInfo}`,
  ].join('\n'))].join('\n\n');
}

function abstentionReason(
  intent: ReturnType<typeof parseIntent> & { hasLocation: boolean },
  hasResults: boolean,
): ConciergeAbstentionReason | undefined {
  if (hasResults) return undefined;
  if (intent.isPagination) return 'no_more_results';
  if (intent.near && !intent.hasLocation) return 'missing_location';
  if (intent.openNow) return 'unsupported_live_hours';
  if (intent.outsideStockholm) return 'outside_stockholm';
  if (intent.excludedBrandRequested) return 'excluded_chain';
  if (intent.priceMax != null || intent.atmosphere || intent.hiddenGem || intent.dishes.length > 0) return 'insufficient_evidence';
  const hasRecognizedDetail = Boolean(
    intent.area || intent.cuisineKinds.length || intent.bar || intent.pub || intent.wineBar ||
    intent.cocktail || intent.bakery || intent.cafe || intent.specialty || intent.dinner ||
    intent.terms.length,
  );
  return hasRecognizedDetail ? 'no_verified_match' : 'ambiguous_query';
}

function abstentionCopy(
  reason: ConciergeAbstentionReason,
  query: string,
  intent: ReturnType<typeof parseIntent>,
): string {
  const sv = intent.language === 'sv';
  switch (reason) {
    case 'no_more_results':
      return sv
        ? 'Det finns inga fler verifierade ställen som matchar. Prova ett annat område eller ta bort ett villkor.'
        : 'There are no more verified matches. Try another area or remove one constraint.';
    case 'missing_location':
      return sv
        ? 'Välj ett område eller dela din position för att hitta ställen nära dig.'
        : 'Choose an area or share your location to find places near you.';
    case 'unsupported_live_hours':
      return sv
        ? 'Jag kan inte verifiera vilka ställen som är öppna just nu. Sök utan ”öppet nu” och kontrollera sedan med stället.'
        : 'I can’t verify which places are open right now. Search without “open now,” then check with the venue.';
    case 'outside_stockholm':
      return sv
        ? 'Motkarta täcker just nu Stockholms kommun. Prova samma sökning i Stockholm.'
        : 'Motkarta currently covers Stockholm municipality. Try the same search in Stockholm.';
    case 'excluded_chain':
      return sv
        ? 'Motkarta visar oberoende ställen och tar inte med den efterfrågade kedjan. Prova en typ av mat, dryck eller ett område i stället.'
        : 'Motkarta lists independent places and does not include the requested chain. Try a type of food, drink, or area instead.';
    case 'insufficient_evidence':
      return sv
        ? 'Jag kunde inte verifiera något ställe i katalogen som uppfyller alla önskemål. Ta bort ett villkor eller sök i hela Stockholm.'
        : 'I couldn’t verify a catalog place that meets every requested detail. Remove one constraint or search all of Stockholm.';
    case 'no_verified_match': {
      if (intent.area && (intent.cuisineKinds.length || intent.bar || intent.pub || intent.wineBar || intent.cocktail || intent.bakery || intent.cafe)) {
        const areaName = CANONICAL_AREA_NAMES[intent.area] || intent.area.split(' ').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
        return sv
          ? `Jag förstod sökningen men hittade ingen verifierad träff i ${areaName}. Prova hela Stockholm eller ett närliggande område.`
          : `I understood the search but found no verified match in ${areaName}. Try all of Stockholm or a nearby area.`;
      }
      return sv
        ? `Jag förstod sökningen men hittade ingen verifierad träff för ”${query}”. Prova ett större område eller ta bort ett villkor.`
        : `I understood the search but found no verified match for “${query}.” Try a broader area or remove one constraint.`;
    }
    case 'ambiguous_query':
      return sv
        ? 'Lägg till en detalj så att jag kan söka i katalogen: en maträtt, typ av ställe eller ett område. Till exempel ”pierogi på Södermalm”.'
        : 'Add one detail so I can search the catalog: a dish, type of place, or area. For example, “pierogi in Södermalm.”';
    case 'catalog_unavailable':
      return sv ? 'Motkartas katalog är inte tillgänglig just nu. Försök igen senare.' : 'The Motkarta catalog is unavailable right now. Please try again later.';
  }
}
const CANONICAL_AREA_NAMES: Record<string, string> = {
  'gamla stan': 'Gamla Stan',
  'sodermalm': 'Södermalm',
  'vasastan': 'Vasastan',
  'ostermalm': 'Östermalm',
  'kungsholmen': 'Kungsholmen',
  'norrmalm': 'Norrmalm',
  'norra djurgarden': 'Norra Djurgården',
  'djurgarden': 'Djurgården',
  'gardet': 'Gärdet',
  'kransen': 'Kransen',
  'vasterort': 'Västerort',
  'soderort': 'Söderort',
  'norrort': 'Norrort',
  'city': 'City',
};

export function buildResponse(query: string, candidates: RankedCandidate[], total: number, context: QueryContext = {}, source = 'local'): ConciergeResponse {
  const intent = parseIntent(query, context);
  const intentWithLocation = { ...intent, hasLocation: Boolean(context.location) };
  const action = parseAction(query);
  const sv = intent.language === 'sv';
  const isDistrictQuery = Boolean(intent.area);
  const isCategoryBrowse = !action && !intent.isPagination && (intent.bar || intent.cocktail || intent.wineBar || intent.pub || intent.bakery || intent.cafe || intent.specialty);
  const isCuisineBrowse = !action && !intent.isPagination && intent.cuisineKinds.length > 0;
  const cardPicks = action ? [] : (isDistrictQuery ? candidates : candidates.slice(0, 5));
  const mapPicks = action ? [] : (isDistrictQuery || isCuisineBrowse || isCategoryBrowse ? candidates : cardPicks);
  let intro = sv ? 'Här är träffar från Motkartas katalog. Saknade uppgifter är markerade.' : 'Based on our auditable open dataset, here are catalog matches. Missing facts are marked.';
  if (isDistrictQuery && mapPicks.length > 0) {
    const areaName = intent.area ? (CANONICAL_AREA_NAMES[intent.area] || intent.area.split(' ').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')) : '';
    intro = sv
      ? `Här är alla ${mapPicks.length} ställen i ${areaName} från Motkartas katalog. Saknade uppgifter är markerade.`
      : `Based on our auditable open dataset, here are all ${mapPicks.length} places in ${areaName}. Missing facts are marked.`;
  } else if (isCategoryBrowse && mapPicks.length > 0) {
    const categoryLabel = intent.cocktail ? (sv ? 'cocktailbarer' : 'cocktail bars')
      : intent.wineBar ? (sv ? 'vinbarer' : 'wine bars')
      : intent.pub ? (sv ? 'pubar och ölbarer' : 'pubs and beer bars')
      : intent.bar ? (sv ? 'barer och pubar' : 'bars and pubs')
      : intent.bakery ? (sv ? 'bagerier' : 'bakeries')
      : intent.cafe ? (sv ? 'kaféer och fikaställen' : 'cafés')
      : (sv ? 'specialkaffeställen' : 'specialty coffee places');
    intro = sv
      ? `Här är ${mapPicks.length} bekräftade ${categoryLabel} i Motkartas katalog. Topp ${Math.min(5, cardPicks.length)} visas nedan; alla finns på kartan och i listan.`
      : `Here are ${mapPicks.length} confirmed ${categoryLabel} in the Motkarta catalog. The top ${Math.min(5, cardPicks.length)} are below; all matches are on the map and list.`;
  } else if (isCuisineBrowse && mapPicks.length > 0) {
    const cuisineLabel = intent.cuisineKinds[0]?.replaceAll('_', ' ') ?? (sv ? 'valt kök' : 'selected cuisine');
    intro = sv
      ? `Här är ${mapPicks.length} bekräftade ${cuisineLabel}-ställen i Motkartas katalog. Topp ${Math.min(5, cardPicks.length)} visas nedan; alla finns på kartan och i listan.`
      : `Here are ${mapPicks.length} confirmed ${cuisineLabel} places in the Motkarta catalog. The top ${Math.min(5, cardPicks.length)} are below; all matches are on the map and list.`;
  } else if (intent.isPagination) {
    intro = sv ? 'Här är fler rekommenderade ställen från Motkartas katalog.' : 'Here are more recommended places from the Motkarta catalog.';
  }
  const reason = abstentionReason(intentWithLocation, mapPicks.length > 0);
  if (reason) intro = abstentionCopy(reason, query, intent);
  if (action) intro = sv ? 'Öppnar formuläret för ditt val.' : 'Opening the form for your action.';
  const response: ConciergeResponse = {
    query, intro, answer: '', cards: cardPicks.map((pick) => makeCard(pick, intent.language)),
    recommendedPlaces: mapPicks.map(({ place: p }) => ({ id: p.id, name: p.name, kind: p.kind, area: p.area, scores: p.scores, hiddenGem: p.hiddenGem, discoveryReasons: p.discoveryReasons })),
    source, totalSearchSpace: total, status: mapPicks.length || action ? 'ok' : 'clarification', action,
    abstentionReason: action ? undefined : reason,
    structuredFilters: extractStructuredFilters(query), schemaVersion: VERSIONS.schema, corpusVersion: VERSIONS.corpus,
    modelVersion: VERSIONS.lexical, promptVersion: VERSIONS.prompt, retrievalMode: 'lexical', synthesisMode: 'template',
    diagnostics: {
      fallbackReasons: [], candidateCount: candidates.length, timingsMs: {},
      ranking: mapPicks.map((pick) => ({ id: pick.place.id, exact: pick.exact, lexicalScore: pick.lexicalScore, lexicalRank: pick.lexicalRank, vectorRank: pick.vectorRank, fusionScore: pick.fusionScore, recommendationScore: pick.place.scores.recommendation })),
    },
  };
  if (!mapPicks.length && !action && query.trim() && (reason === 'no_verified_match' || reason === 'insufficient_evidence')) {
    response.webSearch = buildWebSearchFallback(query, intent.language);
  }
  response.answer = action ? `SUPERPOWER_ACTION: ${action}\n\n${intro}` : renderAnswer(response);
  return response;
}
export function retrieveAndSynthesize(query: string, places: ConciergePlace[], context: QueryContext = {}) {
  if (!query.trim() || query.length > 1000) return buildResponse('', [], places.length, context);
  return buildResponse(query, lexicalCandidates(query, places, context), places.length, context);
}
