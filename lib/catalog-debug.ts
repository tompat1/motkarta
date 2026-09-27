export type CatalogDebugLang = "sv" | "en";

export type CatalogMode = "static" | "d1_overlay" | "d1_only";
export type LiveApiStatus = "skipped" | "ok" | "failed" | "empty";

export type CatalogDebug = {
  catalogMode: CatalogMode | "loading" | "unavailable";
  placeCount: number;
  liveApi: LiveApiStatus;
};

export function catalogDebugLoading(): CatalogDebug {
  return { catalogMode: "loading", placeCount: 0, liveApi: "skipped" };
}

export function catalogDebugUnavailable(): CatalogDebug {
  return { catalogMode: "unavailable", placeCount: 0, liveApi: "skipped" };
}

export function formatCatalogDebugTitle(debug: CatalogDebug, lang: CatalogDebugLang): string {
  const sv = lang === "sv";
  const modeLabels: Record<CatalogDebug["catalogMode"], { sv: string; en: string }> = {
    loading: { sv: "Laddar katalog…", en: "Loading catalog…" },
    unavailable: { sv: "Katalog otillgänglig", en: "Catalog unavailable" },
    static: {
      sv: "Bas: places.json (ingen D1-överlagring aktiv)",
      en: "Base: places.json (no active D1 overlay)",
    },
    d1_overlay: {
      sv: "Bas: places.json + D1-överlagring (admin/live-fält)",
      en: "Base: places.json + D1 overlay (admin/live fields)",
    },
    d1_only: {
      sv: "Endast D1 API (statisk export saknas)",
      en: "D1 API only (static export missing)",
    },
  };
  const apiLabels: Record<LiveApiStatus, { sv: string; en: string }> = {
    skipped: { sv: "D1 /api/places: ej anropad", en: "D1 /api/places: not called" },
    ok: { sv: "D1 /api/places: OK", en: "D1 /api/places: OK" },
    failed: {
      sv: "D1 /api/places: misslyckades eller timeout — visar statisk kök/data från JSON",
      en: "D1 /api/places: failed or timed out — showing static cuisine/data from JSON",
    },
    empty: { sv: "D1 /api/places: tom svar", en: "D1 /api/places: empty response" },
  };
  const mode = modeLabels[debug.catalogMode][sv ? "sv" : "en"];
  const api = apiLabels[debug.liveApi][sv ? "sv" : "en"];
  const count = sv
    ? `${debug.placeCount.toLocaleString("sv-SE")} publicerade platser i minnet`
    : `${debug.placeCount.toLocaleString("en-US")} published places in memory`;
  return `${mode}. ${api}. ${count}.`;
}

export function formatCatalogDebugChip(debug: CatalogDebug, lang: CatalogDebugLang): string {
  const sv = lang === "sv";
  if (debug.catalogMode === "loading") {
    return sv ? "Katalog: laddar…" : "Catalog: loading…";
  }
  if (debug.catalogMode === "unavailable") {
    return sv ? "Katalog: fel" : "Catalog: error";
  }
  const modeShort: Record<CatalogMode, { sv: string; en: string }> = {
    static: { sv: "JSON", en: "JSON" },
    d1_overlay: { sv: "JSON+D1", en: "JSON+D1" },
    d1_only: { sv: "D1", en: "D1" },
  };
  const apiShort: Record<LiveApiStatus, string> = {
    skipped: "—",
    ok: "D1✓",
    failed: "D1✗",
    empty: "D1∅",
  };
  const mode = modeShort[debug.catalogMode][sv ? "sv" : "en"];
  const api = apiShort[debug.liveApi];
  const n = debug.placeCount.toLocaleString(sv ? "sv-SE" : "en-US");
  return sv ? `Katalog ${mode} · ${api} · ${n}` : `Catalog ${mode} · ${api} · ${n}`;
}
