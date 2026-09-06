import { VERSIONS, type ConciergeResponse, type ConciergeCard, type QueryContext, type RankedCandidate } from './contracts.ts';
import { extractStructuredFilters } from './filters.ts';
import { parseAction, parseIntent } from './intent.ts';
import { plainText, safeUrl } from './facts.ts';
import { lexicalCandidates } from './retrieval.ts';
import type { ConciergePlace } from './contracts.ts';

export function makeCard(candidate: RankedCandidate, language: 'sv' | 'en'): ConciergeCard {
  const sv = language === 'sv';
  const { place, facts } = candidate;
  const unknown = sv ? 'Uppgift saknas' : 'Unknown';
  const hours = facts.facts.find((f) => f.field === 'openingHours');
  const price = facts.facts.find((f) => f.field === 'priceSEK');
  const citations = facts.facts;
  const listed = facts.facts.filter((f) => ['cuisine', 'kind', 'area'].includes(f.field)).map((f) => f.value).join('; ');
  return {
    id: place.id, name: plainText(place.name), kind: place.kind, area: plainText(place.area),
    idNamespace: place.idNamespace, osmIdentity: place.osmIdentity,
    latitude: place.latitude, longitude: place.longitude,
    whyItMatches: candidate.exact ? (sv ? 'Namnet matchar din sökning.' : 'The name matches your search.') : `${sv ? 'Listade uppgifter' : 'Listed attributes'}: ${listed}.`,
    hoursConfidence: hours ? `${hours.value} (${sv ? 'listade tider, öppet nu ej verifierat' : 'listed hours; open now unverified'})` : unknown,
    priceConfidence: price ? `${price.value} SEK (${sv ? 'listat pris' : 'listed price'})` : unknown,
    lastVerified: unknown,
    missingInfo: [!hours && (sv ? 'Öppettider saknas' : 'Opening hours missing'), !price && (sv ? 'Pris saknas' : 'Price missing')].filter(Boolean).join('; '),
    dataSources: [...new Set(citations.map((f) => f.source))].join('; '), citations,
    distanceKm: candidate.distanceKm, website: safeUrl(place.website),
  };
}
export function renderAnswer(result: Pick<ConciergeResponse, 'intro' | 'cards'>): string {
  return [result.intro, ...result.cards.map((c) => [
    `### **${c.name}**`, `• **Why it matches**: ${c.whyItMatches}`,
    `• **Area / Location**: ${c.area}`, `• **Price confidence**: ${c.priceConfidence}`,
    `• **Opening-hours confidence**: ${c.hoursConfidence}`, `• **Data sources & License**: ${c.dataSources}`,
    `• **Last verified date**: ${c.lastVerified}`, `• **Missing/Uncertain info**: ${c.missingInfo}`,
  ].join('\n'))].join('\n\n');
}
export function buildResponse(query: string, candidates: RankedCandidate[], total: number, context: QueryContext = {}, source = 'local'): ConciergeResponse {
  const intent = parseIntent(query, context);
  const action = parseAction(query);
  const sv = intent.language === 'sv';
  const picks = action ? [] : candidates.slice(0, 3);
  let intro = sv ? 'Här är träffar från Motkartas katalog. Saknade uppgifter är markerade.' : 'Based on our auditable open dataset, here are catalog matches. Missing facts are marked.';
  if (!picks.length) intro = sv ? 'Inga ställen kunde bekräftas för alla dina krav. Försök med ett annat kök eller område.' : 'No places could be confirmed for all your requirements. Try another cuisine or area.';
  if (intent.near && !context.location) intro = sv ? 'Dela din position eller ange ett område för att hitta ställen nära dig.' : 'Share your location or specify an area to find places near you.';
  if (intent.openNow) intro = sv ? 'Aktuella öppettider är inte verifierade. Kontrollera med stället.' : 'Current opening hours are unverified. Check with the venue.';
  if (action) intro = sv ? 'Öppnar formuläret för ditt val.' : 'Opening the form for your action.';
  const response: ConciergeResponse = {
    query, intro, answer: '', cards: picks.map((pick) => makeCard(pick, intent.language)),
    recommendedPlaces: picks.map(({ place: p }) => ({ id: p.id, name: p.name, kind: p.kind, area: p.area, scores: p.scores, hiddenGem: p.hiddenGem, discoveryReasons: p.discoveryReasons })),
    source, totalSearchSpace: total, status: picks.length || action ? 'ok' : 'clarification', action,
    structuredFilters: extractStructuredFilters(query), schemaVersion: VERSIONS.schema, corpusVersion: VERSIONS.corpus,
    modelVersion: VERSIONS.lexical, promptVersion: VERSIONS.prompt, retrievalMode: 'lexical', synthesisMode: 'template',
    diagnostics: {
      fallbackReasons: [], candidateCount: candidates.length, timingsMs: {},
      ranking: picks.map((pick) => ({ id: pick.place.id, exact: pick.exact, lexicalScore: pick.lexicalScore, lexicalRank: pick.lexicalRank, vectorRank: pick.vectorRank, fusionScore: pick.fusionScore, recommendationScore: pick.place.scores.recommendation })),
    },
  };
  response.answer = action ? `SUPERPOWER_ACTION: ${action}\n\n${intro}` : renderAnswer(response);
  return response;
}
export function retrieveAndSynthesize(query: string, places: ConciergePlace[], context: QueryContext = {}) {
  if (!query.trim() || query.length > 1000) return buildResponse('', [], places.length, context);
  return buildResponse(query, lexicalCandidates(query, places, context), places.length, context);
}
