export type DuplicateCandidateInput = {
  id: number;
  name?: string | null;
  district?: string | null;
  area?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  duplicateResolution?: string | null;
};

export type PublishedEstablishmentLookup = {
  id: number;
  name: string | null;
  type?: string | null;
  district: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  lifecycle_state?: string | null;
};

export type DuplicateMatchResult = {
  id: number;
  name: string;
  kind: string;
  area: string;
  lifecycleState: string;
  reason: "name_area" | "address" | "nearby_name";
};

const LAT_TOLERANCE = 0.0008;
const LNG_TOLERANCE = 0.0012;
const LAT_CELL = 0.001;
const LNG_CELL = 0.0015;

const GENERIC_ADDRESS_TOKENS = new Set([
  "stockholm",
  "centralstockholm",
  "northstockholm",
  "southstockholm",
  "eaststockholm",
  "weststockholm",
  "stockholmslan",
  "stockholmcounty",
  "stockholmskommun",
  "sweden",
  "sverige",
  "unspecified",
  "sodermalm",
  "norrmalm",
  "ostermalm",
  "vasastan",
  "kungsholmen",
  "gamlastan",
  "djurgarden",
  "solna",
  "sundbyberg",
  "nacka",
  "bromma",
  "soderort",
  "vasterort",
  "norrort",
]);

export function normalizeDuplicateKey(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[ \-.'',]/g, "");
}

export function isSpecificStreetAddress(address: string | null | undefined): boolean {
  const raw = String(address ?? "").trim();
  if (!raw) return false;
  // Require at least one street/building digit OR a non-generic multi-part street name.
  const parts = raw
    .split(",")
    .map((part) => normalizeDuplicateKey(part))
    .filter(Boolean);
  if (parts.length === 0) return false;
  if (parts.every((part) => GENERIC_ADDRESS_TOKENS.has(part))) return false;
  return /\d/.test(raw);
}

function geoCellKey(lat: number, lng: number): string {
  return `${Math.floor(lat / LAT_CELL)},${Math.floor(lng / LNG_CELL)}`;
}

/**
 * O(N) in-memory duplicate matcher replacing the O(N^2) correlated SQLite
 * EXISTS/GROUP_CONCAT subqueries that overloaded Cloudflare D1's 10-second window.
 */
export function findDuplicatesInMemory(
  candidates: DuplicateCandidateInput[],
  published: PublishedEstablishmentLookup[],
): Map<number, DuplicateMatchResult[]> {
  const byNameDistrict = new Map<string, PublishedEstablishmentLookup[]>();
  const byAddress = new Map<string, PublishedEstablishmentLookup[]>();
  const byGeoCell = new Map<string, PublishedEstablishmentLookup[]>();
  const normNameByPubId = new Map<number, string>();

  for (const pub of published) {
    const normName = normalizeDuplicateKey(pub.name);
    normNameByPubId.set(pub.id, normName);
    const normDistrict = String(pub.district ?? "").toLowerCase();
    if (normName) {
      const key = `${normName}|${normDistrict}`;
      const list = byNameDistrict.get(key);
      if (list) list.push(pub);
      else byNameDistrict.set(key, [pub]);
    }
    const normAddr = isSpecificStreetAddress(pub.address) ? normalizeDuplicateKey(pub.address) : "";
    if (normAddr) {
      const list = byAddress.get(normAddr);
      if (list) list.push(pub);
      else byAddress.set(normAddr, [pub]);
    }
    if (typeof pub.latitude === "number" && typeof pub.longitude === "number") {
      const cell = geoCellKey(pub.latitude, pub.longitude);
      const list = byGeoCell.get(cell);
      if (list) list.push(pub);
      else byGeoCell.set(cell, [pub]);
    }
  }

  const results = new Map<number, DuplicateMatchResult[]>();

  for (const cand of candidates) {
    if (cand.duplicateResolution) {
      results.set(cand.id, []);
      continue;
    }

    const normCandName = normalizeDuplicateKey(cand.name);
    const normCandDistrict = String(cand.district ?? cand.area ?? "").toLowerCase();
    const normCandAddr = isSpecificStreetAddress(cand.address) ? normalizeDuplicateKey(cand.address) : "";
    const matchedById = new Map<number, DuplicateMatchResult>();

    const recordMatch = (pub: PublishedEstablishmentLookup, reason: DuplicateMatchResult["reason"]) => {
      if (pub.id === cand.id) return;
      if (matchedById.has(pub.id)) return;
      matchedById.set(pub.id, {
        id: pub.id,
        name: String(pub.name ?? "").replace(/\|/g, " "),
        kind: String(pub.type ?? "").replace(/\|/g, " "),
        area: String(pub.district ?? "").replace(/\|/g, " "),
        lifecycleState: String(pub.lifecycle_state ?? "baseline"),
        reason,
      });
    };

    if (normCandName) {
      const exactNameHits = byNameDistrict.get(`${normCandName}|${normCandDistrict}`) ?? [];
      for (const pub of exactNameHits) {
        recordMatch(pub, "name_area");
      }
    }

    if (normCandAddr) {
      const addrHits = byAddress.get(normCandAddr) ?? [];
      for (const pub of addrHits) {
        recordMatch(pub, "address");
      }
    }

    if (typeof cand.latitude === "number" && typeof cand.longitude === "number" && normCandName) {
      const baseLatCell = Math.floor(cand.latitude / LAT_CELL);
      const baseLngCell = Math.floor(cand.longitude / LNG_CELL);
      for (let dLat = -1; dLat <= 1; dLat += 1) {
        for (let dLng = -1; dLng <= 1; dLng += 1) {
          const cellHits = byGeoCell.get(`${baseLatCell + dLat},${baseLngCell + dLng}`);
          if (!cellHits) continue;
          for (const pub of cellHits) {
            if (pub.id === cand.id || matchedById.has(pub.id)) continue;
            if (
              typeof pub.latitude === "number" &&
              typeof pub.longitude === "number" &&
              Math.abs(cand.latitude - pub.latitude) <= LAT_TOLERANCE &&
              Math.abs(cand.longitude - pub.longitude) <= LNG_TOLERANCE
            ) {
              const pubName = normNameByPubId.get(pub.id) ?? "";
              if (pubName && (pubName.includes(normCandName) || normCandName.includes(pubName))) {
                recordMatch(pub, "nearby_name");
              }
            }
          }
        }
      }
    }

    results.set(cand.id, Array.from(matchedById.values()));
  }

  return results;
}

export function serializeDuplicateMatches(matches: DuplicateMatchResult[]): string {
  return matches
    .map((m) => `${m.id}|${m.name}|${m.kind}|${m.area}|${m.lifecycleState}|${m.reason}`)
    .join(";;");
}
