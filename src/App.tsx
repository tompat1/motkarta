"use client";

import { useMemo, useState } from "react";
import { demoPlaces } from "../lib/demo-places";
import {
  type EstablishmentType,
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

const modes = ["For you", "Hidden gems", "Popular now", "Quality first"] as const;

type EstablishmentFilter = (typeof establishmentTypes)[number];
type Mode = (typeof modes)[number];

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
  const [mode, setMode] = useState<Mode>("For you");
  const [kind, setKind] = useState<EstablishmentFilter>("All places");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(1);
  const [concierge, setConcierge] = useState(
    "specialty coffee and a cardamom bun, away from the busiest tourist streets",
  );
  const [answer, setAnswer] = useState<string | null>(null);

  const preferences = useMemo(() => preferencesFromQuery(query, kind), [kind, query]);
  const scoredPlaces = useMemo(
    () => demoPlaces.map((place) => scorePlace(place, preferences)),
    [preferences],
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

  const active = scoredPlaces.find((place) => place.id === selected) ?? ranked[0] ?? scoredPlaces[0];

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
    const picks = demoPlaces
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
          About the data
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
          <div className="map-grid">
            <div className="water water-one" />
            <div className="water water-two" />
            <span className="district d1">VASASTAN</span>
            <span className="district d2">NORRMALM</span>
            <span className="district d3">SODERMALM</span>
            <span className="district d4">DJURGARDEN</span>
            {ranked.map((place, index) => (
              <button
                aria-label={`Select ${place.name}`}
                key={place.id}
                onClick={() => setSelected(place.id)}
                className={`pin ${place.id === active.id ? "selected" : ""} kind-${place.kind
                  .replaceAll(" ", "-")
                  .toLowerCase()}`}
                style={{ left: `${place.x}%`, top: `${place.y}%` }}
                type="button"
              >
                <span>{index + 1}</span>
              </button>
            ))}
            <div className="legend">
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
            {ranked.map((place, index) => (
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
            This first local implementation uses a small demonstration set, but the scores are now
            computed from source, engagement, recency and specialty-coffee inputs.
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
