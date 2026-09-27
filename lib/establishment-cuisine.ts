import {
  canonicalCuisineTagLiterals,
  normalizeCuisineTag,
  parseCuisineInput,
} from "./cuisine-tags.ts";

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<{ success?: boolean; meta?: { changes?: number } }>;
};

type D1Database = {
  prepare(query: string): D1Statement;
};

export function sqlNormalizedTagExpression(column: string) {
  return `lower(trim(replace(replace(replace(${column}, '_', ' '), '-', ' '), '  ', ' ')))`;
}

const cuisineLiteralsSql = canonicalCuisineTagLiterals
  .map((tag) => `'${tag.replace(/'/g, "''")}'`)
  .join(", ");

export function sqlEstablishmentHasCuisine(alias = "e") {
  return `EXISTS (
    SELECT 1 FROM establishment_tags t
    WHERE t.establishment_id = ${alias}.id
      AND ${sqlNormalizedTagExpression("t.tag")} IN (${cuisineLiteralsSql})
  )`;
}

export function sqlEstablishmentMissingCuisine(alias = "e") {
  return `NOT ${sqlEstablishmentHasCuisine(alias)}`;
}

export function sqlEstablishmentCuisineTagsSelect(alias = "e", columnAlias = "cuisineTags") {
  return `(SELECT GROUP_CONCAT(cuisine_tag, ';')
    FROM (
      SELECT DISTINCT t.tag AS cuisine_tag
      FROM establishment_tags t
      WHERE t.establishment_id = ${alias}.id
        AND ${sqlNormalizedTagExpression("t.tag")} IN (${cuisineLiteralsSql})
    )) AS ${columnAlias}`;
}

export async function syncEstablishmentCuisineTags(
  db: D1Database,
  establishmentId: number,
  cuisineInput: string,
) {
  const cuisines = parseCuisineInput(cuisineInput);
  await db
    .prepare(
      `DELETE FROM establishment_tags
       WHERE establishment_id = ?
         AND ${sqlNormalizedTagExpression("tag")} IN (${cuisineLiteralsSql})`,
    )
    .bind(establishmentId)
    .run()
    .catch(() => {});

  for (const cuisine of cuisines) {
    await db
      .prepare(`INSERT OR IGNORE INTO establishment_tags (establishment_id, tag) VALUES (?, ?)`)
      .bind(establishmentId, cuisine)
      .run()
      .catch(() => {});
  }
}

export function hasRecognizedCuisineTag(tag: string) {
  const normalized = normalizeCuisineTag(tag);
  return canonicalCuisineTagLiterals.includes(normalized);
}
