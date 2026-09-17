import { useCallback, useEffect, useState } from "react";
import type { Language } from "../app/shared";
import { ArrowClockwise, Camera, CircleNotch, Clock, CurrencyCircleDollar, Globe, HouseLine, ShieldCheck } from "@phosphor-icons/react";

import type { CoverageReport } from "../../functions/api/admin/coverage";
export type AdminCoverageData = CoverageReport;

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
        const text = await res.text();
        if (text.startsWith("{")) {
          const data = JSON.parse(text) as AdminCoverageData;
          if (data && typeof data.totalPlaces === "number") {
            setCoverage(data);
            return;
          }
        }
      }
    } catch {}

    setCoverage(null);
    setActionMessage(lang === "sv" ? "Täckningsdata är inte tillgänglig." : "Coverage data is unavailable.");
  }, [adminToken, lang]);

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
            ? `✅ ${data.message ?? "Täckning uppmätt."}`
            : `✅ ${data.message ?? "Coverage measured."}`,
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

  if (!coverage) return <p role="status">{actionMessage ?? (lang === "sv" ? "Läser täckningsdata…" : "Loading coverage…")}</p>;
  const c = coverage;

  const catalogCount = c.catalogPlaces ?? c.totalPlaces;
  const activeCount = c.activePublishedPlaces ?? 0;

  return (
    <section className="admin-coverage-dashboard" aria-label={lang === "sv" ? "Datatäckning & Berikning" : "Data Coverage & Enrichment"}>
      {(c.errors ?? []).map((error) => <p role="status" key={error}>{error}</p>)}
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
            <b>~{activeCount.toLocaleString(lang === "sv" ? "sv-SE" : "en-US")}</b> {lang === "sv" ? "D1-poster utan kedje- eller stängningsmarkering" : "D1 records without chain or closure flags"}
          </div>
        </div>

        <div className="admin-coverage-actions">
          <button
            type="button"
            className="admin-coverage-btn admin-coverage-btn-primary"
            onClick={() => void handleRunEnrichment("full_sync")}
            disabled={runningAction !== null}
            title={lang === "sv" ? "Kör fullständig täckningsaudit" : "Run full coverage audit"}
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
                  {photoPct}% {lang === "sv" ? "Registrerat" : "Recorded"}
                </span>
              </div>
              <div className="admin-coverage-bar-track">
                <div className={`admin-coverage-bar-fill ${photoPct >= 95 ? "fill-pass" : "fill-info"}`} style={{ width: `${photoPct}%` }} />
              </div>
              <div className="admin-coverage-card-meta">
                <b>{photoCount.toLocaleString(locale)} / {total.toLocaleString(locale)}</b>
                <small>{lang === "sv" ? "ställen med lagrade foton" : "places with stored photos"}</small>
                <span className="admin-coverage-subhint">
                  {lang === "sv"
                    ? `${(total - photoCount).toLocaleString(locale)} ställen saknar foton i D1`
                    : `${(total - photoCount).toLocaleString(locale)} places lack photos in D1`}
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
                <small>{lang === "sv" ? "platser med registrerad länk" : "places with recorded URL"}</small>
              </div>
            </div>

            <div className="admin-coverage-card">
              <div className="admin-coverage-card-head">
                <span className="admin-coverage-card-title">
                  <ShieldCheck size={16} weight="bold" /> {lang === "sv" ? "Kurerade Källor" : "Curated Sources"}
                </span>
                <span className="admin-coverage-status-tag tag-pass">
                  {lang === "sv" ? "Inte uppmätt" : "Not measured"}
                </span>
              </div>
              <div className="admin-coverage-bar-track">
                <div className="admin-coverage-bar-fill fill-pass" style={{ width: `${c.curatedSources.percentage}%` }} />
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
