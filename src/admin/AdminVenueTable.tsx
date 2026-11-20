import { useMemo, useState } from "react";
import type { Language } from "../app/shared";
import {
  ArrowsDownUp,
  ArrowUp,
  ArrowDown,
  Funnel,
  PencilSimple,
  Scales,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";

export type AdminVenueTableRow = {
  id: number;
  name: string;
  kind: string;
  cuisine?: string;
  area: string;
  address: string | null;
  website: string | null;
  lifecycleState: string;
  validationLabel?: string | null;
  candidateSourceType: string | null;
  latestEvidenceAt: string | null;
  updatedAt: string | null;
  evidenceCount: number;
  evidenceSourceTypes: string[];
  evidenceGate: {
    independentEvidenceCount: number;
    canPromoteHiddenGem: boolean;
    hasCurrentExistence: boolean;
    sourceGaps: string[];
  };
  possibleDuplicateCount: number;
};

type SortKey = "name" | "status" | "confidence" | "source" | "freshness" | "conflicts";
type SortDirection = "ascending" | "descending";
type ConfidenceFilter = "all" | "high" | "medium" | "low";
type FreshnessFilter = "all" | "fresh" | "stale" | "unknown";
type IssueFilter = "all" | "duplicates" | "missing" | "publication";

type AdminVenueTableProps<T extends AdminVenueTableRow> = {
  candidates: T[];
  lang: Language;
  busyId?: number | null;
  selectedCandidateId?: number | null;
  onSelectCandidate: (candidate: T) => void;
  onOpenReview: (candidate: T) => void;
  onEditCandidate: (candidate: T) => void;
  onToggleRemoved?: (candidate: T) => void;
};

export function AdminVenueTable<T extends AdminVenueTableRow>({
  candidates,
  lang,
  busyId,
  selectedCandidateId,
  onSelectCandidate,
  onOpenReview,
  onEditCandidate,
  onToggleRemoved,
}: AdminVenueTableProps<T>) {
  const [sortKey, setSortKey] = useState<SortKey>("conflicts");
  const [sortDirection, setSortDirection] = useState<SortDirection>("descending");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>("all");
  const [freshnessFilter, setFreshnessFilter] = useState<FreshnessFilter>("all");
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("all");

  const sourceOptions = useMemo(
    () => Array.from(new Set(candidates.map((candidate) => candidate.candidateSourceType).filter(Boolean) as string[])).sort(),
    [candidates],
  );

  const visibleCandidates = useMemo(() => {
    const filtered = candidates.filter((candidate) => {
      const confidence = venueConfidence(candidate);
      const freshness = venueFreshness(candidate);
      const hasMissingData = candidate.evidenceGate.sourceGaps.length > 0
        || !candidate.address
        || !candidate.cuisine
        || !candidate.website;
      const hasPublicationIssue = Boolean(candidate.validationLabel)
        || candidate.lifecycleState === "candidate";

      if (sourceFilter !== "all" && candidate.candidateSourceType !== sourceFilter) return false;
      if (confidenceFilter !== "all" && confidence.level !== confidenceFilter) return false;
      if (freshnessFilter !== "all" && freshness.state !== freshnessFilter) return false;
      if (issueFilter === "duplicates" && candidate.possibleDuplicateCount === 0) return false;
      if (issueFilter === "missing" && !hasMissingData) return false;
      if (issueFilter === "publication" && !hasPublicationIssue) return false;
      return true;
    });

    return filtered.toSorted((left, right) => {
      const comparison = compareVenueRows(left, right, sortKey);
      return sortDirection === "ascending" ? comparison : comparison * -1;
    });
  }, [candidates, confidenceFilter, freshnessFilter, issueFilter, sortDirection, sortKey, sourceFilter]);

  const activeFilterCount = [sourceFilter, confidenceFilter, freshnessFilter, issueFilter]
    .filter((value) => value !== "all").length;

  const updateSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === "ascending" ? "descending" : "ascending");
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "name" ? "ascending" : "descending");
  };

  const clearFilters = () => {
    setSourceFilter("all");
    setConfidenceFilter("all");
    setFreshnessFilter("all");
    setIssueFilter("all");
  };

  return (
    <section className="admin-venue-table-section" id="admin-venue-table" aria-labelledby="admin-venue-table-title">
      <div className="admin-venue-table-heading">
        <div>
          <h3 id="admin-venue-table-title">{lang === "sv" ? "Platsregister" : "Venue registry"}</h3>
          <p>
            {lang === "sv"
              ? "Jämför status, proveniens, evidensstyrka, aktualitet och konflikter. Evidensstyrka är inte ett kvalitetsbetyg."
              : "Compare status, provenance, evidence confidence, freshness and conflicts. Evidence confidence is not a quality rating."}
          </p>
        </div>
        <div className="admin-venue-table-summary" aria-live="polite">
          <span>{visibleCandidates.length.toLocaleString(lang === "sv" ? "sv-SE" : "en-US")}</span>
          <small>{lang === "sv" ? "synliga poster" : "visible records"}</small>
        </div>
      </div>

      <div className="admin-advanced-filters" role="group" aria-labelledby="admin-advanced-filter-title">
        <span className="admin-advanced-filter-label" id="admin-advanced-filter-title">
          <Funnel size={14} weight="bold" />
          {lang === "sv" ? "Avancerade filter" : "Advanced filters"}
          {activeFilterCount > 0 ? <b>{activeFilterCount}</b> : null}
        </span>
        <label>
          <span>{lang === "sv" ? "Källa" : "Source"}</span>
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
            <option value="all">{lang === "sv" ? "Alla källor" : "All sources"}</option>
            {sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}
          </select>
        </label>
        <label>
          <span>{lang === "sv" ? "Evidensstyrka" : "Confidence"}</span>
          <select value={confidenceFilter} onChange={(event) => setConfidenceFilter(event.target.value as ConfidenceFilter)}>
            <option value="all">{lang === "sv" ? "Alla nivåer" : "All levels"}</option>
            <option value="high">{lang === "sv" ? "Hög" : "High"}</option>
            <option value="medium">{lang === "sv" ? "Medel" : "Medium"}</option>
            <option value="low">{lang === "sv" ? "Låg" : "Low"}</option>
          </select>
        </label>
        <label>
          <span>{lang === "sv" ? "Aktualitet" : "Freshness"}</span>
          <select value={freshnessFilter} onChange={(event) => setFreshnessFilter(event.target.value as FreshnessFilter)}>
            <option value="all">{lang === "sv" ? "Alla datum" : "Any freshness"}</option>
            <option value="fresh">{lang === "sv" ? "≤ 90 dagar" : "≤ 90 days"}</option>
            <option value="stale">{lang === "sv" ? "Inaktuell" : "Stale"}</option>
            <option value="unknown">{lang === "sv" ? "Okänd" : "Unknown"}</option>
          </select>
        </label>
        <label>
          <span>{lang === "sv" ? "Åtgärdsbehov" : "Issue"}</span>
          <select value={issueFilter} onChange={(event) => setIssueFilter(event.target.value as IssueFilter)}>
            <option value="all">{lang === "sv" ? "Alla poster" : "All records"}</option>
            <option value="duplicates">{lang === "sv" ? "Möjliga dubbletter" : "Possible duplicates"}</option>
            <option value="missing">{lang === "sv" ? "Saknade uppgifter" : "Missing data"}</option>
            <option value="publication">{lang === "sv" ? "Publiceringsbeslut" : "Publication decision"}</option>
          </select>
        </label>
        <button type="button" className="admin-filter-reset" onClick={clearFilters} disabled={activeFilterCount === 0}>
          {lang === "sv" ? "Rensa" : "Clear"}
        </button>
      </div>

      <div
        className="admin-venue-table-scroll"
        role="region"
        tabIndex={0}
        aria-label={lang === "sv" ? "Sorterbar tabell över platser" : "Sortable venue table"}
      >
        <table className="admin-venue-table">
          <caption className="sr-only">
            {lang === "sv" ? "Platsregister med proveniens och datakvalitet" : "Venue registry with provenance and data quality"}
          </caption>
          <thead>
            <tr>
              <SortableHeading label={lang === "sv" ? "Plats" : "Venue"} column="name" activeKey={sortKey} direction={sortDirection} onSort={updateSort} />
              <SortableHeading label="Status" column="status" activeKey={sortKey} direction={sortDirection} onSort={updateSort} />
              <SortableHeading label={lang === "sv" ? "Evidensstyrka" : "Confidence"} column="confidence" activeKey={sortKey} direction={sortDirection} onSort={updateSort} />
              <SortableHeading label={lang === "sv" ? "Proveniens" : "Provenance"} column="source" activeKey={sortKey} direction={sortDirection} onSort={updateSort} />
              <SortableHeading label={lang === "sv" ? "Aktualitet" : "Freshness"} column="freshness" activeKey={sortKey} direction={sortDirection} onSort={updateSort} />
              <SortableHeading label={lang === "sv" ? "Konflikter" : "Conflicts"} column="conflicts" activeKey={sortKey} direction={sortDirection} onSort={updateSort} />
              <th scope="col" className="admin-table-action-heading">{lang === "sv" ? "Åtgärd" : "Action"}</th>
            </tr>
          </thead>
          <tbody>
            {visibleCandidates.map((candidate) => {
              const confidence = venueConfidence(candidate);
              const freshness = venueFreshness(candidate, lang);
              const selected = candidate.id === selectedCandidateId;
              const isRemoved = candidate.validationLabel === "closed_wrong_category";
              return (
                <tr key={candidate.id} className={`admin-venue-table-row${selected ? " is-selected" : ""}`} aria-busy={busyId === candidate.id}>
                  <td className="admin-venue-identity-cell">
                    <button
                      type="button"
                      className="admin-venue-name-button"
                      aria-pressed={selected}
                      onClick={() => onSelectCandidate(candidate)}
                    >
                      <span className={`admin-venue-row-mark tone-${rowTone(candidate)}`} aria-hidden="true" />
                      <span>
                        <strong>{candidate.name}</strong>
                        <small>{candidate.kind} · {candidate.area} · #{candidate.id}</small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <span className={`admin-table-status state-${candidate.lifecycleState}`}>
                      {lifecycleLabel(candidate.lifecycleState, lang)}
                    </span>
                    {candidate.validationLabel ? <small className="admin-table-cell-note">{validationLabelText(candidate.validationLabel, lang)}</small> : null}
                  </td>
                  <td>
                    <span className={`admin-confidence-label confidence-${confidence.level}`}>
                      <ShieldCheck size={13} weight="bold" /> {confidenceLabel(confidence.level, lang)}
                    </span>
                    <span className="admin-confidence-meter" aria-hidden="true">
                      <span style={{ width: `${confidence.percent}%` }} />
                    </span>
                    <small className="admin-table-cell-note">
                      {candidate.evidenceGate.independentEvidenceCount} {lang === "sv" ? "oberoende" : "independent"}
                    </small>
                  </td>
                  <td>
                    <strong className="admin-table-source">{candidate.candidateSourceType ?? (lang === "sv" ? "Okänd källa" : "Unknown source")}</strong>
                    <small className="admin-table-cell-note">
                      {candidate.evidenceCount} {lang === "sv" ? "signaler" : "signals"}
                      {candidate.evidenceSourceTypes.length ? ` · ${candidate.evidenceSourceTypes.slice(0, 2).join(" + ")}` : ""}
                    </small>
                  </td>
                  <td>
                    <span className={`admin-freshness-label freshness-${freshness.state}`}>
                      {freshness.days === null
                        ? (lang === "sv" ? "Okänd" : "Unknown")
                        : lang === "sv" ? `${freshness.days} dagar` : `${freshness.days} days`}
                    </span>
                    <small className="admin-table-cell-note">{freshness.dateLabel}</small>
                  </td>
                  <td>
                    {candidate.possibleDuplicateCount > 0 ? (
                      <button type="button" className="admin-conflict-button" onClick={() => onOpenReview(candidate)}>
                        <Scales size={14} weight="bold" />
                        {candidate.possibleDuplicateCount} {lang === "sv" ? "möjliga" : "possible"}
                      </button>
                    ) : candidate.evidenceGate.sourceGaps.length > 0 ? (
                      <span className="admin-gap-count">
                        <WarningCircle size={14} weight="bold" />
                        {candidate.evidenceGate.sourceGaps.length} {lang === "sv" ? "datagap" : "data gaps"}
                      </span>
                    ) : (
                      <span className="admin-no-conflict">{lang === "sv" ? "Inga kända" : "None known"}</span>
                    )}
                  </td>
                  <td>
                    <div className="admin-table-row-actions">
                      <button type="button" className="admin-table-review-btn" onClick={() => onOpenReview(candidate)} disabled={busyId === candidate.id}>
                        {lang === "sv" ? "Granska" : "Review"}
                      </button>
                      <button
                        type="button"
                        className="admin-table-icon-btn"
                        onClick={() => onEditCandidate(candidate)}
                        disabled={busyId === candidate.id}
                        aria-label={lang === "sv" ? `Redigera ${candidate.name}` : `Edit ${candidate.name}`}
                        title={lang === "sv" ? "Redigera plats" : "Edit venue"}
                      >
                        <PencilSimple size={15} weight="bold" />
                      </button>
                      {onToggleRemoved ? (
                        <button
                          type="button"
                          className={`admin-table-remove-btn ${isRemoved ? "is-restore" : ""}`}
                          onClick={() => onToggleRemoved(candidate)}
                          disabled={busyId === candidate.id}
                        >
                          {isRemoved
                            ? (lang === "sv" ? "Återställ" : "Restore")
                            : (lang === "sv" ? "Ta bort från kartan" : "Remove from map")}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {visibleCandidates.length === 0 ? (
        <div className="admin-table-empty" role="status">
          <Funnel size={20} weight="bold" />
          <span>{lang === "sv" ? "Inga platser matchar de avancerade filtren." : "No venues match the advanced filters."}</span>
          <button type="button" onClick={clearFilters}>{lang === "sv" ? "Rensa filter" : "Clear filters"}</button>
        </div>
      ) : null}
    </section>
  );
}

function SortableHeading({
  label,
  column,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  column: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (column: SortKey) => void;
}) {
  const active = column === activeKey;
  return (
    <th scope="col" aria-sort={active ? direction : "none"}>
      <button type="button" className={active ? "is-active" : ""} onClick={() => onSort(column)}>
        {label}
        {active
          ? direction === "ascending" ? <ArrowUp size={12} weight="bold" /> : <ArrowDown size={12} weight="bold" />
          : <ArrowsDownUp size={12} />}
      </button>
    </th>
  );
}

export function venueConfidence(candidate: AdminVenueTableRow) {
  const independent = candidate.evidenceGate.independentEvidenceCount;
  const gaps = candidate.evidenceGate.sourceGaps.length;
  const hasCurrentExistence = candidate.evidenceGate.hasCurrentExistence;
  if (independent >= 3 && gaps === 0 && hasCurrentExistence) return { level: "high" as const, percent: 92 };
  if (independent >= 2 && hasCurrentExistence) return { level: "medium" as const, percent: 68 };
  return { level: "low" as const, percent: 34 };
}

export function venueFreshness(candidate: AdminVenueTableRow, lang: Language = "en") {
  const rawDate = candidate.latestEvidenceAt ?? candidate.updatedAt;
  if (!rawDate) return { days: null, state: "unknown" as const, timestamp: Number.NEGATIVE_INFINITY, dateLabel: "—" };
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return { days: null, state: "unknown" as const, timestamp: Number.NEGATIVE_INFINITY, dateLabel: "—" };
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
  return {
    days,
    state: days <= 90 ? "fresh" as const : "stale" as const,
    timestamp: date.getTime(),
    dateLabel: new Intl.DateTimeFormat(lang === "sv" ? "sv-SE" : "en-GB", { dateStyle: "medium" }).format(date),
  };
}

function compareVenueRows(left: AdminVenueTableRow, right: AdminVenueTableRow, sortKey: SortKey) {
  if (sortKey === "name") return left.name.localeCompare(right.name, "sv");
  if (sortKey === "status") return left.lifecycleState.localeCompare(right.lifecycleState, "sv");
  if (sortKey === "confidence") return venueConfidence(left).percent - venueConfidence(right).percent;
  if (sortKey === "source") return String(left.candidateSourceType ?? "").localeCompare(String(right.candidateSourceType ?? ""), "sv");
  if (sortKey === "freshness") return venueFreshness(left).timestamp - venueFreshness(right).timestamp;
  return left.possibleDuplicateCount - right.possibleDuplicateCount;
}

function confidenceLabel(level: "high" | "medium" | "low", lang: Language) {
  if (level === "high") return lang === "sv" ? "Hög" : "High";
  if (level === "medium") return lang === "sv" ? "Medel" : "Medium";
  return lang === "sv" ? "Låg" : "Low";
}

function lifecycleLabel(state: string, lang: Language) {
  const labels: Record<string, [string, string]> = {
    candidate: ["Kandidat", "Candidate"],
    baseline: ["Baslinje", "Baseline"],
    verified: ["Verifierad", "Verified"],
    featured: ["Utvald", "Featured"],
  };
  const pair = labels[state];
  return pair ? pair[lang === "sv" ? 0 : 1] : state.replaceAll("_", " ");
}

function validationLabelText(label: string, lang: Language) {
  const labels: Record<string, { sv: string; en: string }> = {
    known_mainstream: { sv: "Känd mainstream", en: "Known mainstream" },
    known_hidden_gem: { sv: "Känd dold pärla", en: "Known hidden gem" },
    not_enough_evidence: { sv: "Otillräckliga belägg", en: "Not enough evidence" },
    closed_wrong_category: { sv: "Stängd/fel kategori", en: "Closed/wrong category" },
  };
  return labels[label]?.[lang] ?? label.replaceAll("_", " ");
}

function rowTone(candidate: AdminVenueTableRow) {
  if (candidate.possibleDuplicateCount > 0 || candidate.validationLabel) return "risk";
  if (candidate.lifecycleState === "verified" || candidate.lifecycleState === "featured") return "verified";
  return "neutral";
}
