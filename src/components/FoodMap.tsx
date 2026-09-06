import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import type { EstablishmentType, ScoredPlace } from "../../lib/scoring";
import type { Language } from "../app/shared";
import { cuisineLabel, cuisineParts, hasCoordinates, translations } from "../app/shared";
import { requestPosition, locationFailureMessage, type LocationResult } from '../app/geolocation';
import { ArrowsIn, ArrowsOut, Crosshair, List, MapTrifold, Minus, NavigationArrow, Plus } from "@phosphor-icons/react";

export function FoodMap({
  places,
  activePlace,
  userLocation,
  onSelect,
  onUserLocated,
  onToggleView,
  lang,
}: {
  places: ScoredPlace[];
  activePlace: ScoredPlace | null;
  userLocation?: { latitude: number; longitude: number } | null;
  onSelect: (id: number) => void;
  onUserLocated?: (loc: { latitude: number; longitude: number }) => void;
  onToggleView?: () => void;
  lang: Language;
}) {
  const t = translations[lang];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
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

    const tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

    L.tileLayer(tileUrl, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      subdomains: ["a", "b", "c"],
    }).addTo(map);

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
      map.remove();
      mapRef.current = null;
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
    if (!map) {
      return;
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();

    const bounds = L.latLngBounds([]);
    places.filter(hasCoordinates).forEach((place, index) => {
      const marker = L.marker([place.latitude, place.longitude], {
        icon: placeIcon(place, place.id === activePlace?.id),
        title: place.name,
      })
        .on("click", () => {
          onSelect(place.id);
          if (isMobileMapViewport()) {
            marker.openPopup();
          } else {
            map.closePopup();
          }
        })
        .addTo(map);

      if (isMobileMapViewport()) {
        marker.bindPopup(placePopupHtml(place, index + 1, lang), { maxWidth: 280 });
      }

      markersRef.current.set(place.id, marker);
      bounds.extend(marker.getLatLng());
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [42, 42], maxZoom: 13 });
    }
  }, [lang, onSelect, places]);

  useEffect(() => {
    const map = mapRef.current;
    if (!activePlace) {
      return;
    }

    const activeMarker = markersRef.current.get(activePlace.id);
    if (!map || !activeMarker || !hasCoordinates(activePlace)) {
      return;
    }

    places.filter(hasCoordinates).forEach((place) => {
      markersRef.current.get(place.id)?.setIcon(placeIcon(place, place.id === activePlace.id));
    });
    if (isMobileMapViewport()) {
      activeMarker.openPopup();
    } else {
      map.closePopup();
    }
    map.flyTo([activePlace.latitude, activePlace.longitude], 15, { duration: 0.8 });
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

      {/* Floating Map Controls for Mobile */}
      <button
        type="button"
        className="mobile-floating-control-btn floating-gps-btn"
        onClick={handleLocateUser}
        disabled={locating}
        aria-busy={locating}
        title={lang === "sv" ? "Min position" : "My location"}
        aria-label={lang === "sv" ? "Min position" : "My location"}
      >
        <NavigationArrow size={22} weight="bold" />
      </button>

      {onToggleView ? (
        <button
          type="button"
          className="mobile-floating-control-btn floating-view-toggle-btn"
          onClick={onToggleView}
          title={lang === "sv" ? "Visa lista" : "Show list"}
          aria-label={lang === "sv" ? "Visa lista" : "Show list"}
        >
          <List size={20} weight="bold" />
          <span>{lang === "sv" ? "Lista" : "List"}</span>
        </button>
      ) : null}

      <div ref={containerRef} className="leaflet-map" aria-label="Interactive Stockholm food map" />
    </div>
  );
}

function isMobileMapViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
}

function placeIcon(place: ScoredPlace, active: boolean) {
  return L.divIcon({
    className: "custom-map-pin-container",
    html: `<span class="leaflet-place-marker ${kindClass(place.kind)} ${active ? "active" : ""}"></span>`,
    iconSize: active ? [24, 24] : [14, 14],
    iconAnchor: active ? [12, 12] : [7, 7],
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
