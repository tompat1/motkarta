import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import React, { useEffect, useRef, useState } from "react";
import type { Language } from "../app/shared";
import { STOCKHOLM_REGIONS as STOCKHOLM_REGION_NAMES, isBroadStockholmArea } from "../../lib/stockholm-regions";
import { ArrowsIn, Crosshair, Eye, Globe, MapPin, Minus, Plus, Warning } from "@phosphor-icons/react";

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
};

interface AdminMapViewProps {
  candidates: AdminMapCandidate[];
  selectedCandidateId: number | null;
  onSelectCandidate: (id: number) => void;
  onUpdateDistrict?: (candidate: AdminMapCandidate, district: string) => void;
  onMarkClosed?: (candidate: AdminMapCandidate) => void;
  lang?: Language;
}

export function AdminMapView({
  candidates,
  selectedCandidateId,
  onSelectCandidate,
  onUpdateDistrict,
  onMarkClosed,
  lang = "sv",
}: AdminMapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());
  const [selectedPlace, setSelectedPlace] = useState<AdminMapCandidate | null>(null);

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

  // Update Markers when candidates change
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

      const icon = L.divIcon({
        className: "admin-map-pin-container",
        html: `
          <div class="admin-map-pin ${stateClass} ${candidate.id === selectedCandidateId ? "is-selected" : ""}" title="${candidate.name}">
            <span class="admin-pin-dot"></span>
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const marker = L.marker([lat, lng], { icon });

      marker.on("click", () => {
        setSelectedPlace(candidate);
        onSelectCandidate(candidate.id);
        map.panTo([lat, lng]);
      });

      clusterGroup.addLayer(marker);
      markersRef.current.set(candidate.id, marker);
    });

    if (validCandidates.length > 0 && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [validCandidates, selectedCandidateId, onSelectCandidate]);

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
            <b>{validCandidates.length}</b> {lang === "sv" ? "ställen med koordinater på kartan" : "places mapped"}
          </span>
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

        {selectedPlace ? (
          <aside className="admin-map-inspector" aria-label={lang === "sv" ? "Inspektera ställe" : "Inspect place"}>
            <div className="inspector-head">
              <div>
                <span className={`inspector-lifecycle-badge state-${selectedPlace.lifecycleState}`}>
                  {selectedPlace.lifecycleState}
                </span>
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
                <button
                  type="button"
                  className="inspector-btn inspector-btn-primary"
                  onClick={() => onSelectCandidate(selectedPlace.id)}
                >
                  <Eye size={14} weight="bold" />
                  {lang === "sv" ? "Fokusera granskningskort" : "Focus review card"}
                </button>
                {onMarkClosed && selectedPlace.validationLabel !== "closed_wrong_category" ? (
                  <button
                    type="button"
                    className="inspector-btn inspector-btn-danger"
                    onClick={() => onMarkClosed(selectedPlace)}
                  >
                    {lang === "sv" ? "Markera stängd" : "Mark closed"}
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
