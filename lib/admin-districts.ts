import { STOCKHOLM_REGIONS } from "./stockholm-regions.ts";

export function mergeDistrictNames(canonical: readonly string[], fromDatabase: string[]) {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const name of [...canonical, ...fromDatabase]) {
    const trimmed = name?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
  }

  return merged.sort((left, right) => left.localeCompare(right, "sv"));
}

export function listCanonicalDistricts() {
  return [...STOCKHOLM_REGIONS];
}
