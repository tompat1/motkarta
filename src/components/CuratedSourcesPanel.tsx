import type { CuratedSource, Language } from "../app/shared";
import {
  curatedSourceTypeLabels,
  formatScrapeDate,
  localizedCuratedSource,
} from "../app/shared";
import { ArrowSquareOut, CircleNotch, PlusCircle } from "@phosphor-icons/react";

export function CuratedSourcesPanel({
  sources,
  isLoading,
  lang,
  onAddSource,
}: {
  sources: CuratedSource[];
  isLoading?: boolean;
  lang: Language;
  onAddSource?: () => void;
}) {
  const copy =
    lang === "sv"
      ? {
          kicker: "Källregister",
          title: "Kurerade öppna källor & Skraparstatus",
          description:
            "Auditerbara datakällor och verifierade guider som driver Motkartas ranking, med tidpunkt för senaste skrapning och antal insamlade datapunkter.",
          addSource: "Lägg till ny källa",
          syncing: "D1-sync...",
          submitted: "Inskickad källa",
          dataPoints: "datapunkter",
          lastScraped: "Senaste skrapning",
          scanned: "Skannat / Insamlat",
          imported: "Importerat till kartan",
        }
      : {
          kicker: "Source registry",
          title: "Curated open sources & Scraper status",
          description:
            "Auditable data sources and verified guides powering Motkarta's ranking, with last scrape timestamp and total collected data points.",
          addSource: "Add new source",
          syncing: "D1 sync...",
          submitted: "Submitted source",
          dataPoints: "data points",
          lastScraped: "Last scraped",
          scanned: "Scanned / Collected",
          imported: "Imported to map",
        };

  return (
    <section className="admin-curated-sources-panel" id="sources" aria-labelledby="sources-title">
      <div className="admin-curated-sources-head">
        <div>
          <h2 id="sources-title">
            📜 {copy.title} ({sources.length})
          </h2>
          <p>{copy.description}</p>
        </div>
        {onAddSource ? (
          <button type="button" className="admin-source-add-btn" onClick={onAddSource}>
            <PlusCircle size={15} weight="bold" /> {copy.addSource}
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <p className="admin-source-sync" aria-live="polite">
          <CircleNotch size={13} className="animate-spin" /> {copy.syncing}
        </p>
      ) : null}

      <div className="admin-sources-grid">
        {sources.map((source) => {
          const displaySource = localizedCuratedSource(source, lang);
          const scrapedCount = displaySource.scrapedPoints ?? displaySource.verifiedCount ?? 0;
          const importedCount = displaySource.importedCount ?? displaySource.verifiedCount ?? 0;

          return (
            <article className="admin-source-card" key={source.id}>
              <div>
                <div className="admin-source-card-topline">
                  <span className="admin-source-badge">
                    <span className="admin-source-dot" aria-hidden="true" />
                    {curatedSourceTypeLabels[lang][source.type]}
                  </span>
                  {source.addedByUser ? <span className="admin-source-user-tag">{copy.submitted}</span> : null}
                </div>
                <h3>
                  <a href={displaySource.url} target="_blank" rel="noopener noreferrer">
                    {displaySource.name} <ArrowSquareOut size={13} />
                  </a>
                </h3>
                <p>{displaySource.description}</p>
              </div>

              <div className="admin-source-scrape-stats">
                <div className="admin-source-scrape-row">
                  <span>🕒 {copy.lastScraped}:</span>
                  <b>{formatScrapeDate(displaySource.lastScrapedAt, lang)}</b>
                </div>
                <div className="admin-source-scrape-row">
                  <span>📦 {copy.scanned}:</span>
                  <b>{scrapedCount.toLocaleString(lang === "sv" ? "sv-SE" : "en-US")} {copy.dataPoints}</b>
                </div>
                <div className="admin-source-scrape-row">
                  <span>📥 {copy.imported}:</span>
                  <b>
                    {importedCount.toLocaleString(lang === "sv" ? "sv-SE" : "en-US")}{" "}
                    {lang === "sv" ? "ställen" : "places"}
                    {displaySource.coveragePercent ? ` (${displaySource.coveragePercent}%)` : ""}
                  </b>
                </div>
              </div>

              <div className="admin-source-meta">
                <span>📜 {displaySource.license}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
