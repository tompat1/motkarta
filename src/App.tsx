"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { demoPlaces } from "../lib/demo-places";
import { parseConciergeAnswer } from "../lib/concierge-parser";
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
  "Bakery",
  "Café",
  "Specialty coffee",
] as const;

const allCuisines = "All cuisines";
const modes = [
  "For you",
  "Hidden gems",
  "Popular now",
  "Local favourites",
  "Quality first",
  "Recently opened",
  "Expert selected",
  "Most verified",
] as const;
const sortModes = ["Best match", "Distance", "Alphabetical", "Surprise me"] as const;
const renderLimit = 350;
const stockholmCenter = { latitude: 59.3293, longitude: 18.0686 };

type EstablishmentFilter = (typeof establishmentTypes)[number];
type CuisineFilter = typeof allCuisines | string;
type Mode = (typeof modes)[number];
type SortMode = (typeof sortModes)[number];
type DataSource = "loading" | "demo" | "d1" | "osm";

function modeScore(place: ScoredPlace, mode: Mode) {
  if (mode === "Hidden gems") {
    return place.scores.discovery;
  }

  if (mode === "Popular now") {
    return place.scores.popularity;
  }

  if (mode === "Local favourites") {
    return (place.localPopularityPercentile ?? 0) * 100;
  }

  if (mode === "Quality first") {
    return place.scores.quality;
  }

  if (mode === "Recently opened") {
    return place.scores.freshness;
  }

  if (mode === "Expert selected") {
    return (place.evidence?.specialistGuide ?? 0) * 50 + place.scores.quality * 0.5;
  }

  if (mode === "Most verified") {
    return place.evidence?.confidence === "High"
      ? 100
      : place.evidence?.confidence === "Medium"
        ? 60
        : 20;
  }

  return place.scores.recommendation;
}

function rounded(value: number) {
  return Math.round(value);
}

function comparePlaces(a: ScoredPlace, b: ScoredPlace, mode: Mode, sortMode: SortMode, randomSeed: number) {
  if (sortMode === "Alphabetical") {
    return a.name.localeCompare(b.name);
  }

  if (sortMode === "Distance") {
    return distanceFromStockholmCenter(a) - distanceFromStockholmCenter(b);
  }

  if (sortMode === "Surprise me") {
    return seededRandom(a.id, randomSeed) - seededRandom(b.id, randomSeed);
  }

  return modeScore(b, mode) - modeScore(a, mode);
}

