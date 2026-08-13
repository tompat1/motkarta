"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { demoPlaces } from "../lib/demo-places";
import {
  type EstablishmentType,
  type PlaceInput,
  type ScoredPlace,
  type UserPreferences,
  scorePlace,
} from "../lib/scoring";

const establishmentTypes = [
  "All places",
  "Restaurant",
  "Bistro",
  "Bakery",
  "Café",
  "Specialty coffee",
] as const;

const modes = ["For you", "Hidden gems", "Popular now", "Quality first"] as const;
const renderLimit = 350;

type EstablishmentFilter = (typeof establishmentTypes)[number];
type Mode = (typeof modes)[number];
type DataSource = "loading" | "demo" | "d1" | "osm";

function modeScore(place: ScoredPlace, mode: Mode) {
  if (mode === "Hidden gems") {
    return place.scores.discovery;
  }

  if (mode === "Popular now") {
    return place.scores.popularity;
  }

  if (mode === "Quality first") {
    return place.scores.quality;
  }

  return place.scores.recommendation;
}

function rounded(value: number) {
  return Math.round(value);
}

function preferencesFromQuery(query: string, kind: EstablishmentFilter): UserPreferences {
  const normalized = query.toLowerCase();
  const tags = [
    "filter",
    "beans",
    "cardamom",
    "pastry",
    "patisserie",
    "lunch",
    "fika",
    "dinner",
    "work",
    "independent",
  ].filter((tag) => normalized.includes(tag));

  return {
    kind: kind === "All places" ? undefined : (kind as EstablishmentType),
    tags,
    independentOnly: normalized.includes("independent") || normalized.includes("local"),
    purpose: normalized.includes("lunch")
      ? "lunch"
      : normalized.includes("dinner")
        ? "dinner"
        : normalized.includes("breakfast")
          ? "breakfast"
          : normalized.includes("fika")
            ? "fika"
            : normalized.includes("work")
              ? "work"
              : undefined,
  };
}

