import type { RankedCandidate } from './contracts.ts';
import { dataCompletenessBonus } from './retrieval.ts';

export interface FusionOptions {
  /**
   * Smoothing constant k for Reciprocal Rank Fusion.
   * Standard default in information retrieval is 60.
   */
  k?: number;
  /**
   * Maximum number of lexical candidates to take into fusion before exact matches.
   */
  maxLexical?: number;
}

/**
 * Merges lexical and dense semantic candidates using Reciprocal Rank Fusion (RRF):
 * RRF(d) = sum_{m in {lexical, vector}} 1 / (k + rank_m(d))
 *
 * Guarantees:
 * 1. Exact name matches retain top priority.
 * 2. Candidates with both lexical and vector relevance receive reinforced fusion scores.
 * 3. Ties are broken deterministically by Motkarta recommendation score, data completeness, and ID.
 */
export function reciprocalRankFusion(
  lexical: RankedCandidate[],
  semantic: RankedCandidate[],
  options: FusionOptions = {},
): RankedCandidate[] {
  const k = options.k ?? 60;
  const maxLexical = options.maxLexical ?? 50;

  const merged = new Map<number, RankedCandidate>();

  // Add top lexical candidates + any exact name matches
  for (const candidate of lexical.slice(0, maxLexical).concat(lexical.filter((c) => c.exact))) {
    merged.set(candidate.place.id, { ...candidate });
  }

  // Merge dense semantic candidates, preserving vectorRank and vectorScore
  for (const candidate of semantic) {
    const existing = merged.get(candidate.place.id);
    if (existing) {
      existing.vectorRank = candidate.vectorRank;
      if (candidate.vectorScore !== undefined) {
        existing.vectorScore = candidate.vectorScore;
      }
    } else {
      merged.set(candidate.place.id, { ...candidate });
    }
  }

  // Compute RRF scores
  const candidates = [...merged.values()].map((c) => {
    const lexTerm = c.lexicalRank ? 1 / (k + c.lexicalRank) : 0;
    const vecTerm = c.vectorRank ? 1 / (k + c.vectorRank) : 0;
    return {
      ...c,
      fusionScore: lexTerm + vecTerm,
    };
  });

  // Sort candidates by priority:
  // 1. Exact matches first
  // 2. Highest fusion score
  // 3. Recommendation score + data completeness bonus
  // 4. Stable place ID
  candidates.sort((a, b) => {
    if (Number(b.exact) !== Number(a.exact)) {
      return Number(b.exact) - Number(a.exact);
    }
    if (Math.abs(b.fusionScore - a.fusionScore) > 1e-9) {
      return b.fusionScore - a.fusionScore;
    }
    const aBonus = a.place.scores.recommendation + dataCompletenessBonus(a);
    const bBonus = b.place.scores.recommendation + dataCompletenessBonus(b);
    if (Math.abs(bBonus - aBonus) > 1e-9) {
      return bBonus - aBonus;
    }
    return a.place.id - b.place.id;
  });

  // Assign 1-based fusionRank
  return candidates.map((c, index) => ({
    ...c,
    fusionRank: index + 1,
  }));
}
