import registry from '../../data/concierge/cuisine-dishes.json' with { type: 'json' };
import { includesPhrase, normalize } from './facts.ts';

export type DishHint = {
  terms: string[];
  cuisine: string;
  dish: string;
  match: string[];
};

export const CUISINE_DISHES_VERSION = registry.version;

const signatureDishes = registry.signatureDishes as Record<string, string[]>;

function autoHintsFromSignatures(): DishHint[] {
  const hints: DishHint[] = [];
  for (const [cuisine, dishes] of Object.entries(signatureDishes)) {
    for (const dish of dishes) {
      const key = normalize(dish);
      if (!key) continue;
      hints.push({ terms: [dish], cuisine, dish, match: [dish] });
    }
  }
  return hints;
}

const allHints: DishHint[] = [...registry.dishHints, ...autoHintsFromSignatures()];

/** Signature dishes attached to a cuisine tag during catalog enrichment. */
export function signatureDishesByCuisine(): Record<string, string[]> {
  return signatureDishes;
}

export function dishHints(): DishHint[] {
  return allHints;
}

/** Extra `[searchTerm, cuisine]` pairs for structured filter extraction. */
export function dishCuisineSearchTerms(): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const hint of allHints) {
    for (const term of hint.terms) {
      const key = `${term}::${hint.cuisine}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([term, hint.cuisine]);
    }
  }
  for (const [cuisine, dishes] of Object.entries(signatureDishes)) {
    const key = `${cuisine}::${cuisine}`;
    if (!seen.has(key)) pairs.push([cuisine, cuisine]);
    for (const dish of dishes) {
      const dishKey = `${dish}::${cuisine}`;
      if (!seen.has(dishKey)) pairs.push([dish, cuisine]);
    }
  }
  return pairs;
}

/** `[phrase, dishId]` matchers for intent parsing (longest phrases first). */
export function dishIntentMatchers(): Array<[string, string]> {
  const pairs = allHints.flatMap((hint) => hint.terms.map((term) => [term, hint.dish] as [string, string]));
  return pairs.sort((a, b) => b[0].length - a[0].length);
}

/** Retrieval attribute terms keyed by normalized dish id. */
export function dishMatchTerms(): Record<string, string[]> {
  const map: Record<string, Set<string>> = {};
  for (const hint of allHints) {
    if (!map[hint.dish]) map[hint.dish] = new Set();
    for (const term of hint.match) map[hint.dish].add(term);
    map[hint.dish].add(hint.dish);
  }
  return Object.fromEntries(Object.entries(map).map(([key, values]) => [key, [...values]]));
}

/** Cuisine aliases extended with dish search terms. */
export function dishCuisineAliases(): Record<string, string[]> {
  const aliases: Record<string, Set<string>> = {};
  const add = (term: string, values: string[]) => {
    const key = term.toLowerCase();
    if (!aliases[key]) aliases[key] = new Set();
    for (const value of values) aliases[key].add(value);
    aliases[key].add(key);
  };
  for (const [cuisine, dishes] of Object.entries(signatureDishes)) {
    add(cuisine, [cuisine, ...dishes]);
  }
  for (const hint of allHints) {
    for (const term of hint.terms) {
      add(term, [hint.cuisine, hint.dish, ...signatureDishes[hint.cuisine] ?? []]);
    }
  }
  return Object.fromEntries(Object.entries(aliases).map(([key, values]) => [key, [...values]]));
}

export function mealCuisineIds(): string[] {
  return Object.keys(signatureDishes).filter((cuisine) => !['bakery', 'coffee', 'tapas', 'pizza', 'burger', 'sushi', 'ramen'].includes(cuisine));
}

/** Narrow negation terms: exclude the negated dish family, not the whole cuisine. */
export function dishExclusionTerms(negatedPhrase: string): string[] {
  const terms = new Set<string>();
  const phrase = normalize(negatedPhrase);
  for (const hint of allHints) {
    const matchesHint = hint.terms.some((term) => includesPhrase(negatedPhrase, term) || includesPhrase(term, negatedPhrase))
      || includesPhrase(negatedPhrase, hint.dish)
      || hint.match.some((term) => includesPhrase(negatedPhrase, term));
    if (!matchesHint) continue;
    for (const term of hint.match) terms.add(term);
    terms.add(hint.dish);
  }
  for (const [cuisine, dishes] of Object.entries(signatureDishes)) {
    if (includesPhrase(negatedPhrase, cuisine)) {
      terms.add(cuisine);
      for (const dish of dishes) terms.add(dish);
    }
  }
  if (phrase) terms.add(phrase);
  return [...terms];
}
