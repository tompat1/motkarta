import type { PlaceInput, ScoredPlace } from '../scoring.ts';

export const VERSIONS = {
  schema: 'concierge-response-v1', corpus: 'concierge-facts-v1',
  lexical: 'concierge-lexical-v1', hybrid: 'concierge-hybrid-v1',
  prompt: 'concierge-synthesis-v1', scorer: 'transparent-scorer-v1.1',
} as const;
export const EMBEDDING_MODEL = '@cf/baai/bge-m3';
export const EMBEDDING_DIMENSIONS = 1024;
export const SYNTHESIS_MODEL = '@cf/google/gemma-3-12b-it';
export type Locale = 'sv' | 'en';
export type Coordinates = { latitude: number; longitude: number };
export type QueryContext = { language?: Locale; location?: Coordinates; radiusKm?: number };
export type SourceFact = {
  id: string; placeId: number; field: string; value: string;
  source: string; url?: string; license?: string; capturedAt?: string;
  verification: 'listed' | 'verified'; verifiedAt?: string;
};
export type EvidenceSource = { id: string; name: string; type: string; url?: string; capturedAt?: string; summary?: string };
export type ConciergePlace = PlaceInput & {
  sourceUrl?: string; chainStatus?: 'independent' | 'chain' | 'unknown';
  sourceFacts?: SourceFact[]; evidenceSources?: EvidenceSource[];
  sourcePriceLevel?: number | null;
};
export type ConciergePlaceFacts = {
  id: number; facts: SourceFact[]; document: string; chainStatus: string;
};
export type ConciergeCard = {
  id: number; name: string; kind: string; area: string; whyItMatches: string;
  hoursConfidence: string; priceConfidence: string; lastVerified: string;
  missingInfo: string; dataSources: string; citations: SourceFact[];
  distanceKm?: number; website?: string;
};
export type RankedCandidate = {
  place: ScoredPlace; facts: ConciergePlaceFacts; lexicalScore: number;
  exact: boolean; lexicalRank?: number; vectorRank?: number; fusionScore: number;
  distanceKm?: number;
};
export type ConciergeResponse = {
  query: string; answer: string; intro: string; cards: ConciergeCard[];
  recommendedPlaces: Array<Pick<ScoredPlace, 'id' | 'name' | 'kind' | 'area' | 'scores' | 'hiddenGem' | 'discoveryReasons'>>;
  source: string; totalSearchSpace: number; status: 'ok' | 'partial' | 'clarification' | 'unavailable';
  action?: 'add_place' | 'add_review' | 'add_photo' | 'rate_place';
  structuredFilters: import('./filters.ts').StructuredFilters;
  schemaVersion: string; corpusVersion: string; modelVersion: string; promptVersion: string;
  retrievalMode: 'lexical' | 'hybrid'; synthesisMode: 'template' | 'constrained';
  diagnostics: {
    fallbackReasons: string[]; candidateCount: number; timingsMs: Record<string, number>;
    ranking: Array<{ id: number; exact: boolean; lexicalScore: number; lexicalRank?: number; vectorRank?: number; fusionScore: number; recommendationScore: number }>;
  };
};
export type AiBinding = { run(model: string, input: Record<string, unknown>): Promise<unknown> };
export type VectorMatch = { id: string; score: number; metadata?: Record<string, unknown> };
export type VectorBinding = { query(vector: number[], options: Record<string, unknown>): Promise<{ matches: VectorMatch[] }> };
