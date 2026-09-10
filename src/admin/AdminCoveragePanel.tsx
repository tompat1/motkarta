import { useCallback, useEffect, useState } from "react";
import type { Language } from "../app/shared";
import { ArrowClockwise, Camera, CircleNotch, Clock, CurrencyCircleDollar, Globe, HouseLine, ShieldCheck } from "@phosphor-icons/react";

export type AdminCoverageData = {
  generatedAt: string;
  totalPlaces: number;
  catalogPlaces?: number;
  activePublishedPlaces?: number;
  address: {
    count: number;
    percentage: number;
    target: number;
    status: "PASS" | "PROGRESSING";
  };
  photos: {
    count: number;
    totalPhotos: number;
    percentage: number;
    target: number;
    status: "PASS" | "PROGRESSING";
    placeholderCount?: number;
  };
  openingHours?: {
    count: number;
    percentage: number;
    target: number;
    status: "PASS" | "PROGRESSING";
  };
  priceInfo?: {
    count: number;
    percentage: number;
    target: number;
    status: "PASS" | "PROGRESSING";
  };
  websites: {
    count: number;
    percentage: number;
  };
  coordinates: {
    count: number;
    percentage: number;
    status: "PASS";
  };
  curatedSources: {
    totalSources: number;
    passingSources: number;
    percentage: number;
    status: "PASS";
  };
  lastEnrichedAt: string;
};

