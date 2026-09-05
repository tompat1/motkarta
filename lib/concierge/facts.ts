import { VERSIONS, type ConciergePlace, type ConciergePlaceFacts, type SourceFact } from './contracts.ts';

export function normalize(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, ' ').trim();
}
export function includesPhrase(text: string, phrase: string): boolean {
  return (` ${normalize(text)} `).includes(` ${normalize(phrase)} `);
}
export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
export function plainText(value: unknown, limit = 500): string {
  return typeof value === 'string' ? value.replace(/[\r\n\x00-\x1f]/g, ' ').replace(/[#*<>`]/g, '').trim().slice(0, limit) : '';
}
const FIELDS = new Set(['name', 'kind', 'area', 'address', 'cuisine', 'tags', 'dish', 'dogFriendly', 'priceSEK', 'openingHours', 'transit', 'atmosphere']);
export function placeFacts(place: ConciergePlace): ConciergePlaceFacts {
  const source = plainText(place.sourceName) || 'Motkarta catalog';
  const facts: SourceFact[] = [];
  for (const field of ['name', 'kind', 'area', 'address', 'cuisine'] as const) {
    const value = plainText(place[field]);
    if (value) facts.push({ id: `${place.id}:${field}`, placeId: place.id, field, value, source, url: safeUrl(place.sourceUrl), verification: 'listed' });
  }
  // Tags are listed attributes, never automatically verified evidence.
  for (const [index, tag] of (place.tags ?? []).entries()) {
    if (typeof tag !== 'string' || /rating|review|popular|quality|hidden gem|verified|independent|anomal|residual/i.test(tag)) continue;
    facts.push({ id: `${place.id}:tag:${index}`, placeId: place.id, field: 'tags', value: plainText(tag, 100), source, url: safeUrl(place.sourceUrl), verification: 'listed' });
  }
  for (const fact of place.sourceFacts ?? []) {
    if (fact.placeId !== place.id || !FIELDS.has(fact.field) || !fact.id || !plainText(fact.value) || !plainText(fact.source)) continue;
    if (facts.some((item) => item.id === fact.id)) continue;
    facts.push({ ...fact, value: plainText(fact.value), source: plainText(fact.source), url: safeUrl(fact.url), verification: fact.verification === 'verified' && fact.verifiedAt && Number.isFinite(Date.parse(fact.verifiedAt)) ? 'verified' : 'listed' });
  }
  for (const evidence of place.evidenceSources ?? []) {
    facts.push({ id: `${place.id}:source:${evidence.id}`, placeId: place.id, field: 'evidenceRecord', value: plainText(evidence.name), source: plainText(evidence.name), url: safeUrl(evidence.url), capturedAt: evidence.capturedAt, verification: 'listed' });
  }
  const document = facts.filter((fact) => fact.field !== 'evidenceRecord').map(({ field, value }) => `${field}: ${value}`).join('\n');
  return { id: place.id, facts, document, chainStatus: place.chainStatus ?? 'unknown' };
}
export async function documentHash(document: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${VERSIONS.corpus}\n${document}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