export default function App() {
  const [places, setPlaces] = useState<PlaceInput[]>(demoPlaces);
  const [dataSource, setDataSource] = useState<DataSource>("loading");
  const [mode, setMode] = useState<Mode>("For you");
  const [kind, setKind] = useState<EstablishmentFilter>("All places");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(1);
  const [concierge, setConcierge] = useState(
    "specialty coffee and a cardamom bun, away from the busiest tourist streets",
  );
  const [answer, setAnswer] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPlaces() {
      try {
        const payload = await fetchPlacesPayload();

        if (!cancelled && payload.places?.length) {
          setPlaces(payload.places);
          setDataSource(payload.source);
        }
      } catch {
        if (!cancelled) {
          setPlaces(demoPlaces);
          setDataSource("demo");
        }
      }
    }

    void loadPlaces();

    return () => {
      cancelled = true;
    };
  }, []);

  const preferences = useMemo(() => preferencesFromQuery(query, kind), [kind, query]);
  const scoredPlaces = useMemo(
    () => places.map((place) => scorePlace(place, preferences)),
    [places, preferences],
  );

  const ranked = useMemo(
    () =>
      scoredPlaces
        .filter((place) => kind === "All places" || place.kind === kind)
        .filter((place) =>
          `${place.name} ${place.area} ${place.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()),
        )
        .sort((a, b) => modeScore(b, mode) - modeScore(a, mode)),
    [kind, mode, query, scoredPlaces],
  );
  const visibleRanked = useMemo(() => ranked.slice(0, renderLimit), [ranked]);

  const active = ranked.find((place) => place.id === selected) ?? ranked[0] ?? scoredPlaces[0];

  function ask() {
    const request = concierge.toLowerCase();
    const requestedKind: EstablishmentType | undefined = request.includes("coffee")
      ? "Specialty coffee"
      : request.includes("bun") || request.includes("bager") || request.includes("pastr")
        ? "Bakery"
        : undefined;

    const requestedPreferences: UserPreferences = {
      kind: requestedKind,
      tags: request.includes("cardamom") ? ["cardamom"] : undefined,
      independentOnly: request.includes("tourist") || request.includes("independent"),
    };
    const picks = places
      .map((place) => scorePlace(place, requestedPreferences))
      .sort((a, b) => b.scores.recommendation - a.scores.recommendation)
      .slice(0, 2);

    setAnswer(
      `${picks.map((place) => place.name).join(" + ")} best matches this demo query. The score combines relevance, quality, popularity, discovery and freshness instead of letting raw review volume decide.`,
    );
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#">
          <span>STHLM</span>
          <b>OPEN TABLE</b>
        </a>
        <nav>
          <a href="#map">Explore</a>
          <a href="#method">Method</a>
          <a href="#concierge">Concierge</a>
        </nav>
        <a className="about" href="#sources">
          {dataSource === "osm"
            ? "Live OSM data"
            : dataSource === "d1"
              ? "Live D1 data"
              : dataSource === "loading"
                ? "Loading data"
                : "Demo data"}
        </a>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow">Independent food discovery · scoring foundation</p>
          <h1>
            Good places,
            <br />
            <i>not paid places.</i>
          </h1>
        </div>
        <p className="lede">
          A transparent Stockholm map for restaurants, bakeries, cafes and specialty coffee.
          Popularity matters, but it never gets the final word.
        </p>
      </section>

      <section className="controls" id="map">
        <label className="search">
          <span aria-hidden="true">/</span>
          <input
            aria-label="Search places"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search place, area or feature"
          />
        </label>
        <div className="chips" aria-label="Filter establishment type">
          {establishmentTypes.map((item) => (
            <button
              key={item}
              className={kind === item ? "active" : ""}
              onClick={() => setKind(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="workspace">
        <div className="map-panel">
          <FoodMap places={visibleRanked} activePlace={active} onSelect={setSelected} />
          <div className="legend map-legend">
            <span>
              <i className="dot coffee" /> Specialty
            </span>
            <span>
              <i className="dot bakery" /> Bakery
            </span>
            <span>
              <i className="dot bistro" /> Bistro
            </span>
            <span>
              <i className="dot food" /> Food
            </span>
          </div>

          <article className="map-card">
            <p>
              {active.kind} · {active.area}
            </p>
            <h2>{active.name}</h2>
            <p className="note">{active.note}</p>
            <div className="tag-row">
              {active.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="score-row">
              <div>
                <b>{rounded(active.scores.quality)}</b>
                <span>Quality</span>
              </div>
              <div>
                <b>{rounded(active.scores.popularity)}</b>
                <span>Popularity</span>
              </div>
              <div>
                <b>{rounded(active.scores.discovery)}</b>
                <span>Discovery</span>
              </div>
              <div>
                <b>{rounded(active.scores.relevance)}</b>
                <span>Relevance</span>
              </div>
            </div>
            <small>
              {active.evidence.confidence} confidence · {active.evidenceLabel}
            </small>
          </article>
        </div>

        <aside className="results">
          <div className="results-head">
            <div>
              <p className="eyebrow">Transparent ranking</p>
              <h2>{ranked.length} places in view</h2>
              {ranked.length > renderLimit ? <small>Showing top {renderLimit}</small> : null}
            </div>
            <select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
              {modes.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <p className="formula">
            {mode === "Hidden gems"
              ? "Discovery = quality + specialist confidence + local engagement + freshness - mainstream exposure"
              : mode === "Popular now"
                ? "Popularity = Bayesian rating + exposure-adjusted engagement + repeat visits + recent saves + source consensus"
                : mode === "Quality first"
                  ? "Quality = guide, editorial, user, inspection, attribute and freshness evidence"
                  : "Recommendation = 35% relevance + 25% quality + 15% popularity + 15% discovery + 10% freshness"}
          </p>
          <div className="list">
            {visibleRanked.map((place, index) => (
              <button
                key={place.id}
                className={place.id === active.id ? "place active-place" : "place"}
                onClick={() => setSelected(place.id)}
                type="button"
              >
                <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                <span className="place-main">
                  <small>
                    {place.kind} · {place.area}
                  </small>
                  <strong>{place.name}</strong>
                  <span>{place.tags.slice(0, 2).join(" · ")}</span>
                </span>
                <span className="total">
                  <b>{rounded(modeScore(place, mode))}</b>
                  <small>{mode === "For you" ? "match" : "score"}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className="concierge" id="concierge">
        <div>
          <p className="eyebrow">The independent concierge</p>
          <h2>
            Tell us what <i>good</i>
            <br />
            means today.
          </h2>
          <p>
            It searches the evidence first, then explains the recommendation. No invented
            opening hours. No paid placement.
          </p>
        </div>
        <div className="ask-box">
          <label htmlFor="ask">I am looking for...</label>
          <textarea id="ask" value={concierge} onChange={(event) => setConcierge(event.target.value)} />
          <button onClick={ask} type="button">
            Find my places <span aria-hidden="true">→</span>
          </button>
          {answer ? <p className="answer">{answer}</p> : null}
        </div>
      </section>

      <section className="method" id="method">
        <div>
          <p className="eyebrow">Open method · visible trade-offs</p>
          <h2>
            Popularity is evidence.
            <br />
            Not authority.
          </h2>
        </div>
        <div className="method-grid">
          <article>
            <b>01</b>
            <h3>Plural quality</h3>
            <p>Guide, editorial, user, inspection, attribute and freshness evidence stay separate.</p>
          </article>
          <article>
            <b>02</b>
            <h3>Corrected popularity</h3>
            <p>Bayesian rating, exposure-adjusted engagement and recency reduce winner-take-all bias.</p>
          </article>
          <article>
            <b>03</b>
            <h3>Specialty proof</h3>
            <p>Specialty coffee requires structured attributes or source verification, not marketing copy.</p>
          </article>
          <article>
            <b>04</b>
            <h3>Discovery value</h3>
            <p>Discovery rewards quality with limited exposure, not obscurity by itself.</p>
          </article>
        </div>
        <div className="disclaimer" id="sources">
          DATA NOTE
          <span>
            The deployed app can load the Python-generated OpenStreetMap baseline, while D1 remains
            available for later curated evidence and score snapshots.
          </span>
        </div>
      </section>

      <footer>
        <span>STHLM OPEN TABLE / LOCAL POC</span>
        <span>OPEN DATA · OPEN METHOD · OPEN CITY</span>
      </footer>
    </main>
  );
}

function FoodMap({
  places,
  activePlace,
  onSelect,
}: {
  places: ScoredPlace[];
  activePlace: ScoredPlace;
  onSelect: (id: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      center: [59.3293, 18.0686],
      zoom: 12,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
        icon: placeIcon(place, place.id === activePlace.id),
        title: place.name,
      })
        .bindPopup(placePopupHtml(place, index + 1), { maxWidth: 280 })
        .on("click", () => onSelect(place.id))
        .addTo(map);

      markersRef.current.set(place.id, marker);
      bounds.extend(marker.getLatLng());
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [42, 42], maxZoom: 13 });
    }
  }, [onSelect, places]);

  useEffect(() => {
    const map = mapRef.current;
    const activeMarker = markersRef.current.get(activePlace.id);
    if (!map || !activeMarker || !hasCoordinates(activePlace)) {
      return;
    }

    places.filter(hasCoordinates).forEach((place) => {
      markersRef.current.get(place.id)?.setIcon(placeIcon(place, place.id === activePlace.id));
    });
    map.panTo([activePlace.latitude, activePlace.longitude], { animate: true, duration: 0.45 });
  }, [activePlace, places]);

  return (
    <div className="leaflet-shell">
      <div ref={containerRef} className="leaflet-map" aria-label="Interactive Stockholm food map" />
    </div>
  );
}

function hasCoordinates(place: ScoredPlace): place is ScoredPlace & { latitude: number; longitude: number } {
  return typeof place.latitude === "number" && typeof place.longitude === "number";
}

function placeIcon(place: ScoredPlace, active: boolean) {
  return L.divIcon({
    className: "",
    html: `<span class="leaflet-place-marker ${kindClass(place.kind)} ${active ? "active" : ""}">${escapeHtml(place.name.slice(0, 1))}</span>`,
    iconSize: active ? [32, 32] : [24, 24],
    iconAnchor: active ? [16, 16] : [12, 12],
  });
}

function placePopupHtml(place: ScoredPlace, rank: number) {
  return `
    <strong>${rank}. ${escapeHtml(place.name)}</strong>
    <span>${escapeHtml(place.kind)} · ${escapeHtml(place.area)}</span>
    <em>${Math.round(place.scores.recommendation)} match · ${escapeHtml(place.evidence.confidence)} confidence</em>
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

async function fetchPlacesPayload(): Promise<{ source: DataSource; places: PlaceInput[] }> {
  try {
    const staticResponse = await fetch("/data/places.json");
    if (staticResponse.ok) {
      const payload = (await staticResponse.json()) as { source?: DataSource; places?: PlaceInput[] };
      if (payload.places?.length) {
        return { source: payload.source ?? "osm", places: payload.places };
      }
    }
  } catch {
    // Fall through to the API path when the generated static dataset is absent.
  }

  const apiResponse = await fetch("/api/places");
  if (!apiResponse.ok) {
    throw new Error(`Places API responded ${apiResponse.status}`);
  }

  const payload = (await apiResponse.json()) as { source?: DataSource; places?: PlaceInput[] };
  if (!payload.places?.length) {
    throw new Error("Places API returned no places");
  }
  return { source: payload.source ?? "d1", places: payload.places };
}
