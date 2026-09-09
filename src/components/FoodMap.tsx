import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { useEffect, useRef, useState } from "react";
import type { EstablishmentType, ScoredPlace } from "../../lib/scoring";
import type { Language } from "../app/shared";
import { cuisineLabel, cuisineParts, hasCoordinates, translations } from "../app/shared";
import { requestPosition, locationFailureMessage, type LocationResult } from '../app/geolocation';
import { ArrowsIn, ArrowsOut, Crosshair, MapTrifold, Minus, Plus } from "@phosphor-icons/react";

export function FoodMap({
  places,
  activePlace,
  userLocation,
  onSelect,
  onUserLocated,
  lang,
}: {
  places: ScoredPlace[];
  activePlace: ScoredPlace | null;
  userLocation?: { latitude: number; longitude: number } | null;
  onSelect: (id: number) => void;
  onUserLocated?: (loc: { latitude: number; longitude: number }) => void;
  lang: Language;
}) {
  const t = translations[lang];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());
  const userMarkerRef = useRef<L.Marker | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationFailure, setLocationFailure] = useState<Exclude<LocationResult['status'], 'acquired'> | null>(null);

  const handleLocateUser = async () => {
    if (locating) return;
    setLocating(true);
    setLocationFailure(null);
    const result = await requestPosition();
    setLocating(false);
    if (result.status !== 'acquired') { setLocationFailure(result.status); return; }
    const coords = result.location;
    const map = mapRef.current;
    if (map) {
      map.flyTo([coords.latitude, coords.longitude], 14, { duration: 1.2 });

      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
      }

      const pulseIcon = L.divIcon({
        className: "user-pulse-container",
        html: '<div class="user-pulse-marker" title="Din position">📍</div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      userMarkerRef.current = L.marker([coords.latitude, coords.longitude], { icon: pulseIcon }).addTo(map);
      if (isMobileMapViewport()) {
        userMarkerRef.current
          .bindPopup(`<b>${lang === "sv" ? "Din position" : "Your location"}</b>`)
          .openPopup();
      } else {
        map.closePopup();
      }
    }
    onUserLocated?.(coords);
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
    }
    const pulseIcon = L.divIcon({
      className: "user-pulse-container",
      html: '<div class="user-pulse-marker" title="Din position">📍</div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    userMarkerRef.current = L.marker([userLocation.latitude, userLocation.longitude], { icon: pulseIcon }).addTo(map);
  }, [userLocation]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      center: [59.3293, 18.0686],
      zoom: 12,
      zoomControl: false,
      scrollWheelZoom: true,
    });

    const tileUrl = "https://tiles.openfreemap.org/styles/bright/{z}/{x}/{y}.png";

    const tileLayer = L.tileLayer(tileUrl, {
      attribution: 'OpenFreeMap &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      maxZoom: 19,
    });

    tileLayer.on("tileerror", () => {
      // Fallback tile URL if vector/raster tile service is unavailable
      tileLayer.setUrl("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
    });

    tileLayer.addTo(map);

    const clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 45,
      disableClusteringAtZoom: 15,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        let size = 34;
        let sizeClass = "cluster-small";
        if (count >= 25) {
          size = 46;
          sizeClass = "cluster-large";
        } else if (count >= 10) {
          size = 40;
          sizeClass = "cluster-medium";
        }
        return L.divIcon({
          html: `<div class="motkarta-cluster-blob ${sizeClass}"><span>${count}</span></div>`,
          className: "motkarta-cluster-container",
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
      },
    });

    map.addLayer(clusterGroup);
    clusterGroupRef.current = clusterGroup;

    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);

    const handleFsChange = () => {
      const isFs = Boolean(document.fullscreenElement);
      setIsFullscreen(isFs);
      window.setTimeout(() => map.invalidateSize(), 100);
    };

    document.addEventListener("fullscreenchange", handleFsChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      markersRef.current.clear();
      clusterGroup.clearLayers();
      map.remove();
      mapRef.current = null;
      clusterGroupRef.current = null;
    };
  }, []);

  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = L.latLngBounds([]);
    places.filter(hasCoordinates).forEach((place) => {
      bounds.extend([place.latitude, place.longitude]);
    });
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [42, 42], maxZoom: 13 });
    } else {
      map.setView([59.3293, 18.0686], 12);
    }
  };

  const handleZoomIn = () => {
    mapRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut();
  };

  const handleToggleFullscreen = () => {
    const panel = containerRef.current?.closest(".map-panel");
    if (!panel) return;

    if (!document.fullscreenElement) {
      if (panel.requestFullscreen) {
        void panel.requestFullscreen();
      } else {
        panel.classList.toggle("is-fullscreen");
        setIsFullscreen(panel.classList.contains("is-fullscreen"));
      }
    } else {
      if (document.exitFullscreen) {
        void document.exitFullscreen();
      } else {
        panel.classList.remove("is-fullscreen");
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const map = mapRef.current;
    const clusterGroup = clusterGroupRef.current;
    if (!map) {
      return;
    }

    if (clusterGroup) {
      clusterGroup.clearLayers();
    }
    markersRef.current.clear();

    const bounds = L.latLngBounds([]);
    const validPlaces = places.filter(hasCoordinates);

    validPlaces.forEach((place, index) => {
      const isActive = place.id === activePlace?.id;
      const marker = L.marker([place.latitude, place.longitude], {
        icon: placeIcon(place, isActive),
        title: place.name,
      }).on("click", () => {
        onSelect(place.id);
        marker.openPopup();
      });

      marker.bindPopup(placePopupHtml(place, index + 1, lang), { maxWidth: 280 });

      if (clusterGroup) {
        clusterGroup.addLayer(marker);
      } else {
        marker.addTo(map);
      }

      markersRef.current.set(place.id, marker);
      bounds.extend(marker.getLatLng());
    });

    if (bounds.isValid()) {
      const maxZoom = validPlaces.length <= 10 ? 15 : 13;
      map.fitBounds(bounds, { padding: [42, 42], maxZoom });
    }
  }, [lang, onSelect, places]);

  useEffect(() => {
    const map = mapRef.current;
    const clusterGroup = clusterGroupRef.current;
    if (!activePlace || !map || !hasCoordinates(activePlace)) {
      return;
    }

    const activeMarker = markersRef.current.get(activePlace.id);
    if (!activeMarker) return;

    places.filter(hasCoordinates).forEach((place) => {
      markersRef.current.get(place.id)?.setIcon(placeIcon(place, place.id === activePlace.id));
    });

    if (clusterGroup) {
      clusterGroup.zoomToShowLayer(activeMarker, () => {
        activeMarker.openPopup();
      });
    } else {
      activeMarker.openPopup();
      map.flyTo([activePlace.latitude, activePlace.longitude], 15, { duration: 0.8 });
    }
  }, [activePlace, places]);

  return (
    <div className="leaflet-shell">
      {locationFailure ? <div className="location-toast" role="status">
        <span>{locationFailureMessage(locationFailure, lang)}</span>
        <button type="button" onClick={() => setLocationFailure(null)} aria-label={lang === 'sv' ? 'Stäng' : 'Close'}>×</button>
      </div> : null}
      <div className="map-toolbar" role="toolbar" aria-label={lang === "sv" ? "Kartkontroller" : "Map controls"}>
        <button
          type="button"
          className={`map-control-btn map-locate-btn ${locating ? "is-active" : ""}`}
          onClick={handleLocateUser}
          disabled={locating}
          aria-busy={locating}
          title={lang === "sv" ? "Visa min position & ställen nära mig" : "Show my location & places near me"}
          aria-label={lang === "sv" ? "Nära mig" : "Near me"}
        >
          <Crosshair size={16} weight="bold" />
          <span className="map-btn-label">
            {locating
              ? (lang === "sv" ? "Söker..." : "Locating...")
              : (lang === "sv" ? "Nära mig" : "Near me")}
          </span>
        </button>
        <button
          type="button"
          className="map-control-btn"
          onClick={handleRecenter}
          title={t.centerMap}
          aria-label={t.centerMap}
        >
          <MapTrifold size={16} weight="bold" />
          <span className="map-btn-label">{t.centerMap}</span>
        </button>
        <button
          type="button"
          className={`map-control-btn ${isFullscreen ? "is-active" : ""}`}
          onClick={handleToggleFullscreen}
          title={isFullscreen ? t.exitFullscreen : t.fullscreen}
          aria-label={isFullscreen ? t.exitFullscreen : t.fullscreen}
        >
          {isFullscreen ? <ArrowsIn size={16} weight="bold" /> : <ArrowsOut size={16} weight="bold" />}
          <span className="map-btn-label">{isFullscreen ? t.exitFullscreen : t.fullscreen}</span>
        </button>
        <button
          type="button"
          className="map-control-btn"
          onClick={handleZoomIn}
          title={lang === "sv" ? "Zooma in" : "Zoom in"}
          aria-label={lang === "sv" ? "Zooma in" : "Zoom in"}
        >
          <Plus size={16} weight="bold" />
          <span className="map-btn-label">{lang === "sv" ? "Zooma in" : "Zoom in"}</span>
        </button>
        <button
          type="button"
          className="map-control-btn"
          onClick={handleZoomOut}
          title={lang === "sv" ? "Zooma ut" : "Zoom out"}
          aria-label={lang === "sv" ? "Zooma ut" : "Zoom out"}
        >
          <Minus size={16} weight="bold" />
          <span className="map-btn-label">{lang === "sv" ? "Zooma ut" : "Zoom out"}</span>
        </button>
      </div>

      <div ref={containerRef} className="leaflet-map" aria-label="Interactive Stockholm food map" />
    </div>
  );
}

function isMobileMapViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
}

function placeIcon(place: ScoredPlace, active: boolean) {
  const kind = place.kind;
  let iconSvg = "";
  if (kind === "Restaurant") {
    // Fork & Knife SVG
    iconSvg = `<svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M200,32a8,8,0,0,0-8,8V104a24,24,0,0,1-24,24H160a8,8,0,0,0-8,8v80a8,8,0,0,0,16,0V144h8a40,40,0,0,0,40-40V40A8,8,0,0,0,200,32ZM96,32a8,8,0,0,0-8,8V88H72V40a8,8,0,0,0-16,0V88H40V40a8,8,0,0,0-16,0V96a40,40,0,0,0,40,40v80a8,8,0,0,0,16,0V136a40,40,0,0,0,40-40V40A8,8,0,0,0,96,32Z"/></svg>`;
  } else if (kind === "Bakery") {
    // Bread SVG
    iconSvg = `<svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M216,104H40a16,16,0,0,0-16,16v32a48.05,48.05,0,0,0,48,48H184a48.05,48.05,0,0,0,48-48V120A16,16,0,0,0,216,104ZM56,120H96v64H72a32,32,0,0,1-32-32V120ZM160,184H112V120h48V184Zm56-32a32,32,0,0,1-32,32H176V120h40V152Z"/></svg>`;
  } else {
    // Coffee Cup SVG (Café & Specialty Coffee)
    iconSvg = `<svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M224,80H208V64a16,16,0,0,0-16-16H48A16,16,0,0,0,32,64V152a48.05,48.05,0,0,0,48,48h80a48.05,48.05,0,0,0,48-48V136h16a32.03,32.03,0,0,0,32-32V112A32.03,32.03,0,0,0,224,80Zm0,40H208V96h16a16,16,0,0,1,16,16V104A16,16,0,0,1,224,120Z"/></svg>`;
  }

  const iconSize: [number, number] = active ? [36, 36] : [28, 28];
  const iconAnchor: [number, number] = active ? [18, 18] : [14, 14];
  const popupAnchor: [number, number] = active ? [0, -20] : [0, -14];

  return L.divIcon({
    className: "motkarta-map-marker-container",
    html: `<div class="motkarta-map-marker ${kindClass(kind)} ${active ? "active" : ""}">
      <div class="marker-badge">
        ${iconSvg}
      </div>
    </div>`,
    iconSize,
    iconAnchor,
    popupAnchor,
  });
}

