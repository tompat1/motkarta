import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import React, { useEffect, useRef, useState } from "react";
import type { Language } from "../app/shared";
import { STOCKHOLM_REGIONS as STOCKHOLM_REGION_NAMES, isBroadStockholmArea } from "../../lib/stockholm-regions";
import {
  ArrowsIn,
  CheckCircle,
  CheckSquareOffset,
  CircleNotch,
  Crosshair,
  Eye,
  Globe,
  MapPin,
  Minus,
  Plus,
  Sparkle,
  Warning,
} from "@phosphor-icons/react";

export type AdminMapCandidate = {
  id: number;
  name: string;
  kind: string;
  area: string;
  address: string | null;
  website: string | null;
  latitude?: number | null;
  longitude?: number | null;
  lifecycleState: string;
  validationLabel?: string | null;
  validationNotes?: string | null;
  openingHours?: string | null;
  priceSEK?: string | null;
  priceLevel?: number | null;
  canPromoteHiddenGem?: boolean;
  communityNominationCount?: number;
  evidenceGate?: {
    independentEvidenceCount?: number;
    canPromoteHiddenGem?: boolean;
  };
};

interface AdminMapViewProps {
  candidates: AdminMapCandidate[];
  selectedCandidateId: number | null;
  onSelectCandidate: (id: number) => void;
  onUpdateDistrict?: (candidate: AdminMapCandidate, district: string) => void;
  onBatchUpdateDistrict?: (candidates: AdminMapCandidate[], district: string) => Promise<void> | void;
  onPromoteHiddenGem?: (candidate: AdminMapCandidate) => void;
  onMarkClosed?: (candidate: AdminMapCandidate) => void;
  lang?: Language;
}

