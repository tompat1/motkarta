import type { EstablishmentType, SpecialtyAttributes } from "./scoring.ts";

export const evidenceSourceTypes = [
  "specialist_guide",
  "editorial",
  "verified_user_rating",
  "inspection",
  "official_site",
  "community_submission",
  "osm",
] as const;

export type EvidenceSourceType = (typeof evidenceSourceTypes)[number];

export type EvidenceImportRecord = {
  match: {
    osmType?: string;
    osmId?: string;
    name?: string;
  };
  establishment?: {
    name?: string;
    type?: EstablishmentType;
    district?: string;
    description?: string;
    priceLevel?: number;
    latitude?: number;
    longitude?: number;
    chainStatus?: "independent" | "chain" | "unknown";
  };
  evidence: Array<{
    sourceType: EvidenceSourceType;
    sourceName: string;
    url?: string;
    confidence: number;
    capturedAt?: string;
    summary?: string;
  }>;
  tags?: string[];
  specialty?: SpecialtyAttributes;
};

export function assertEvidenceImportRecord(value: unknown): asserts value is EvidenceImportRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Evidence record must be an object.");
  }

  const record = value as EvidenceImportRecord;
  if (!record.match || (!record.match.osmId && !record.match.name)) {
    throw new Error("Evidence record requires match.osmId or match.name.");
  }

  if (!Array.isArray(record.evidence) || record.evidence.length === 0) {
    throw new Error("Evidence record requires at least one evidence item.");
  }

  for (const evidence of record.evidence) {
    if (!evidenceSourceTypes.includes(evidence.sourceType)) {
      throw new Error(`Unsupported evidence source type: ${evidence.sourceType}`);
    }

    if (!evidence.sourceName) {
      throw new Error("Evidence sourceName is required.");
    }

    if (typeof evidence.confidence !== "number" || evidence.confidence < 0 || evidence.confidence > 1) {
      throw new Error("Evidence confidence must be a number from 0 to 1.");
    }
  }
}

export function placeReference(record: EvidenceImportRecord) {
  if (record.match.osmType && record.match.osmId) {
    return `(SELECT id FROM establishments WHERE osm_type = ${sqlLiteral(record.match.osmType)} AND osm_id = ${sqlLiteral(record.match.osmId)} LIMIT 1)`;
  }

  return `(SELECT id FROM establishments WHERE lower(name) = lower(${sqlLiteral(record.match.name)}) LIMIT 1)`;
}

function sqlLiteral(value: string | undefined) {
  if (!value) {
    return "NULL";
  }

  return `'${value.replaceAll("'", "''")}'`;
}