function placePopupHtml(place: ScoredPlace, rank: number, lang: Language = "sv") {
  const cuisines = cuisineParts(place).map((c) => cuisineLabel(c, lang)).join(" · ");
  const queryText = encodeURIComponent(`${place.name} ${place.address || place.area || ""} Stockholm`);
  const gmapsUrl = place.latitude && place.longitude
    ? `https://www.google.com/maps/search/?api=1&query=${queryText}&query_place_id=${place.latitude},${place.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${queryText}`;
  const appleMapsUrl = place.latitude && place.longitude
    ? `https://maps.apple.com/?q=${encodeURIComponent(place.name)}&ll=${place.latitude},${place.longitude}`
    : `https://maps.apple.com/?q=${queryText}`;
  const osmUrl = place.latitude && place.longitude
    ? `https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=17/${place.latitude}/${place.longitude}`
    : `https://www.openstreetmap.org/search?query=${queryText}`;

  return `
    <strong>${rank}. ${escapeHtml(place.name)}</strong>
    <span>${escapeHtml(place.kind)} · ${escapeHtml(place.area)}</span>
    ${cuisines ? `<span>${escapeHtml(cuisines)}</span>` : ""}
    <em>${Math.round(place.scores.recommendation)} match · ${escapeHtml(place.evidence.confidence)} confidence</em>
    <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #eee; display: flex; gap: 8px; font-size: 11px;">
      <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer" style="color: #ea4335; font-weight: 600; text-decoration: none;">📍 Google Maps ↗</a>
      <a href="${appleMapsUrl}" target="_blank" rel="noopener noreferrer" style="color: #0071e3; font-weight: 600; text-decoration: none;">🧭 Apple Maps ↗</a>
      <a href="${osmUrl}" target="_blank" rel="noopener noreferrer" style="color: #7ebc6f; font-weight: 600; text-decoration: none;">🗺️ OSM ↗</a>
    </div>
  `;
}

function kindClass(kind: EstablishmentType) {
  return `kind-${kind.replaceAll(" ", "-").toLowerCase()}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}
