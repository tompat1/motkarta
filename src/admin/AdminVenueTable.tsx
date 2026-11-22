import { useEffect, useMemo, useRef, useState } from "react";
import type { Language } from "../app/shared";
import {
  ArrowsDownUp,
  ArrowUp,
  ArrowDown,
  CircleNotch,
  Funnel,
  PencilSimple,
  Pulse,
  Scales,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import type { VenueStatusCheckResult } from "../../lib/venue-status-check";

export type AdminVenueTableRow = {
  id: number;
  name: string;
  kind: string;
  cuisine?: string;
  area: string;
  address: string | null;
  website: string | null;
  latitude?: number | null;
  longitude?: number | null;
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
  onConfirmCandidate?: (candidate: T) => void;
  onBulkConfirmCandidates?: (candidates: T[]) => void;
  onBulkDismissCandidates?: (candidates: T[]) => void;
  bulkBusy?: boolean;
  statusChecks?: Record<number, VenueStatusCheckResult>;
  checkingStatusIds?: Set<number>;
  onCheckStatus?: (candidates: T[]) => void;
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
  onConfirmCandidate,
  onBulkConfirmCandidates,
  onBulkDismissCandidates,
  bulkBusy = false,
  statusChecks,
  checkingStatusIds,
  onCheckStatus,
  onToggleRemoved,
}: AdminVenueTableProps<T>) {
  const [sortKey, setSortKey] = useState<SortKey>("conflicts");
  const [sortDirection, setSortDirection] = useState<SortDirection>("descending");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>("all");
  const [freshnessFilter, setFreshnessFilter] = useState<FreshnessFilter>("all");
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const lastClickedIndexRef = useRef<number | null>(null);
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);

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

  const visibleIdSet = useMemo(() => new Set(visibleCandidates.map((c) => c.id)), [visibleCandidates]);
  const selectedVisibleCandidates = useMemo(
    () => visibleCandidates.filter((c) => selectedIds.has(c.id)),
    [visibleCandidates, selectedIds],
  );
  const selectedConfirmableCandidates = useMemo(
    () => selectedVisibleCandidates.filter((c) => c.validationLabel !== "closed_wrong_category" && c.lifecycleState === "candidate"),
    [selectedVisibleCandidates],
  );
  const allVisibleSelected = visibleCandidates.length > 0 && selectedVisibleCandidates.length === visibleCandidates.length;
  const someVisibleSelected = selectedVisibleCandidates.length > 0 && !allVisibleSelected;

  useEffect(() => {
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<number>();
      prev.forEach((id) => {
        if (visibleIdSet.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [visibleIdSet]);

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleCandidates.map((c) => c.id)));
    }
  };

  const toggleRowSelection = (id: number, index: number, shiftKey: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClickedIndexRef.current !== null) {
        const start = Math.min(lastClickedIndexRef.current, index);
        const end = Math.max(lastClickedIndexRef.current, index);
        const shouldSelect = !prev.has(id);
        for (let i = start; i <= end; i += 1) {
          const row = visibleCandidates[i];
          if (!row) continue;
          if (shouldSelect) next.add(row.id);
          else next.delete(row.id);
        }
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastClickedIndexRef.current = index;
  };

  const showSelectionColumn = Boolean(onBulkConfirmCandidates || onBulkDismissCandidates);

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

      {showSelectionColumn && selectedVisibleCandidates.length > 0 ? (
        <div className="admin-table-bulk-bar" role="region" aria-label={lang === "sv" ? "Massåtgärder" : "Bulk actions"}>
          <span className="admin-table-bulk-count">
            {lang === "sv"
              ? `${selectedVisibleCandidates.length} valda`
              : `${selectedVisibleCandidates.length} selected`}
          </span>
          <div className="admin-table-bulk-actions">
            {onBulkConfirmCandidates && selectedConfirmableCandidates.length > 0 ? (
              <button
                type="button"
                className="admin-table-confirm-btn"
                disabled={bulkBusy}
                onClick={() => onBulkConfirmCandidates(selectedConfirmableCandidates)}
              >
                {bulkBusy
                  ? (lang === "sv" ? "Bekräftar…" : "Confirming…")
                  : lang === "sv"
                    ? `Bekräfta valda (${selectedConfirmableCandidates.length})`
                    : `Confirm selected (${selectedConfirmableCandidates.length})`}
              </button>
            ) : null}
            {onCheckStatus ? (
              <button
                type="button"
                className="admin-table-check-btn"
                disabled={bulkBusy || selectedVisibleCandidates.some((c) => checkingStatusIds?.has(c.id))}
                onClick={() => onCheckStatus(selectedVisibleCandidates)}
              >
                <Pulse size={14} weight="bold" />
                {lang === "sv"
                  ? `Kolla öppet/stängt (${selectedVisibleCandidates.length})`
                  : `Check open/closed (${selectedVisibleCandidates.length})`}
              </button>
            ) : null}
            {onBulkDismissCandidates ? (
              <button
                type="button"
                className="admin-table-remove-btn"
                disabled={bulkBusy}
                onClick={() => onBulkDismissCandidates(selectedVisibleCandidates)}
              >
                {lang === "sv"
                  ? `Avvisa valda (${selectedVisibleCandidates.length})`
                  : `Dismiss selected (${selectedVisibleCandidates.length})`}
              </button>
            ) : null}
            <button
              type="button"
              className="admin-filter-reset"
              disabled={bulkBusy}
              onClick={() => setSelectedIds(new Set())}
            >
              {lang === "sv" ? "Rensa val" : "Clear selection"}
            </button>
          </div>
        </div>
      ) : null}

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
              {showSelectionColumn ? (
                <th scope="col" className="admin-table-select-col">
                  <input
                    ref={selectAllCheckboxRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    aria-label={lang === "sv" ? "Markera alla synliga platser" : "Select all visible places"}
                    title={lang === "sv" ? "Markera / avmarkera alla synliga" : "Select / deselect all visible"}
                  />
                </th>
              ) : null}
              <SortableHeading
                label={lang === "sv" ? "Plats" : "Venue"}
                tooltip={
                  lang === "sv"
                    ? "Ställets namn, kategori, stadsdel och interna ID. Klicka för att sortera."
                    : "Venue name, category, district, and internal ID. Click to sort."
                }
                column="name"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={updateSort}
              />
              <SortableHeading
                label="Status"
                tooltip={
                  lang === "sv"
                    ? "Livscykelstatus (Kandidat, Baseline, Verifierad, Utvald) och eventuell granskningsetikett."
                    : "Lifecycle state (Candidate, Baseline, Verified, Featured) and any review label."
                }
                column="status"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={updateSort}
              />
              <SortableHeading
                label={lang === "sv" ? "Evidensstyrka" : "Confidence"}
                tooltip={
                  lang === "sv"
                    ? "Antal oberoende källor och aktuell existenssignal. Hög (3+), Medel (2+), Låg (<2)."
                    : "Independent evidence sources and current existence signal. High (3+), Medium (2+), Low (<2)."
                }
                column="confidence"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={updateSort}
              />
              <SortableHeading
                label={lang === "sv" ? "Proveniens" : "Provenance"}
                tooltip={
                  lang === "sv"
                    ? "Ursprungskälla (OSM, livsmedelskontroll, kuraterad guide) och totalt antal inkomna signaler."
                    : "Originating data source (OSM, inspection, curated guide) and total signal count."
                }
                column="source"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={updateSort}
              />
              <SortableHeading
                label={lang === "sv" ? "Aktualitet" : "Freshness"}
                tooltip={
                  lang === "sv"
                    ? "Antal dagar sedan senaste verifierade signalen eller uppdateringen av posten."
                    : "Days since the most recent verified evidence signal or record update."
                }
                column="freshness"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={updateSort}
              />
              <SortableHeading
                label={lang === "sv" ? "Konflikter" : "Conflicts"}
                tooltip={
                  lang === "sv"
                    ? "Antal möjliga dubbletter (namn, adress eller närhet). Öppna granskning för att slå ihop eller behålla."
                    : "Possible duplicate matches (name, address, or proximity). Open review to merge or keep separate."
                }
                column="conflicts"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={updateSort}
              />
              <th scope="col" className="admin-table-action-heading">{lang === "sv" ? "Åtgärd" : "Action"}</th>
            </tr>
          </thead>
          <tbody>
            {visibleCandidates.map((candidate, rowIndex) => {
              const confidence = venueConfidence(candidate);
              const freshness = venueFreshness(candidate, lang);
              const selected = candidate.id === selectedCandidateId;
              const isChecked = selectedIds.has(candidate.id);
              const isRemoved = candidate.validationLabel === "closed_wrong_category";
              const isNotOnMapYet = !isRemoved && (candidate.lifecycleState === "candidate" || candidate.latitude == null || candidate.longitude == null);
              const isAlert = rowTone(candidate) === "risk";
              return (
                <tr key={candidate.id} className={`admin-venue-table-row${selected || isChecked ? " is-selected" : ""}${isAlert ? " is-alert" : ""}`} aria-busy={busyId === candidate.id || bulkBusy}>
                  {showSelectionColumn ? (
                    <td className="admin-table-select-col">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={bulkBusy}
                        onChange={(e) => toggleRowSelection(candidate.id, rowIndex, (e.nativeEvent as MouseEvent).shiftKey)}
                        aria-label={lang === "sv" ? `Välj ${candidate.name}` : `Select ${candidate.name}`}
                      />
                    </td>
                  ) : null}
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
                    {!isRemoved && (candidate.lifecycleState === "candidate" || candidate.latitude == null || candidate.longitude == null) ? (
                      <small className="admin-table-cell-note admin-not-on-map-note">
                        {lang === "sv" ? "Ej på kartan" : "Not on map"}
                      </small>
                    ) : null}
                    {statusChecks?.[candidate.id] ? (
                      <span
                        className={`admin-live-status-badge is-${statusChecks[candidate.id].status}`}
                        title={statusChecks[candidate.id].summary}
                      >
                        {operationalStatusLabel(statusChecks[candidate.id].status, lang)}
                      </span>
                    ) : null}
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
                      {!isRemoved && candidate.lifecycleState === "candidate" && onConfirmCandidate ? (
                        <button
                          type="button"
                          className="admin-table-confirm-btn"
                          onClick={() => onConfirmCandidate(candidate)}
                          disabled={busyId === candidate.id}
                        >
                          {lang === "sv" ? "Bekräfta" : "Confirm"}
                        </button>
                      ) : null}
                      <button type="button" className="admin-table-review-btn" onClick={() => onOpenReview(candidate)} disabled={busyId === candidate.id}>
                        {lang === "sv" ? "Granska" : "Review"}
                      </button>
                      {onCheckStatus ? (
                        <button
                          type="button"
                          className="admin-table-icon-btn"
                          onClick={() => onCheckStatus([candidate])}
                          disabled={busyId === candidate.id || bulkBusy || checkingStatusIds?.has(candidate.id)}
                          aria-label={lang === "sv" ? `Kolla om ${candidate.name} är öppet eller stängt` : `Check if ${candidate.name} is open or closed`}
                          title={lang === "sv" ? "Kolla öppet/stängt (hemsida + OSM + Google)" : "Check open/closed (website + OSM + Google)"}
                        >
                          {checkingStatusIds?.has(candidate.id) ? (
                            <CircleNotch size={15} weight="bold" className="animate-spin" />
                          ) : (
                            <Pulse size={15} weight="bold" />
                          )}
                        </button>
                      ) : null}
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
                          className={`admin-table-remove-btn ${isRemoved ? "is-restore" : ""} ${isNotOnMapYet ? "is-not-on-map" : ""}`}
                          onClick={() => onToggleRemoved(candidate)}
                          disabled={busyId === candidate.id || bulkBusy || isNotOnMapYet}
                          title={
                            isNotOnMapYet
                              ? lang === "sv"
                                ? "Inte på kartan ännu — bekräfta först för att publicera på kartan"
                                : "Not on map yet — confirm first to publish on the map"
                              : undefined
                          }
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
  tooltip,
  column,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  tooltip: string;
  column: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (column: SortKey) => void;
}) {
  const active = column === activeKey;
  const tooltipId = `admin-col-tooltip-${column}`;
  return (
    <th scope="col" aria-sort={active ? direction : "none"} className="admin-th-with-tooltip">
      <button type="button" className={active ? "is-active" : ""} aria-describedby={tooltipId} onClick={() => onSort(column)}>
        {label}
        {active
          ? direction === "ascending" ? <ArrowUp size={12} weight="bold" /> : <ArrowDown size={12} weight="bold" />
          : <ArrowsDownUp size={12} />}
      </button>
      <span id={tooltipId} role="tooltip" className="admin-th-tooltip">
        {tooltip}
      </span>
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

function operationalStatusLabel(status: VenueStatusCheckResult["status"], lang: Language): string {
  const labels: Record<VenueStatusCheckResult["status"], [string, string]> = {
    open: ["Öppet", "Open"],
    temporarily_closed: ["Tillf. stängt", "Temp. closed"],
    permanently_closed: ["Permanent stängt", "Permanently closed"],
    website_down: ["Hemsida nere", "Website down"],
    unknown: ["Okänd status", "Unknown"],
  };
  return labels[status][lang === "sv" ? 0 : 1];
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
