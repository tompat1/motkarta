import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Language } from "../app/shared";
import {
  ArrowClockwise,
  ArrowSquareOut,
  Camera,
  CheckCircle,
  CircleNotch,
  Clock,
  CurrencyCircleDollar,
  Globe,
  HouseLine,
  MagnifyingGlass,
  Prohibit,
  ShieldCheck,
  ShieldWarning,
  Trash,
} from "@phosphor-icons/react";

import type {
  BlockedUrlEntry,
  CoverageGap,
  CoverageGapListResponse,
  CoverageReport,
  EnrichmentRunReport,
} from "../../functions/api/admin/coverage";
export type AdminCoverageData = CoverageReport;

const GAP_PAGE_SIZE = 100;

type ClickableCoverageGap = Exclude<CoverageGap, never>;

export function AdminCoveragePanel({
  lang = "sv",
  adminToken = "",
  onSelectPlace,
}: {
  lang?: Language;
  adminToken?: string;
  onSelectPlace?: (placeId: number) => void;
}) {
  const [coverage, setCoverage] = useState<AdminCoverageData | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [blocklist, setBlocklist] = useState<BlockedUrlEntry[]>([]);
  const [enrichmentReport, setEnrichmentReport] = useState<EnrichmentRunReport | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorFilter, setErrorFilter] = useState<"all" | "404" | "403_500" | "timeout_network">("all");
  const [unblockingUrl, setUnblockingUrl] = useState<string | null>(null);
  const [activeGap, setActiveGap] = useState<ClickableCoverageGap | null>(null);
  const [gapList, setGapList] = useState<CoverageGapListResponse | null>(null);
  const [gapSearch, setGapSearch] = useState("");
  const [gapOffset, setGapOffset] = useState(0);
  const [gapLoading, setGapLoading] = useState(false);
  const gapRequestRef = useRef(0);

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
            const enrichedData = { ...data };
            if (!enrichedData.enrichmentReport || !enrichedData.urlBlocklist) {
              try {
                const [repRes, blRes] = await Promise.all([
                  fetch("/data/enrichment_run_report.json").catch(() => null),
                  fetch("/data/enrichment_url_blocklist.json").catch(() => null),
                ]);
                if (repRes?.ok && !enrichedData.enrichmentReport) {
                  enrichedData.enrichmentReport = (await repRes.json()) as EnrichmentRunReport;
                }
                if (blRes?.ok && !enrichedData.urlBlocklist) {
                  const blJson = (await blRes.json()) as { blockedUrls?: BlockedUrlEntry[] };
                  enrichedData.urlBlocklist = blJson.blockedUrls || [];
                }
              } catch {}
            }

            setCoverage(enrichedData);
            setBlocklist(enrichedData.urlBlocklist || []);
            setEnrichmentReport(enrichedData.enrichmentReport || null);
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
        if (data.report.urlBlocklist) {
          setBlocklist(data.report.urlBlocklist);
        }
        if (data.report.enrichmentReport) {
          setEnrichmentReport(data.report.enrichmentReport);
        }
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

  const handleUnblockUrl = async (targetUrl: string) => {
    setUnblockingUrl(targetUrl);
    // Optimistically update blocklist
    const previous = [...blocklist];
    const normTarget = targetUrl.trim().toLowerCase().replace(/\/+$/, "");
    const updated = previous.filter((item) => {
      const itemNorm = (item.normalizedUrl || item.url || "").trim().toLowerCase().replace(/\/+$/, "");
      return itemNorm !== normTarget && item.url !== targetUrl;
    });
    setBlocklist(updated);

    try {
      const res = await fetch("/api/admin/coverage", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(adminToken ? { "x-motkarta-admin-token": adminToken } : {}),
        },
        body: JSON.stringify({ action: "unblock_url", url: targetUrl }),
      });
      if (res.ok) {
        setActionMessage(
          lang === "sv"
            ? `✅ Webbadress ${targetUrl} har tagits bort från blockeringslistan.`
            : `✅ URL ${targetUrl} has been unblocked.`,
        );
      } else {
        // Rollback on hard error
        setBlocklist(previous);
        setActionMessage(lang === "sv" ? "Kunde inte avblockera webbadressen." : "Failed to unblock URL.");
      }
    } catch {
      setBlocklist(previous);
      setActionMessage(lang === "sv" ? "Nätverksfel vid avblockering." : "Network error unblocking URL.");
    } finally {
      setUnblockingUrl(null);
    }
  };

  const fetchGapPlaces = useCallback(async (gap: ClickableCoverageGap, offset = 0, search = "") => {
    const requestId = ++gapRequestRef.current;
    const trimmedSearch = search.trim();
    setGapLoading(true);
    setActiveGap(gap);
    setGapOffset(offset);
    setGapList(null);
    try {
      const params = new URLSearchParams({
        gap,
        limit: String(GAP_PAGE_SIZE),
        offset: String(offset),
      });
      if (trimmedSearch) params.set("search", trimmedSearch);
      const res = await fetch(`/api/admin/coverage?${params.toString()}`, {
        headers: adminToken ? { "x-motkarta-admin-token": adminToken } : {},
      });
      const data = (await res.json().catch(() => ({}))) as CoverageGapListResponse & { error?: string };
      if (requestId !== gapRequestRef.current) return;
      if (!res.ok) {
        setGapList(null);
        setActionMessage(data.error ?? (lang === "sv" ? "Kunde inte läsa saknade fält." : "Could not load missing-field list."));
        return;
      }
      setGapList({
        ...data,
        places: Array.isArray(data.places) ? data.places : [],
      });
    } catch (err) {
      if (requestId !== gapRequestRef.current) return;
      setGapList(null);
      setActionMessage(err instanceof Error ? err.message : String(err));
    } finally {
      if (requestId === gapRequestRef.current) {
        setGapLoading(false);
      }
    }
  }, [adminToken, lang]);

  const gapLabels = useMemo(() => ({
    address: {
      title: lang === "sv" ? "Saknar gatuadress" : "Missing street address",
      subtitle: lang === "sv" ? "platser utan gatuadress" : "places without street address",
    },
    opening_hours: {
      title: lang === "sv" ? "Saknar öppettider" : "Missing opening hours",
      subtitle: lang === "sv" ? "platser utan öppettider" : "places without opening hours",
    },
    price: {
      title: lang === "sv" ? "Saknar prisuppgifter" : "Missing price info",
      subtitle: lang === "sv" ? "platser utan prisnivå/SEK" : "places without price data",
    },
    photos: {
      title: lang === "sv" ? "Saknar hero-bild" : "Missing hero image",
      subtitle: lang === "sv" ? "platser utan lagrade foton i D1" : "places without stored photos in D1",
    },
    website: {
      title: lang === "sv" ? "Saknar webbsida" : "Missing website",
      subtitle: lang === "sv" ? "platser utan registrerad länk" : "places without recorded URL",
    },
  }), [lang]);

  const filteredBlocklist = useMemo(() => {
    let list = blocklist;
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      list = list.filter((item) => {
        const name = (item.placeName || "").toLowerCase();
        const url = (item.url || "").toLowerCase();
        const domain = (item.domain || "").toLowerCase();
        const error = (item.errorType || "").toLowerCase() + " " + (item.errorMessage || "").toLowerCase();
        const id = String(item.placeId || "");
        return name.includes(query) || url.includes(query) || domain.includes(query) || error.includes(query) || id.includes(query);
      });
    }

    if (errorFilter === "404") {
      list = list.filter((item) => item.errorType.includes("404") || item.statusCode === 404);
    } else if (errorFilter === "403_500") {
      list = list.filter(
        (item) =>
          item.errorType.includes("403") ||
          item.errorType.includes("500") ||
          (item.statusCode && item.statusCode >= 500),
      );
    } else if (errorFilter === "timeout_network") {
      list = list.filter(
        (item) =>
          item.errorType.includes("Timeout") ||
          item.errorType.includes("Network") ||
          item.errorType.includes("Connection") ||
          item.errorType.includes("DNS") ||
          item.errorType.includes("SSL"),
      );
    }

    return list;
  }, [blocklist, searchQuery, errorFilter]);

  if (!coverage) return <p role="status">{actionMessage ?? (lang === "sv" ? "Läser täckningsdata…" : "Loading coverage…")}</p>;
  const c = coverage;

  const catalogCount = c.catalogPlaces ?? c.totalPlaces;
  const activeCount = c.activePublishedPlaces ?? 0;
  const locale = lang === "sv" ? "sv-SE" : "en-US";

  const runReport = enrichmentReport || c.enrichmentReport;
  const runSummary = runReport?.summary;

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
            <b>{catalogCount.toLocaleString(locale)}</b> {lang === "sv" ? "i redaktörskatalogen (D1)" : "in catalog (D1)"} ·{" "}
            <b>~{activeCount.toLocaleString(locale)}</b> {lang === "sv" ? "D1-poster utan kedje- eller stängningsmarkering" : "D1 records without chain or closure flags"}
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

        const gapCards: Array<{
          gap: ClickableCoverageGap;
          title: string;
          icon: ReactNode;
          pct: number;
          count: number;
          subtitle: string;
          subhint?: string;
        }> = [
          {
            gap: "address",
            title: lang === "sv" ? "Gatuadresser" : "Street Addresses",
            icon: <HouseLine size={16} weight="bold" />,
            pct: addrPct,
            count: addrCount,
            subtitle: lang === "sv" ? "platser med gatuadress" : "places with street address",
            subhint: lang === "sv"
              ? `${(total - addrCount).toLocaleString(locale)} saknar gatuadress`
              : `${(total - addrCount).toLocaleString(locale)} lack street address`,
          },
          {
            gap: "opening_hours",
            title: lang === "sv" ? "Öppettider (Must-Have)" : "Opening Hours (Must-Have)",
            icon: <Clock size={16} weight="bold" />,
            pct: hoursPct,
            count: hoursCount,
            subtitle: lang === "sv" ? "platser med öppettider" : "places with opening hours",
          },
          {
            gap: "price",
            title: lang === "sv" ? "Prisuppgifter (Must-Have)" : "Price Info (Must-Have)",
            icon: <CurrencyCircleDollar size={16} weight="bold" />,
            pct: pricePct,
            count: priceCount,
            subtitle: lang === "sv" ? "platser med prisnivå/SEK" : "places with price data",
          },
          {
            gap: "photos",
            title: lang === "sv" ? "Bilder & Gallerier" : "Photos & Media",
            icon: <Camera size={16} weight="bold" />,
            pct: photoPct,
            count: photoCount,
            subtitle: lang === "sv" ? "ställen med lagrade foton" : "places with stored photos",
            subhint: lang === "sv"
              ? `${(total - photoCount).toLocaleString(locale)} ställen saknar foton i D1`
              : `${(total - photoCount).toLocaleString(locale)} places lack photos in D1`,
          },
          {
            gap: "website",
            title: lang === "sv" ? "Webbsidor" : "Websites",
            icon: <Globe size={16} weight="bold" />,
            pct: webPct,
            count: webCount,
            subtitle: lang === "sv" ? "platser med registrerad länk" : "places with recorded URL",
          },
        ];

        return (
          <div className="admin-coverage-grid">
            {gapCards.map((card) => (
              <button
                key={card.gap}
                type="button"
                className={`admin-coverage-card admin-coverage-card-btn${activeGap === card.gap ? " is-active" : ""}`}
                onClick={() => {
                  setGapSearch("");
                  setGapOffset(0);
                  void fetchGapPlaces(card.gap, 0, "");
                }}
                aria-pressed={activeGap === card.gap}
                title={lang === "sv" ? `Visa ${gapLabels[card.gap].subtitle}` : `Show ${gapLabels[card.gap].subtitle}`}
              >
                <div className="admin-coverage-card-head">
                  <span className="admin-coverage-card-title">
                    {card.icon} {card.title}
                  </span>
                  <span className={`admin-coverage-status-tag ${card.pct >= 95 ? "tag-pass" : "tag-progressing"}`}>
                    {card.pct}% {card.gap === "photos" ? (lang === "sv" ? "Registrerat" : "Recorded") : (lang === "sv" ? "Komplett" : "Complete")}
                  </span>
                </div>
                <div className="admin-coverage-bar-track">
                  <div className={`admin-coverage-bar-fill ${card.pct >= 95 ? "fill-pass" : "fill-info"}`} style={{ width: `${card.pct}%` }} />
                </div>
                <div className="admin-coverage-card-meta">
                  <b>{card.count.toLocaleString(locale)} / {total.toLocaleString(locale)}</b>
                  <small>{card.subtitle}</small>
                  {card.subhint ? <span className="admin-coverage-subhint">{card.subhint}</span> : null}
                </div>
              </button>
            ))}

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

      {activeGap ? (
        <div className="admin-coverage-gap-section" aria-label={gapLabels[activeGap].title}>
          <div className="admin-coverage-gap-head">
            <div>
              <h5>{gapLabels[activeGap].title}</h5>
              <p>
                {gapList
                  ? `${gapList.total.toLocaleString(locale)} ${gapLabels[activeGap].subtitle}`
                  : (lang === "sv" ? "Läser lista…" : "Loading list…")}
              </p>
            </div>
            <button
              type="button"
              className="admin-coverage-gap-close"
              onClick={() => {
                setActiveGap(null);
                setGapList(null);
                setGapSearch("");
                setGapOffset(0);
              }}
            >
              {lang === "sv" ? "Stäng" : "Close"}
            </button>
          </div>

          <div className="admin-blocklist-toolbar">
            <div className="admin-blocklist-search">
              <MagnifyingGlass size={15} className="admin-blocklist-search-icon" />
              <input
                type="text"
                className="admin-blocklist-input"
                placeholder={lang === "sv" ? "Sök namn, stadsdel eller ID…" : "Search name, district or ID…"}
                value={gapSearch}
                onChange={(event) => setGapSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void fetchGapPlaces(activeGap, 0, event.currentTarget.value);
                }}
                aria-label={lang === "sv" ? "Sök i listan" : "Search gap list"}
              />
              <button
                type="button"
                className="admin-coverage-gap-search-btn"
                onClick={() => void fetchGapPlaces(activeGap, 0, gapSearch)}
                disabled={gapLoading}
              >
                {lang === "sv" ? "Sök" : "Search"}
              </button>
            </div>
          </div>

          {gapList?.errors?.length ? (
            <p className="admin-photo-manager-error" role="alert">{gapList.errors.join(" ")}</p>
          ) : null}

          {gapLoading ? (
            <p role="status"><CircleNotch size={16} className="animate-spin" /> {lang === "sv" ? "Läser platser…" : "Loading places…"}</p>
          ) : gapList && gapList.places.length === 0 ? (
            <div className="admin-blocklist-empty">
              <CheckCircle size={32} weight="duotone" className="admin-blocklist-empty-icon" />
              <p>{lang === "sv" ? "Inga platser matchar denna lucka." : "No places match this gap."}</p>
            </div>
          ) : gapList ? (
            <>
              <div className="admin-blocklist-table-container">
                <table className="admin-blocklist-table">
                  <thead>
                    <tr>
                      <th>{lang === "sv" ? "Ställe / ID" : "Venue / ID"}</th>
                      <th>{lang === "sv" ? "Typ · Stadsdel" : "Kind · District"}</th>
                      <th>{lang === "sv" ? "Adress" : "Address"}</th>
                      <th>{lang === "sv" ? "Webb" : "Website"}</th>
                      <th className="th-action">{lang === "sv" ? "Åtgärd" : "Action"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gapList.places.map((place) => (
                      <tr key={place.id}>
                        <td className="td-venue">
                          <b>{place.name}</b>
                          <span className="admin-blocklist-pid">#{place.id}</span>
                        </td>
                        <td>{place.kind} · {place.area}</td>
                        <td>{place.address || "—"}</td>
                        <td className="td-url">
                          {place.website ? (
                            <a href={place.website} target="_blank" rel="noopener noreferrer" className="admin-blocklist-link">
                              <span className="admin-blocklist-url-text">{place.website}</span>
                              <ArrowSquareOut size={13} />
                            </a>
                          ) : "—"}
                        </td>
                        <td className="td-action">
                          {onSelectPlace ? (
                            <button
                              type="button"
                              className="admin-blocklist-unblock-btn"
                              onClick={() => onSelectPlace(place.id)}
                            >
                              {lang === "sv" ? "Öppna i kön" : "Open in queue"}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="admin-coverage-gap-summary">
                {lang === "sv"
                  ? `Visar ${gapList.places.length.toLocaleString(locale)} av ${gapList.total.toLocaleString(locale)} platser`
                  : `Showing ${gapList.places.length.toLocaleString(locale)} of ${gapList.total.toLocaleString(locale)} places`}
              </div>
              {gapList.total > GAP_PAGE_SIZE ? (
                <div className="admin-coverage-gap-pagination">
                  <button
                    type="button"
                    className="admin-coverage-gap-page-btn"
                    disabled={gapOffset <= 0 || gapLoading}
                    onClick={() => void fetchGapPlaces(activeGap, Math.max(0, gapOffset - GAP_PAGE_SIZE), gapSearch)}
                  >
                    {lang === "sv" ? "Föregående" : "Previous"}
                  </button>
                  <span>
                    {gapOffset + 1}–{Math.min(gapOffset + GAP_PAGE_SIZE, gapList.total)} / {gapList.total.toLocaleString(locale)}
                  </span>
                  <button
                    type="button"
                    className="admin-coverage-gap-page-btn"
                    disabled={gapOffset + GAP_PAGE_SIZE >= gapList.total || gapLoading}
                    onClick={() => void fetchGapPlaces(activeGap, gapOffset + GAP_PAGE_SIZE, gapSearch)}
                  >
                    {lang === "sv" ? "Nästa" : "Next"}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Enrichment Run Report & URL Blocklist Section                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="admin-blocklist-section" aria-label={lang === "sv" ? "Enrichment Körningsrapport & URL-blockeringslista" : "Enrichment Run Report & URL Blocklist"}>
        <div className="admin-blocklist-header">
          <div className="admin-blocklist-title-group">
            <span className="admin-coverage-badge">
              <Prohibit size={14} weight="bold" />
              {lang === "sv" ? "Automatiserad Blocklist & Rapport" : "Automated Blocklist & Report"}
            </span>
            <h5 className="admin-blocklist-title">
              {lang === "sv" ? "🚫 URL-fel & Blockeringslista (Enrichment Runs)" : "🚫 URL Errors & Blocklist (Enrichment Runs)"}
            </h5>
            <p className="admin-blocklist-subcopy">
              {lang === "sv"
                ? "Onåbara eller trasiga webbadresser (404, 403, 500, timeouts) blockeras automatiskt så framtida skrapningar inte fastnar eller gör onödiga förfrågningar. Du kan manuellt avblockera en adress om stället åtgärdat sin hemsida."
                : "Unreachable or broken URLs (404, 403, 500, timeouts) are automatically blocklisted so future scraping runs skip them immediately, preventing CI timeouts. You can unblock any venue if their website is back online."}
            </p>
          </div>
        </div>

        {/* Run Report KPI Summary */}
        <div className="admin-blocklist-kpis">
          <div className="admin-blocklist-kpi-card">
            <span className="admin-blocklist-kpi-label">
              <Clock size={14} weight="bold" /> {lang === "sv" ? "Senaste körning" : "Latest Run"}
            </span>
            <b className="admin-blocklist-kpi-val">
              {runReport?.timestamp
                ? new Date(runReport.timestamp).toLocaleString(locale, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "–"}
            </b>
            <small className="admin-blocklist-kpi-sub">
              {runReport ? `${runReport.durationSeconds}s · ${runReport.status}` : "Ingen körning registrerad"}
            </small>
          </div>

          <div className="admin-blocklist-kpi-card">
            <span className="admin-blocklist-kpi-label">
              <CheckCircle size={14} weight="bold" className="text-success" /> {lang === "sv" ? "Lyckade skrapningar" : "Successful Scrapes"}
            </span>
            <b className="admin-blocklist-kpi-val text-success">
              {runSummary?.successfulScrapes?.toLocaleString(locale) ?? "0"}
            </b>
            <small className="admin-blocklist-kpi-sub">
              {lang === "sv"
                ? `av ${runSummary?.totalVenuesChecked ?? 0} undersökta ställen`
                : `of ${runSummary?.totalVenuesChecked ?? 0} checked venues`}
            </small>
          </div>

          <div className="admin-blocklist-kpi-card">
            <span className="admin-blocklist-kpi-label">
              <ShieldWarning size={14} weight="bold" className="text-warning" /> {lang === "sv" ? "Skippade (Blockerade)" : "Skipped (Blocked)"}
            </span>
            <b className="admin-blocklist-kpi-val text-warning">
              {runSummary?.skippedBlockedUrls?.toLocaleString(locale) ?? "0"}
            </b>
            <small className="admin-blocklist-kpi-sub">
              {lang === "sv" ? "onödiga förfrågningar undveks" : "redundant requests avoided"}
            </small>
          </div>

          <div className="admin-blocklist-kpi-card">
            <span className="admin-blocklist-kpi-label">
              <Prohibit size={14} weight="bold" className="text-danger" /> {lang === "sv" ? "Totalt i blockeringslistan" : "Total Blocklisted"}
            </span>
            <b className="admin-blocklist-kpi-val text-danger">
              {blocklist.length.toLocaleString(locale)}
            </b>
            <small className="admin-blocklist-kpi-sub">
              {lang === "sv"
                ? `${runSummary?.newlyBlockedUrls ?? 0} nya i senaste körningen`
                : `${runSummary?.newlyBlockedUrls ?? 0} added in last run`}
            </small>
          </div>
        </div>

        {/* Toolbar & Filter Pills */}
        <div className="admin-blocklist-toolbar">
          <div className="admin-blocklist-search">
            <MagnifyingGlass size={15} className="admin-blocklist-search-icon" />
            <input
              type="text"
              className="admin-blocklist-input"
              placeholder={lang === "sv" ? "Sök ställe, domän eller URL…" : "Search venue, domain or URL…"}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={lang === "sv" ? "Sök i blockeringslistan" : "Search blocklist"}
            />
            {searchQuery ? (
              <button
                type="button"
                className="admin-blocklist-clear"
                onClick={() => setSearchQuery("")}
                title={lang === "sv" ? "Rensa sökning" : "Clear search"}
              >
                ✕
              </button>
            ) : null}
          </div>

          <div className="admin-blocklist-filters" role="group" aria-label="Error filters">
            <button
              type="button"
              className={`admin-blocklist-filter-btn ${errorFilter === "all" ? "active" : ""}`}
              onClick={() => setErrorFilter("all")}
            >
              {lang === "sv" ? "Alla" : "All"} ({blocklist.length})
            </button>
            <button
              type="button"
              className={`admin-blocklist-filter-btn ${errorFilter === "404" ? "active" : ""}`}
              onClick={() => setErrorFilter("404")}
            >
              404 Not Found
            </button>
            <button
              type="button"
              className={`admin-blocklist-filter-btn ${errorFilter === "403_500" ? "active" : ""}`}
              onClick={() => setErrorFilter("403_500")}
            >
              403 / 500
            </button>
            <button
              type="button"
              className={`admin-blocklist-filter-btn ${errorFilter === "timeout_network" ? "active" : ""}`}
              onClick={() => setErrorFilter("timeout_network")}
            >
              Timeout / Network
            </button>
          </div>
        </div>

        {/* Blocked URLs Table */}
        {filteredBlocklist.length === 0 ? (
          <div className="admin-blocklist-empty">
            <CheckCircle size={32} weight="duotone" className="admin-blocklist-empty-icon" />
            <p>
              {searchQuery || errorFilter !== "all"
                ? lang === "sv"
                  ? "Inga blockerade webbadresser matchar din filtrering."
                  : "No blocklisted URLs match your filter."
                : lang === "sv"
                  ? "Inga blockerade webbadresser just nu. Alla skrapningar lyckades eller kön är ren!"
                  : "No blocklisted URLs right now. All scrapings succeeded or queue is clear!"}
            </p>
          </div>
        ) : (
          <div className="admin-blocklist-table-container">
            <table className="admin-blocklist-table">
              <thead>
                <tr>
                  <th>{lang === "sv" ? "Ställe / ID" : "Venue / ID"}</th>
                  <th>{lang === "sv" ? "Webbadress" : "URL"}</th>
                  <th>{lang === "sv" ? "Feltyp & Anledning" : "Error Type & Reason"}</th>
                  <th>{lang === "sv" ? "Senast misslyckad" : "Last Failed"}</th>
                  <th className="th-action">{lang === "sv" ? "Åtgärd" : "Action"}</th>
                </tr>
              </thead>
              <tbody>
                {filteredBlocklist.slice(0, 100).map((item) => {
                  const isUnblocking = unblockingUrl === item.url;
                  const errType = item.errorType || "Error";
                  const badgeClass =
                    errType.includes("404")
                      ? "badge-404"
                      : errType.includes("Timeout")
                        ? "badge-timeout"
                        : errType.includes("403") || errType.includes("500")
                          ? "badge-server"
                          : "badge-net";

                  return (
                    <tr key={item.url}>
                      <td className="td-venue">
                        <b>{item.placeName || (lang === "sv" ? "Okänt ställe" : "Unknown venue")}</b>
                        {item.placeId ? <span className="admin-blocklist-pid">#{item.placeId}</span> : null}
                      </td>
                      <td className="td-url">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="admin-blocklist-link"
                          title={item.url}
                        >
                          <span className="admin-blocklist-url-text">{item.url}</span>
                          <ArrowSquareOut size={13} />
                        </a>
                      </td>
                      <td className="td-error">
                        <span className={`admin-blocklist-badge ${badgeClass}`}>{errType}</span>
                        {item.errorMessage ? (
                          <span className="admin-blocklist-err-msg">{item.errorMessage}</span>
                        ) : null}
                      </td>
                      <td className="td-date">
                        <span>
                          {item.lastFailedAt
                            ? new Date(item.lastFailedAt).toLocaleDateString(locale, {
                                month: "short",
                                day: "numeric",
                              })
                            : "–"}
                        </span>
                        {(item.failCount ?? 1) > 1 ? (
                          <span className="admin-blocklist-fail-pill" title={`${item.failCount} failures`}>
                            {item.failCount}x
                          </span>
                        ) : null}
                      </td>
                      <td className="td-action">
                        <button
                          type="button"
                          className="admin-blocklist-unblock-btn"
                          onClick={() => void handleUnblockUrl(item.url)}
                          disabled={isUnblocking}
                          title={lang === "sv" ? "Ta bort från blockeringslista och tillåt skrapning" : "Unblock URL and re-allow scraping"}
                        >
                          {isUnblocking ? (
                            <CircleNotch size={13} className="animate-spin" />
                          ) : (
                            <Trash size={13} />
                          )}
                          {lang === "sv" ? "Avblockera" : "Unblock"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredBlocklist.length > 100 ? (
              <div className="admin-blocklist-footer-hint">
                {lang === "sv"
                  ? `Visar 100 av ${filteredBlocklist.length} blockerade webbadresser. Använd sökfältet ovan för att filtrera.`
                  : `Showing 100 of ${filteredBlocklist.length} blocked URLs. Use the search box above to narrow down.`}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