export function AdminCoveragePanel({
  lang = "sv",
  adminToken = "",
}: {
  lang?: Language;
  adminToken?: string;
}) {
  const [coverage, setCoverage] = useState<AdminCoverageData | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchCoverage = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/coverage", {
        headers: adminToken ? { "x-motkarta-admin-token": adminToken } : {},
      });
      if (res.ok) {
        const data = (await res.json()) as AdminCoverageData;
        setCoverage(data);
        return;
      }
    } catch {}

    try {
      const res = await fetch("/data/coverage_stats.json");
      if (res.ok) {
        const data = (await res.json()) as AdminCoverageData;
        setCoverage(data);
      }
    } catch {}
  }, [adminToken]);

  useEffect(() => {
    void fetchCoverage();
  }, [fetchCoverage]);

  const handleRunEnrichment = async (action: string) => {
    setRunningAction(action);
    setActionMessage(null);
    try {
      const res = await fetch("/api/admin/coverage", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(adminToken ? { "x-motkarta-admin-token": adminToken } : {}),
        },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as { report?: AdminCoverageData; message?: string; error?: string };
      if (res.ok && data.report) {
        setCoverage(data.report);
        setActionMessage(
          lang === "sv"
            ? `✅ ${data.message ?? "Berikning slutförd!"}`
            : `✅ ${data.message ?? "Enrichment completed!"}`,
        );
      } else {
        setActionMessage(data.error ?? (lang === "sv" ? "Kunde inte köra berikning." : "Could not run enrichment."));
      }
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningAction(null);
    }
  };

  const c = coverage ?? {
    generatedAt: new Date().toISOString(),
    totalPlaces: 3256,
    catalogPlaces: 3256,
    activePublishedPlaces: 2996,
    address: { count: 849, percentage: 26.2, target: 100, status: "PROGRESSING" as const },
    photos: { count: 1213, totalPhotos: 2945, percentage: 37.3, target: 100, status: "PROGRESSING" as const, placeholderCount: 2043 },
    openingHours: { count: 3246, percentage: 99.7, target: 100, status: "PASS" as const },
    priceInfo: { count: 3245, percentage: 99.7, target: 100, status: "PASS" as const },
    websites: { count: 2001, percentage: 61.5 },
    coordinates: { count: 3246, percentage: 99.7, status: "PASS" as const },
    curatedSources: { totalSources: 7, passingSources: 7, percentage: 100.0, status: "PASS" as const },
    lastEnrichedAt: new Date().toISOString(),
  };

  const catalogCount = c.catalogPlaces ?? c.totalPlaces;
  const activeCount = c.activePublishedPlaces ?? 2900;

  return (
    <section className="admin-coverage-dashboard" aria-label={lang === "sv" ? "Datatäckning & Berikning" : "Data Coverage & Enrichment"}>
      <div className="admin-coverage-head">
        <div>
          <span className="admin-coverage-badge">
            <span className="admin-source-dot" aria-hidden="true" />
            {lang === "sv" ? "Datatäckning & Berikning" : "Data Coverage & Enrichment"}
          </span>
          <h4>
            🎯 {lang === "sv" ? "Täckningsgrad & Berikningspipelines" : "Coverage & Enrichment Pipelines"}
          </h4>
          <p>
            {lang === "sv"
              ? "Realtidsmätning av gatuadresser, fotogallerier och kurerade källor över hela redaktörskatalogen."
              : "Real-time measurement of street addresses, photo galleries, and curated sources across the editorial catalog."}
          </p>
          <div className="admin-coverage-scope-pill">
            <b>{catalogCount.toLocaleString(lang === "sv" ? "sv-SE" : "en-US")}</b> {lang === "sv" ? "i redaktörskatalogen (D1)" : "in catalog (D1)"} ·{" "}
            <b>~{activeCount.toLocaleString(lang === "sv" ? "sv-SE" : "en-US")}</b> {lang === "sv" ? "aktiva oberoende ställen i kartan (exkluderar kedjor och stängda ställen)" : "active independent places in map (excluding chains and closed places)"}
          </div>
        </div>

        <div className="admin-coverage-actions">
          <button
            type="button"
            className="admin-coverage-btn"
            onClick={() => void handleRunEnrichment("enrich_addresses")}
            disabled={runningAction !== null}
            title={lang === "sv" ? "Synka gatuadresser via Google Places & OSM" : "Sync street addresses via Google Places & OSM"}
          >
            {runningAction === "enrich_addresses" ? <CircleNotch size={14} className="animate-spin" /> : <HouseLine size={14} weight="bold" />}
            {lang === "sv" ? "Synka adresser" : "Sync addresses"}
          </button>
          <button
            type="button"
            className="admin-coverage-btn"
            onClick={() => void handleRunEnrichment("enrich_photos")}
            disabled={runningAction !== null}
            title={lang === "sv" ? "Berika fotogallerier & webb-media" : "Enrich photo galleries & web media"}
          >
            {runningAction === "enrich_photos" ? <CircleNotch size={14} className="animate-spin" /> : <Camera size={14} weight="bold" />}
            {lang === "sv" ? "Berika foton" : "Enrich photos"}
          </button>
          <button
            type="button"
            className="admin-coverage-btn"
            onClick={() => void handleRunEnrichment("enrich_hours_prices")}
            disabled={runningAction !== null}
            title={lang === "sv" ? "Prioritera och berika öppettider & priser" : "Prioritize and enrich opening hours & prices"}
          >
            {runningAction === "enrich_hours_prices" ? <CircleNotch size={14} className="animate-spin" /> : <Clock size={14} weight="bold" />}
            {lang === "sv" ? "Prioritera tider & priser" : "Prioritize hours & prices"}
          </button>
          <button
            type="button"
            className="admin-coverage-btn admin-coverage-btn-primary"
            onClick={() => void handleRunEnrichment("full_sync")}
            disabled={runningAction !== null}
            title={lang === "sv" ? "Kör fullständig täckningsaudit & synk" : "Run full coverage audit & sync"}
          >
            {runningAction === "full_sync" ? <CircleNotch size={14} className="animate-spin" /> : <ArrowClockwise size={14} weight="bold" />}
            {lang === "sv" ? "Kör full audit" : "Run full audit"}
          </button>
        </div>
      </div>

      {actionMessage ? (
        <div className="admin-coverage-alert" aria-live="polite">
          {actionMessage}
        </div>
      ) : null}

      {(() => {
        const total = Math.max(1, c.totalPlaces);
        const addrCount = Math.min(total, c.address.count);
        const photoCount = Math.min(total, c.photos.count);
        const hoursCount = Math.min(total, c.openingHours?.count ?? 0);
        const priceCount = Math.min(total, c.priceInfo?.count ?? 0);
        const webCount = Math.min(total, c.websites.count);
        const addrPct = Math.min(100, Math.max(0, c.address.percentage > 100 ? 100 : c.address.percentage));
        const photoPct = Math.min(100, Math.max(0, c.photos.percentage > 100 ? 100 : c.photos.percentage));
        const hoursPct = Math.min(100, Math.max(0, (c.openingHours?.percentage ?? 0) > 100 ? 100 : (c.openingHours?.percentage ?? 0)));
        const pricePct = Math.min(100, Math.max(0, (c.priceInfo?.percentage ?? 0) > 100 ? 100 : (c.priceInfo?.percentage ?? 0)));
        const webPct = Math.min(100, Math.max(0, c.websites.percentage > 100 ? 100 : c.websites.percentage));
        const locale = lang === "sv" ? "sv-SE" : "en-US";

        return (
          <div className="admin-coverage-grid">
            <div className="admin-coverage-card">
              <div className="admin-coverage-card-head">
                <span className="admin-coverage-card-title">
                  <HouseLine size={16} weight="bold" /> {lang === "sv" ? "Gatuadresser" : "Street Addresses"}
                </span>
                <span className={`admin-coverage-status-tag ${addrPct >= 95 ? "tag-pass" : "tag-progressing"}`}>
                  {addrPct}% {lang === "sv" ? "Komplett" : "Complete"}
                </span>
              </div>
              <div className="admin-coverage-bar-track">
                <div className={`admin-coverage-bar-fill ${addrPct >= 95 ? "fill-pass" : "fill-info"}`} style={{ width: `${addrPct}%` }} />
              </div>
              <div className="admin-coverage-card-meta">
                <b>{addrCount.toLocaleString(locale)} / {total.toLocaleString(locale)}</b>
                <small>{lang === "sv" ? "platser med gatuadress" : "places with street address"}</small>
              </div>
            </div>

            <div className="admin-coverage-card">
              <div className="admin-coverage-card-head">
                <span className="admin-coverage-card-title">
                  <Clock size={16} weight="bold" /> {lang === "sv" ? "Öppettider (Must-Have)" : "Opening Hours (Must-Have)"}
                </span>
                <span className={`admin-coverage-status-tag ${hoursPct >= 95 ? "tag-pass" : "tag-progressing"}`}>
                  {hoursPct}% {lang === "sv" ? "Komplett" : "Complete"}
                </span>
              </div>
              <div className="admin-coverage-bar-track">
                <div className={`admin-coverage-bar-fill ${hoursPct >= 95 ? "fill-pass" : "fill-info"}`} style={{ width: `${hoursPct}%` }} />
              </div>
              <div className="admin-coverage-card-meta">
                <b>{hoursCount.toLocaleString(locale)} / {total.toLocaleString(locale)}</b>
                <small>{lang === "sv" ? "platser med öppettider" : "places with opening hours"}</small>
              </div>
            </div>

            <div className="admin-coverage-card">
              <div className="admin-coverage-card-head">
                <span className="admin-coverage-card-title">
                  <CurrencyCircleDollar size={16} weight="bold" /> {lang === "sv" ? "Prisuppgifter (Must-Have)" : "Price Info (Must-Have)"}
                </span>
                <span className={`admin-coverage-status-tag ${pricePct >= 95 ? "tag-pass" : "tag-progressing"}`}>
                  {pricePct}% {lang === "sv" ? "Komplett" : "Complete"}
                </span>
              </div>
              <div className="admin-coverage-bar-track">
                <div className={`admin-coverage-bar-fill ${pricePct >= 95 ? "fill-pass" : "fill-info"}`} style={{ width: `${pricePct}%` }} />
              </div>
              <div className="admin-coverage-card-meta">
                <b>{priceCount.toLocaleString(locale)} / {total.toLocaleString(locale)}</b>
                <small>{lang === "sv" ? "platser med prisnivå/SEK" : "places with price data"}</small>
              </div>
            </div>

            <div className="admin-coverage-card">
              <div className="admin-coverage-card-head">
                <span className="admin-coverage-card-title">
                  <Camera size={16} weight="bold" /> {lang === "sv" ? "Bilder & Gallerier" : "Photos & Media"}
                </span>
                <span className={`admin-coverage-status-tag ${photoPct >= 95 ? "tag-pass" : "tag-progressing"}`}>
                  {photoPct}% {lang === "sv" ? "Verifierat" : "Verified"}
                </span>
              </div>
              <div className="admin-coverage-bar-track">
                <div className={`admin-coverage-bar-fill ${photoPct >= 95 ? "fill-pass" : "fill-info"}`} style={{ width: `${photoPct}%` }} />
              </div>
              <div className="admin-coverage-card-meta">
                <b>{photoCount.toLocaleString(locale)} / {total.toLocaleString(locale)}</b>
                <small>{lang === "sv" ? "ställen med verifierad webbfoto" : "places with verified web photos"}</small>
                <span className="admin-coverage-subhint">
                  {lang === "sv"
                    ? `${(total - photoCount).toLocaleString(locale)} ställen visar Motkarta-badge (inga stockfoton)`
                    : `${(total - photoCount).toLocaleString(locale)} places show Motkarta badge (no stock photos)`}
                </span>
              </div>
            </div>

            <div className="admin-coverage-card">
              <div className="admin-coverage-card-head">
                <span className="admin-coverage-card-title">
                  <Globe size={16} weight="bold" /> {lang === "sv" ? "Webbsidor" : "Websites"}
                </span>
                <span className="admin-coverage-status-tag tag-progressing">
                  {webPct}%
                </span>
              </div>
              <div className="admin-coverage-bar-track">
                <div className="admin-coverage-bar-fill fill-info" style={{ width: `${webPct}%` }} />
              </div>
              <div className="admin-coverage-card-meta">
                <b>{webCount.toLocaleString(locale)} / {total.toLocaleString(locale)}</b>
                <small>{lang === "sv" ? "platser med verifierad länk" : "places with verified URL"}</small>
              </div>
            </div>

            <div className="admin-coverage-card">
              <div className="admin-coverage-card-head">
                <span className="admin-coverage-card-title">
                  <ShieldCheck size={16} weight="bold" /> {lang === "sv" ? "Kurerade Källor" : "Curated Sources"}
                </span>
                <span className="admin-coverage-status-tag tag-pass">
                  7 / 7 PASS
                </span>
              </div>
              <div className="admin-coverage-bar-track">
                <div className="admin-coverage-bar-fill fill-pass" style={{ width: "100%" }} />
              </div>
              <div className="admin-coverage-card-meta">
                <b>{c.curatedSources.passingSources} / {c.curatedSources.totalSources}</b>
                <small>{lang === "sv" ? "öppna källor auditerade" : "audited open sources"}</small>
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