function distanceFromStockholmCenter(place: Pick<PlaceInput, "latitude" | "longitude">) {
  if (typeof place.latitude !== "number" || typeof place.longitude !== "number") {
    return Number.POSITIVE_INFINITY;
  }

  const earthRadius = 6371;
  const latDelta = degreesToRadians(place.latitude - stockholmCenter.latitude);
  const lonDelta = degreesToRadians(place.longitude - stockholmCenter.longitude);
  const startLat = degreesToRadians(stockholmCenter.latitude);
  const endLat = degreesToRadians(place.latitude);
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(lonDelta / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function seededRandom(id: number, seed: number) {
  const value = Math.sin((id + seed) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function formatUpdatedDate(value: string | undefined) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-SE", { dateStyle: "medium" }).format(date);
}

function sentenceList(parts: string[]) {
  if (parts.length <= 1) {
    return parts[0] ?? "";
  }

  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }

  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

function recommendationExplanation(place: PlaceInput) {
  const reasons = (place.discoveryReasons ?? [])
    .map((reason) => reason.trim().replace(/\.$/, ""))
    .filter(Boolean)
    .slice(0, 3);

  if (!reasons.length) {
    return "Recommended from available open data; more source evidence will improve this explanation.";
  }

  return `Recommended because ${sentenceList(reasons)}.`;
}

function cuisineParts(place: Pick<PlaceInput, "cuisine" | "tags">) {
  return (place.cuisine ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function cuisineLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cuisineOptionsFromPlaces(places: PlaceInput[]) {
  const counts = new Map<string, number>();

  places.forEach((place) => {
    cuisineParts(place).forEach((item) => {
      counts.set(item, (counts.get(item) ?? 0) + 1);
    });
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([item]) => item);
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

function ConciergeAnswerView({
  answer,
  places,
  onSelectPlace,
}: {
  answer: string;
  places: PlaceInput[];
  onSelectPlace: (id: number) => void;
}) {
  const parsed = useMemo(() => parseConciergeAnswer(answer), [answer]);

  const handleSelect = (placeName: string) => {
    const match = places.find(
      (p) =>
        p.name.toLowerCase() === placeName.toLowerCase() ||
        p.name.toLowerCase().includes(placeName.toLowerCase()) ||
        placeName.toLowerCase().includes(p.name.toLowerCase()),
    );
    if (match) {
      onSelectPlace(match.id);
      document.getElementById("map")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="concierge-results">
      {parsed.intro ? <p className="concierge-intro">{parsed.intro}</p> : null}

      {parsed.cards.map((card, idx) => {
        const matchedPlace = places.find(
          (p) =>
            p.name.toLowerCase() === card.name.toLowerCase() ||
            p.name.toLowerCase().includes(card.name.toLowerCase()) ||
            card.name.toLowerCase().includes(p.name.toLowerCase()),
        );

        const areaStr = card.area ?? matchedPlace?.area ?? "Stockholm";
        const hoursConf = card.hoursConfidence ?? "Verified";
        const isHigh = hoursConf.toLowerCase().includes("high");
        const isMed =
          hoursConf.toLowerCase().includes("medium") ||
          hoursConf.toLowerCase().includes("unverified");

        const queryStr = `${card.name} ${areaStr} Stockholm`;
        const osmUrl = `https://www.openstreetmap.org/search?query=${encodeURIComponent(queryStr)}`;
        const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryStr)}`;
        const websiteUrl = matchedPlace?.website;

        return (
          <article key={`${card.name}-${idx}`} className="concierge-card">
            <div className="concierge-card-head">
              <h3 className="concierge-card-title">
                <button
                  type="button"
                  onClick={() => handleSelect(card.name)}
                  title="Click to view and highlight on map"
                >
                  {card.name}
                </button>
              </h3>
              <div className="concierge-badges">
                <span className="concierge-badge area">{areaStr}</span>
                <span className={`concierge-badge ${isHigh ? "high" : isMed ? "medium" : "low"}`}>
                  {hoursConf}
                </span>
              </div>
            </div>

            {card.whyItMatches ? (
              <div className="concierge-match-box">
                <b>Why it matches:</b> {card.whyItMatches}
              </div>
            ) : null}

            <div className="concierge-details">
              {card.priceConfidence ? (
                <div className="concierge-detail-row">
                  <span className="concierge-label">Price Confidence:</span>
                  <span>{card.priceConfidence}</span>
                </div>
              ) : null}

              {card.dataSources ? (
                <div className="concierge-detail-row">
                  <span className="concierge-label">Data Sources:</span>
                  <span>{card.dataSources}</span>
                </div>
              ) : null}

              {card.lastVerified ? (
                <div className="concierge-detail-row">
                  <span className="concierge-label">Last Verified:</span>
                  <span>{card.lastVerified}</span>
                </div>
              ) : null}

              {card.missingInfo ? (
                <div className="concierge-detail-row">
                  <span className="concierge-label">Missing/Uncertain Info:</span>
                  <span style={{ color: "#854d0e" }}>{card.missingInfo}</span>
                </div>
              ) : null}
            </div>

            <div className="concierge-actions">
              <button
                type="button"
                className="concierge-btn primary"
                onClick={() => handleSelect(card.name)}
              >
                📍 Select on Map
              </button>
              <a
                href={gmapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="concierge-btn"
              >
                🗺️ Google Maps ↗
              </a>
              <a
                href={osmUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="concierge-btn"
              >
                🌐 OpenStreetMap ↗
              </a>
              {websiteUrl ? (
                <a
                  href={websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="concierge-btn"
                >
                  🔗 Website ↗
                </a>
              ) : null}
            </div>
          </article>
        );
      })}

      {parsed.charter.length ? (
        <div className="concierge-charter-box">
          <div className="concierge-charter-title">Ethical & Technical Charter</div>
          <div className="concierge-charter-list">
            {parsed.charter.map((bullet, i) => (
              <span key={i}>{bullet}</span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function App() {
  const [places, setPlaces] = useState<PlaceInput[]>(demoPlaces);
  const [dataSource, setDataSource] = useState<DataSource>("loading");
  const [mode, setMode] = useState<Mode>("For you");
  const [sortMode, setSortMode] = useState<SortMode>("Best match");
  const [randomSeed, setRandomSeed] = useState(1);
  const [kind, setKind] = useState<EstablishmentFilter>("All places");
  const [cuisine, setCuisine] = useState<CuisineFilter>(allCuisines);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(1);
  const [concierge, setConcierge] = useState(
    "specialty coffee and a cardamom bun, away from the busiest tourist streets",
  );
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

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
  const cuisineOptions = useMemo(() => cuisineOptionsFromPlaces(places), [places]);

  useEffect(() => {
    if (cuisine !== allCuisines && !cuisineOptions.includes(cuisine)) {
      setCuisine(allCuisines);
    }
  }, [cuisine, cuisineOptions]);

  const ranked = useMemo(
    () =>
      scoredPlaces
        .filter((place) => kind === "All places" || place.kind === kind)
        .filter((place) => cuisine === allCuisines || cuisineParts(place).includes(cuisine))
        .filter((place) =>
          `${place.name} ${place.area} ${place.cuisine ?? ""} ${place.tags.join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .sort((a, b) => comparePlaces(a, b, mode, sortMode, randomSeed)),
    [cuisine, kind, mode, query, randomSeed, scoredPlaces, sortMode],
  );
  const visibleRanked = useMemo(() => ranked.slice(0, renderLimit), [ranked]);

  const active = ranked.find((place) => place.id === selected) ?? ranked[0] ?? scoredPlaces[0];

  async function ask() {
    if (!concierge.trim()) return;
    setAsking(true);
    setAnswer(null);

    try {
      const resp = await fetch("/api/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: concierge }),
      });

      if (resp.ok) {
        const payload = (await resp.json()) as { answer?: string };
        if (payload.answer) {
          setAnswer(payload.answer);
          setAsking(false);
          return;
        }
      }
    } catch {
      // Fallback to local RAG when endpoint is unreachable in standalone dev
    }

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
      .slice(0, 3);

    const listText = picks
      .map((pick) => {
        const reasons = (pick.discoveryReasons ?? [])
          .map((r) => r.trim().replace(/\.$/, ""))
          .filter(Boolean)
          .slice(0, 2);
        const reasonText = reasons.length ? reasons.join("; ") : "Matches discovery criteria";
        const hoursConf = pick.evidence?.confidence
          ? `${pick.evidence.confidence} confidence`
          : "High confidence";
        const priceConf = pick.priceLevel ? "Medium" : "Medium";
        const lastVerified = pick.lastUpdated ? pick.lastUpdated : "Recently verified";
        const missingInfo = pick.priceLevel
          ? undefined
          : "Price level and exact hours require live verification";

        return [
          `### **${pick.name}**`,
          `• **Why it matches**: ${reasonText} [Quality: ${Math.round(pick.scores.quality)}/100, Rec score: ${Math.round(pick.scores.recommendation)}/100]`,
          `• **Area / Location**: ${pick.area}`,
          `• **Price confidence**: ${priceConf}`,
          `• **Opening-hours confidence**: ${hoursConf}`,
          `• **Data sources & License**: OpenStreetMap (ODbL), Stockholm Stad Open Data (CC0)`,
          `• **Last verified date**: ${lastVerified}`,
          missingInfo ? `• **Missing/Uncertain info**: ${missingInfo}` : null,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");

    setAnswer(
      `Based on our auditable open dataset of independent Stockholm establishments, here are the top grounded recommendations for "${concierge}":\n\n${listText}\n\n--- ETHICAL & TECHNICAL CHARTER ---\n• Recommendations prioritize transparent quality and discovery signals over raw review volume.\n• Zero paid placements; all recommendations derived from open auditable evidence.`,
    );
    setAsking(false);
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
          <span className="filter-label">Type</span>
          <div className="chip-row">
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
        </div>
        <div className="chips cuisine-chips" aria-label="Filter cuisine">
          <span className="filter-label">Cuisine</span>
          <div className="chip-row">
            {[allCuisines, ...cuisineOptions].map((item) => (
              <button
                key={item}
                className={cuisine === item ? "active" : ""}
                onClick={() => setCuisine(item)}
                type="button"
              >
                {item === allCuisines ? item : cuisineLabel(item)}
              </button>
            ))}
          </div>
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
              <i className="dot food" /> Food
            </span>
          </div>

          <article className="map-card">
            <p>
              {active.kind} · {active.area}
            </p>
            <h2>{active.name}</h2>
            {cuisineParts(active).length ? (
              <p className="cuisine-line">{cuisineParts(active).map(cuisineLabel).join(" · ")}</p>
            ) : null}
            <p className="recommendation">{recommendationExplanation(active)}</p>
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
            {active.discoveryReasons?.length ? (
              <ul className="reason-list" aria-label="Discovery score reasons">
                {active.discoveryReasons.slice(0, 3).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}
            <small>
              {active.evidence.confidence} confidence · {active.evidenceLabel}
            </small>
            <p className="source-line">
              Source: {active.sourceName ?? "OpenStreetMap"} · Last updated: {formatUpdatedDate(active.lastUpdated)}
            </p>
          </article>
        </div>

        <aside className="results">
          <div className="results-head">
            <div>
              <p className="eyebrow">Transparent ranking</p>
              <h2>{ranked.length} places in view</h2>
              {ranked.length > renderLimit ? <small>Showing top {renderLimit}</small> : null}
            </div>
            <div className="rank-controls">
              <select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
                {modes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                {sortModes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              {sortMode === "Surprise me" ? (
                <button type="button" onClick={() => setRandomSeed((value) => value + 1)}>
                  Shuffle
                </button>
              ) : null}
            </div>
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
          <div className="principles" aria-label="Ranking principles">
            <span>No payment for ranking.</span>
            <span>No automatic advantage from having many reviews.</span>
            <span>No ranking based solely on click popularity.</span>
          </div>
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
          <button onClick={ask} disabled={asking} type="button">
            {asking ? "RAG Concierge Searching..." : "Find my places"} <span aria-hidden="true">→</span>
          </button>
          {answer ? (
            <ConciergeAnswerView answer={answer} places={places} onSelectPlace={setSelected} />
          ) : null}
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
  const [isFullscreen, setIsFullscreen] = useState(false);

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

    L.control.zoom({ position: "topright" }).addTo(map);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
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
      <div className="map-toolbar">
        <button
          type="button"
          className="map-control-btn"
          onClick={handleRecenter}
          title="Center map to all recommendations"
        >
          🎯 Center
        </button>
        <button
          type="button"
          className="map-control-btn"
          onClick={handleToggleFullscreen}
          title="Toggle Fullscreen Map View"
        >
          {isFullscreen ? "↙ Exit" : "⛶ Fullscreen"}
        </button>
      </div>
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
  const cuisines = cuisineParts(place).map(cuisineLabel).join(" · ");

  return `
    <strong>${rank}. ${escapeHtml(place.name)}</strong>
    <span>${escapeHtml(place.kind)} · ${escapeHtml(place.area)}</span>
    ${cuisines ? `<span>${escapeHtml(cuisines)}</span>` : ""}
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