export function AdminMapView({
  candidates,
  selectedCandidateId,
  onSelectCandidate,
  onUpdateDistrict,
  onBatchUpdateDistrict,
  onPromoteHiddenGem,
  onMarkClosed,
  lang = "sv",
}: AdminMapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());
  const [selectedPlace, setSelectedPlace] = useState<AdminMapCandidate | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [multiSelectMode, setMultiSelectMode] = useState<boolean>(false);
  const [batchDistrict, setBatchDistrict] = useState<string>("Gärdet");
  const [isApplyingBatch, setIsApplyingBatch] = useState<boolean>(false);
  const lastFitKeyRef = useRef<string>("");

  // Filter candidates with valid coordinates
  const validCandidates = candidates.filter(
    (c) => typeof c.latitude === "number" && typeof c.longitude === "number" && !isNaN(c.latitude) && !isNaN(c.longitude),
  );

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [59.3293, 18.0686],
      zoom: 12,
      zoomControl: false,
      scrollWheelZoom: true,
    });

    const tileUrl = "https://tiles.openfreemap.org/styles/bright/{z}/{x}/{y}.png";
    const tileLayer = L.tileLayer(tileUrl, {
      attribution: '&copy; <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    });

    tileLayer.on("tileerror", () => {
      tileLayer.setUrl("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
    });

    tileLayer.addTo(map);

    const clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div class="admin-cluster-marker"><span>${count}</span></div>`,
          className: "admin-cluster-container",
          iconSize: L.point(34, 34),
        });
      },
    });

    map.addLayer(clusterGroup);
    clusterGroupRef.current = clusterGroup;
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Markers when candidates, selectedCandidateId, or selectedIds change
  useEffect(() => {
    const map = mapRef.current;
    const clusterGroup = clusterGroupRef.current;
    if (!map || !clusterGroup) return;

    clusterGroup.clearLayers();
    markersRef.current.clear();

    const bounds = L.latLngBounds([]);

    validCandidates.forEach((candidate) => {
      const lat = candidate.latitude!;
      const lng = candidate.longitude!;
      bounds.extend([lat, lng]);

      const stateClass = candidate.validationLabel === "closed_wrong_category"
        ? "state-closed"
        : `state-${candidate.lifecycleState}`;

      const isMultiSelected = selectedIds.has(candidate.id);
      const isSingleSelected = candidate.id === selectedCandidateId;

      const icon = L.divIcon({
        className: "admin-map-pin-container",
        html: `
          <div class="admin-map-pin ${stateClass} ${isSingleSelected ? "is-selected" : ""} ${isMultiSelected ? "is-multi-selected" : ""}" title="${candidate.name} (${candidate.area})">
            <span class="admin-pin-dot"></span>
            ${isMultiSelected ? '<span class="admin-pin-check">✓</span>' : ""}
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const marker = L.marker([lat, lng], { icon });

      marker.on("click", (e) => {
        if (multiSelectMode) {
          L.DomEvent.stopPropagation(e);
          setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(candidate.id)) {
              next.delete(candidate.id);
            } else {
              next.add(candidate.id);
            }
            return next;
          });
          setSelectedPlace(candidate);
        } else {
          setSelectedPlace(candidate);
          onSelectCandidate(candidate.id);
          map.panTo([lat, lng]);
        }
      });

      clusterGroup.addLayer(marker);
      markersRef.current.set(candidate.id, marker);
    });

    const currentKey = validCandidates.map((c) => c.id).join(",");
    if (validCandidates.length > 0 && bounds.isValid() && lastFitKeyRef.current !== currentKey) {
      lastFitKeyRef.current = currentKey;
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [validCandidates, selectedCandidateId, selectedIds, multiSelectMode, onSelectCandidate]);

  // Synchronize external selection
  useEffect(() => {
    if (!selectedCandidateId) return;
    const found = candidates.find((c) => c.id === selectedCandidateId);
    if (found) {
      setSelectedPlace(found);
      if (mapRef.current && typeof found.latitude === "number" && typeof found.longitude === "number") {
        mapRef.current.setView([found.latitude, found.longitude], 15, { animate: true });
      }
    }
  }, [selectedCandidateId, candidates]);

  const toggleCandidateSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    setSelectedIds(new Set(validCandidates.map((c) => c.id)));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleApplyBatchDistrict = async () => {
    if (!onBatchUpdateDistrict || selectedIds.size === 0 || !batchDistrict) return;
    const candidatesToUpdate = validCandidates.filter((c) => selectedIds.has(c.id));
    if (candidatesToUpdate.length === 0) return;

    setIsApplyingBatch(true);
    try {
      await onBatchUpdateDistrict(candidatesToUpdate, batchDistrict);
      setSelectedIds(new Set());
    } finally {
      setIsApplyingBatch(false);
    }
  };

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleFitBounds = () => {
    if (!mapRef.current || validCandidates.length === 0) return;
    const bounds = L.latLngBounds([]);
    validCandidates.forEach((c) => bounds.extend([c.latitude!, c.longitude!]));
    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  };

  const handleCenterStockholm = () => {
    mapRef.current?.setView([59.3293, 18.0686], 12, { animate: true });
  };

  return (
    <div className="admin-map-wrapper">
      <div className="admin-map-legend">
        <div className="legend-items">
          <span className="legend-chip state-candidate">
            <span className="dot dot-candidate" /> {lang === "sv" ? "Kandidat" : "Candidate"}
          </span>
          <span className="legend-chip state-verified">
            <span className="dot dot-verified" /> {lang === "sv" ? "Verifierad" : "Verified"}
          </span>
          <span className="legend-chip state-featured">
            <span className="dot dot-featured" /> {lang === "sv" ? "Utvald" : "Featured"}
          </span>
          <span className="legend-chip state-baseline">
            <span className="dot dot-baseline" /> {lang === "sv" ? "Baslinje" : "Baseline"}
          </span>
          <span className="legend-chip state-closed">
            <span className="dot dot-closed" /> {lang === "sv" ? "Stängd" : "Closed"}
          </span>
        </div>
        <div className="legend-meta">
          <span>
            <b>{validCandidates.length}</b> {lang === "sv" ? "ställen på kartan" : "places mapped"}
          </span>
          <button
            type="button"
            className={`admin-multi-select-toggle-btn ${multiSelectMode ? "is-active" : ""}`}
            onClick={() => setMultiSelectMode((prev) => !prev)}
            title={lang === "sv" ? "Aktivera flerval för att markera flera ställen på kartan" : "Toggle multi-select mode on the map"}
          >
            <CheckSquareOffset size={15} weight="bold" />
            <span>
              {multiSelectMode
                ? (lang === "sv" ? "Flerval: På" : "Multi-select: ON")
                : (lang === "sv" ? "Flerval: Av" : "Multi-select: OFF")}
            </span>
            {selectedIds.size > 0 && (
              <span className="multi-select-count-badge">{selectedIds.size}</span>
            )}
          </button>
        </div>
      </div>

      <div className="admin-map-viewport">
        <div ref={containerRef} className="admin-leaflet-container" />

        <div className="admin-map-floating-controls">
          <button
            type="button"
            className="admin-map-ctrl-btn"
            onClick={handleZoomIn}
            title={lang === "sv" ? "Zooma in" : "Zoom in"}
            aria-label="Zoom in"
          >
            <Plus size={16} weight="bold" />
          </button>
          <button
            type="button"
            className="admin-map-ctrl-btn"
            onClick={handleZoomOut}
            title={lang === "sv" ? "Zooma ut" : "Zoom out"}
            aria-label="Zoom out"
          >
            <Minus size={16} weight="bold" />
          </button>
          <button
            type="button"
            className="admin-map-ctrl-btn"
            onClick={handleFitBounds}
            title={lang === "sv" ? "Anpassa till alla ställen" : "Fit all places"}
            aria-label="Fit bounds"
          >
            <ArrowsIn size={16} weight="bold" />
          </button>
          <button
            type="button"
            className="admin-map-ctrl-btn"
            onClick={handleCenterStockholm}
            title={lang === "sv" ? "Centrera Stockholm" : "Center Stockholm"}
            aria-label="Center Stockholm"
          >
            <Crosshair size={16} weight="bold" />
          </button>
        </div>

        {selectedIds.size > 0 && (
          <aside className="admin-map-batch-bar" role="region" aria-label={lang === "sv" ? "Batch-åtgärder" : "Batch actions"}>
            <div className="batch-bar-info">
              <span className="batch-bar-count">
                <CheckSquareOffset size={16} weight="bold" />
                <span className="batch-count-pill">{selectedIds.size}</span>
                <span>{lang === "sv" ? "valda" : "selected"}</span>
              </span>
              <button
                type="button"
                className="batch-bar-btn-subtle"
                onClick={handleSelectAllVisible}
                title={lang === "sv" ? "Markera alla synliga ställen" : "Select all visible places"}
              >
                {lang === "sv" ? `Välj alla synliga (${validCandidates.length})` : `Select all visible (${validCandidates.length})`}
              </button>
              <button
                type="button"
                className="batch-bar-btn-subtle"
                onClick={handleClearSelection}
                title={lang === "sv" ? "Rensa alla valda ställen" : "Clear selection"}
              >
                {lang === "sv" ? "Rensa val" : "Clear"}
              </button>
            </div>

            <div className="batch-bar-action">
              <label htmlFor="batch-district-select" className="batch-bar-label">
                {lang === "sv" ? "Stadsdel:" : "District:"}
              </label>
              <select
                id="batch-district-select"
                value={batchDistrict}
                onChange={(e) => setBatchDistrict(e.target.value)}
                className="admin-batch-district-select"
              >
                {STOCKHOLM_REGION_NAMES.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="admin-batch-apply-btn"
                disabled={isApplyingBatch || !onBatchUpdateDistrict}
                onClick={handleApplyBatchDistrict}
              >
                {isApplyingBatch ? (
                  <>
                    <CircleNotch size={15} className="animate-spin" />
                    <span>{lang === "sv" ? "Tilldelar..." : "Assigning..."}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={15} weight="bold" />
                    <span>
                      {lang === "sv"
                        ? `Tilldela till ${batchDistrict} (${selectedIds.size})`
                        : `Assign to ${batchDistrict} (${selectedIds.size})`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </aside>
        )}

        {selectedPlace ? (
          <aside className="admin-map-inspector" aria-label={lang === "sv" ? "Inspektera ställe" : "Inspect place"}>
            <div className="inspector-head">
              <div>
                <div className="inspector-badge-row">
                  <span className={`inspector-lifecycle-badge state-${selectedPlace.lifecycleState}`}>
                    {selectedPlace.lifecycleState}
                  </span>
                  {selectedPlace.validationLabel === "known_hidden_gem" ? (
                    <span className="inspector-gem-badge" title={lang === "sv" ? "Officiellt verifierad dold pärla" : "Verified hidden gem"}>
                      <Sparkle size={10} weight="fill" />
                      {lang === "sv" ? "Dold pärla" : "Hidden gem"}
                    </span>
                  ) : null}
                  {(selectedPlace.communityNominationCount ?? 0) > 0 ? (
                    <span className="inspector-nomination-badge" title={lang === "sv" ? "Tipsad av besökare som dold pärla" : "Nominated by visitors as hidden gem"}>
                      ✨ {selectedPlace.communityNominationCount} {lang === "sv" ? "tips" : "tips"}
                    </span>
                  ) : null}
                </div>
                <h4>{selectedPlace.name}</h4>
                <div className="inspector-subtitle">
                  <span>{selectedPlace.kind}</span>
                  <span className="separator">·</span>
                  <span className={isBroadStockholmArea(selectedPlace.area) ? "region-warning-text" : ""}>
                    {selectedPlace.area}
                  </span>
                  <span className="separator">·</span>
                  <span className="id-tag">#{selectedPlace.id}</span>
                </div>
              </div>
              <button
                type="button"
                className="inspector-close"
                onClick={() => setSelectedPlace(null)}
                aria-label="Stäng detaljpanel"
              >
                ✕
              </button>
            </div>

            <div className="inspector-body">
              {isBroadStockholmArea(selectedPlace.area) ? (
                <div className="inspector-alert-warning">
                  <Warning size={14} weight="bold" />
                  <span>
                    {lang === "sv"
                      ? "Oprecis region ('Stockholm'). Välj stadsdel för att möta drift- och rättvisegrinden."
                      : "Unresolved district ('Stockholm'). Please set specific district."}
                  </span>
                </div>
              ) : null}

              {selectedPlace.address ? (
                <div className="inspector-row">
                  <MapPin size={14} weight="bold" />
                  <span>{selectedPlace.address}</span>
                </div>
              ) : null}

              {selectedPlace.website ? (
                <div className="inspector-row">
                  <Globe size={14} weight="bold" />
                  <a href={selectedPlace.website} target="_blank" rel="noopener noreferrer">
                    {selectedPlace.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                  </a>
                </div>
              ) : null}

              {selectedPlace.openingHours ? (
                <div className="inspector-row">
                  <span className="inspector-label">Öppet:</span>
                  <span>{selectedPlace.openingHours}</span>
                </div>
              ) : null}

              {selectedPlace.priceSEK ? (
                <div className="inspector-row">
                  <span className="inspector-label">Pris:</span>
                  <span>{selectedPlace.priceSEK} SEK</span>
                </div>
              ) : null}

              {onUpdateDistrict ? (
                <div className="inspector-region-selector">
                  <label htmlFor={`map-region-select-${selectedPlace.id}`}>
                    {lang === "sv" ? "Sätt stadsdel direkt:" : "Set district directly:"}
                  </label>
                  <select
                    id={`map-region-select-${selectedPlace.id}`}
                    value={selectedPlace.area}
                    onChange={(e) => onUpdateDistrict(selectedPlace, e.target.value)}
                    className="admin-region-select"
                  >
                    {STOCKHOLM_REGION_NAMES.map((region) => (
                      <option key={region} value={region}>
                        {region}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="inspector-actions">
                {onPromoteHiddenGem && selectedPlace.validationLabel !== "known_hidden_gem" ? (
                  <button
                    type="button"
                    className={`inspector-btn inspector-btn-gem ${
                      selectedPlace.evidenceGate?.canPromoteHiddenGem === false || selectedPlace.canPromoteHiddenGem === false ? "disabled" : ""
                    }`}
                    disabled={selectedPlace.evidenceGate?.canPromoteHiddenGem === false || selectedPlace.canPromoteHiddenGem === false}
                    onClick={() => onPromoteHiddenGem(selectedPlace)}
                    title={
                      selectedPlace.evidenceGate?.canPromoteHiddenGem === false || selectedPlace.canPromoteHiddenGem === false
                        ? (lang === "sv"
                            ? "Kräver minst 2 oberoende icke-Google-källor (Dubbellås)"
                            : "Requires at least 2 independent non-Google sources (Double-Lock)")
                        : (lang === "sv"
                            ? "Promovera plats till verifierad dold pärla (Dubbellås uppfyllt)"
                            : "Promote place to verified hidden gem (Double-Lock satisfied)")
                    }
                  >
                    <Sparkle size={14} weight="fill" />
                    {lang === "sv" ? "Dold pärla" : "Hidden gem"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`inspector-btn ${selectedIds.has(selectedPlace.id) ? "inspector-btn-selected" : "inspector-btn-secondary"}`}
                  onClick={() => toggleCandidateSelection(selectedPlace.id)}
                  title={selectedIds.has(selectedPlace.id) ? (lang === "sv" ? "Ta bort från flerval" : "Remove from selection") : (lang === "sv" ? "Lägg till i flerval" : "Add to selection")}
                >
                  <CheckSquareOffset size={14} weight="bold" />
                  {selectedIds.has(selectedPlace.id)
                    ? (lang === "sv" ? "Avmarkera" : "Deselect")
                    : (lang === "sv" ? "Flerval" : "Select")}
                </button>
                <button
                  type="button"
                  className="inspector-btn inspector-btn-primary"
                  onClick={() => onSelectCandidate(selectedPlace.id)}
                >
                  <Eye size={14} weight="bold" />
                  {lang === "sv" ? "Fokusera" : "Focus"}
                </button>
                {onMarkClosed && selectedPlace.validationLabel !== "closed_wrong_category" ? (
                  <button
                    type="button"
                    className="inspector-btn inspector-btn-danger"
                    onClick={() => onMarkClosed(selectedPlace)}
                  >
                    {lang === "sv" ? "Stängd" : "Closed"}
                  </button>
                ) : null}
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

