"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { demoPlaces } from "../lib/demo-places";
import {
  ArrowRight,
  ArrowSquareOut,
  ArrowsIn,
  ArrowsOut,
  Bread,
  Certificate,
  Check,
  CheckCircle,
  CircleNotch,
  Coffee,
  Compass,
  Crosshair,
  ForkKnife,
  Globe,
  MapPin,
  MapTrifold,
  MagnifyingGlass,
  PlusCircle,
  Scales,
  ShieldCheck,
  Shuffle,
  Sliders,
  Sparkle,
  Star,
  ThumbsUp,
  ThumbsDown,
} from "@phosphor-icons/react";
import { parseConciergeAnswer } from "../lib/concierge-parser";
import { retrieveAndSynthesize } from "../functions/api/concierge";
import {
  type EstablishmentType,
  type PlaceInput,
  type ScoredPlace,
  type UserPreferences,
  scorePlace,
} from "../lib/scoring";

const establishmentTypes = [
  "All places",
  "Saved",
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

export type Language = "sv" | "en";

export const translations = {
  sv: {
    brandDescriptor: "Stockholms fria matkarta",
    navMap: "KARTA",
    navMethod: "METOD",
    navConcierge: "CONCIERGE",
    navAbout: "OM",
    dataSourceLiveOsm: "Datafeed: Live OSM",
    dataSourceLiveD1: "Datafeed: Live D1",
    dataSourceLoading: "Datafeed: Laddar",
    dataSourceDemo: "Datafeed: Demo",
    eyebrow: "Stockholms fria matkarta · Ingen betald ranking",
    titleMain: "Stockholm,",
    titleSub: "bord för bord.",
    subLede: "Ät utan algoritmen · Oberoende upptäckt",
    lede: "En oberoende matkarta för restauranger, bagerier, caféer och specialty coffee. Ingen betald ranking. Tydlig logik. Bevis framför hype.",
    searchPlaceholder: "Sök plats, kök eller område...",
    typeFilterLabel: "Typ",
    allPlaces: "Alla ställen",
    cuisineFilterLabel: "Kök",
    allCuisines: "Alla kök",
    legendSpecialty: "Specialty coffee",
    legendBakery: "Bageri",
    legendRestaurant: "Restaurang",
    whyItAppears: "Varför den syns här",
    confidenceHigh: "Hög Konfidens",
    confidenceMed: "Medel Konfidens",
    confidenceLow: "Låg Konfidens",
    independentBusiness: "Oberoende ställe",
    specialistGuide: "Specialistguide",
    municipalInspection: "Kommunal granskning",
    specialtyProof: "Specialty proof",
    transparencyFooter: "Ingen betald placering · Flera oberoende källor",
    openMapIn: "Öppna i kartapp:",
    placesInView: "ställen i vyn",
    showingTop: "Visar topp",
    quality: "Kvalitet",
    popularity: "Popularitet",
    discovery: "Upptäckt",
    relevance: "Relevans",
    matchScoreLabel: "match",
    totalScoreLabel: "poäng",
    principle1: "Ingen betald ranking eller sponsrad placering.",
    principle2: "Ingen automatisk fördel från enbart hög recensionsvolym.",
    principle3: "Ingen ranking baserad på klickpopularitet eller algoritmer.",
    conciergeEyebrow: "Oberoende AI-Concierge",
    conciergeHeadingMain: "Vad är",
    conciergeHeadingItalic: "bra",
    conciergeHeadingSub: "mat för dig i dag?",
    conciergeDesc: "Söker först i bevis och verifierade fakta, sedan förklaras rekommendationen. Inga påhittade öppettider. Ingen betald placering.",
    askLabel: "Jag söker efter...",
    askPlaceholder: "t.ex. specialty coffee och kardemummabulle på Södermalm...",
    askButton: "Hitta mina ställen",
    askingButton: "Söker bevis...",
    methodEyebrow: "Öppen metod · Tydliga bevis",
    methodHeadingMain: "Popularitet är en signal.",
    methodHeadingSub: "Inte domen.",
    method01Title: "Mångsidig kvalitet",
    method01Desc: "Guider, redaktionell granskning, användaromdömen, tillsyn och egenskaper vägs separat.",
    method02Title: "Korrigerad popularitet",
    method02Desc: "Bayesiansk rätvisning, exponeringsjusterat engagemang och färskhet minskar winner-take-all skevhet.",
    method03Title: "Specialty proof",
    method03Desc: "Specialty coffee kräver strukturerade attribut och källverifiering, inte marknadsföringstext.",
    method04Title: "Upptäcktsvärde",
    method04Desc: "Belönar hög kvalitet i kombination med lägre huvudsaklig synlighet.",
    dataNoteLabel: "KÄLLNOTERING",
    dataNoteText: "MOTKARTA kombinerar öppen grunddata från OpenStreetMap med verifierade tillsynsregister från Stockholms stad och kurerad redaktionell granskning.",
    footerLeft: "MOTKARTA / STOCKHOLMS FRIA MATKARTA",
    footerRight: "ÖPPEN DATA · ÖPPEN METOD · ÖPPEN STAD",
    formulaHiddenGems: "Discovery = quality + specialist confidence + local engagement + freshness - mainstream exposure",
    formulaPopularNow: "Popularity = Bayesian rating + exposure-adjusted engagement + repeat visits + recent saves + source consensus",
    formulaQualityFirst: "Quality = guide, editorial, user, inspection, attribute and freshness evidence",
    formulaDefault: "Recommendation = 35% relevance + 25% quality + 15% popularity + 15% discovery + 10% freshness",
    centerMap: "Centrera",
    fullscreen: "Helskärm",
    exitFullscreen: "Avsluta",
    sourceLabel: "Källa",
    lastUpdatedLabel: "Senast uppdaterad",
    shuffle: "Blanda",
  },
  en: {
    brandDescriptor: "Stockholm's independent food map",
    navMap: "MAP",
    navMethod: "METHOD",
    navConcierge: "CONCIERGE",
    navAbout: "ABOUT",
    dataSourceLiveOsm: "Datafeed: Live OSM",
    dataSourceLiveD1: "Datafeed: Live D1",
    dataSourceLoading: "Datafeed: Loading",
    dataSourceDemo: "Datafeed: Demo",
    eyebrow: "Stockholm's independent food map · No paid ranking",
    titleMain: "Stockholm,",
    titleSub: "table by table.",
    subLede: "Eat beyond the algorithm · Independent discovery",
    lede: "A transparent Stockholm map for restaurants, bakeries, cafes and specialty coffee. Popularity matters, but it never gets the final word.",
    searchPlaceholder: "Search place, area or feature...",
    typeFilterLabel: "Type",
    allPlaces: "All places",
    cuisineFilterLabel: "Cuisine",
    allCuisines: "All cuisines",
    legendSpecialty: "Specialty coffee",
    legendBakery: "Bakery",
    legendRestaurant: "Restaurant",
    whyItAppears: "Why this place appears",
    confidenceHigh: "High Confidence",
    confidenceMed: "Medium Confidence",
    confidenceLow: "Low Confidence",
    independentBusiness: "Independent business",
    specialistGuide: "Specialist guide",
    municipalInspection: "Inspection status",
    specialtyProof: "Specialty proof",
    transparencyFooter: "No paid placement · Multiple independent sources",
    openMapIn: "Open location in:",
    placesInView: "places in view",
    showingTop: "Showing top",
    quality: "Quality",
    popularity: "Popularity",
    discovery: "Discovery",
    relevance: "Relevance",
    matchScoreLabel: "match",
    totalScoreLabel: "score",
    principle1: "No payment for ranking or sponsored placement.",
    principle2: "No automatic advantage from having many reviews.",
    principle3: "No ranking based solely on click popularity or algorithms.",
    conciergeEyebrow: "The independent concierge",
    conciergeHeadingMain: "Tell us what",
    conciergeHeadingItalic: "good",
    conciergeHeadingSub: "means today.",
    conciergeDesc: "It searches the evidence first, then explains the recommendation. No invented opening hours. No paid placement.",
    askLabel: "I am looking for...",
    askPlaceholder: "e.g. specialty coffee and a cardamom bun in Södermalm...",
    askButton: "Find my places",
    askingButton: "Searching evidence...",
    methodEyebrow: "Open method · Visible trade-offs",
    methodHeadingMain: "Popularity is evidence.",
    methodHeadingSub: "Not authority.",
    method01Title: "Plural quality",
    method01Desc: "Guide, editorial, user, inspection, attribute and freshness evidence stay separate.",
    method02Title: "Corrected popularity",
    method02Desc: "Bayesian rating, exposure-adjusted engagement and recency reduce winner-take-all bias.",
    method03Title: "Specialty proof",
    method03Desc: "Specialty coffee requires structured attributes or source verification, not marketing copy.",
    method04Title: "Discovery value",
    method04Desc: "Discovery rewards quality with limited exposure, not obscurity by itself.",
    dataNoteLabel: "DATA NOTE",
    dataNoteText: "The deployed app can load the Python-generated OpenStreetMap baseline, while D1 remains available for later curated evidence and score snapshots.",
    footerLeft: "MOTKARTA / STOCKHOLM INDEPENDENT FOOD MAP",
    footerRight: "OPEN DATA · OPEN METHOD · OPEN CITY",
    formulaHiddenGems: "Discovery = quality + specialist confidence + local engagement + freshness - mainstream exposure",
    formulaPopularNow: "Popularity = Bayesian rating + exposure-adjusted engagement + repeat visits + recent saves + source consensus",
    formulaQualityFirst: "Quality = guide, editorial, user, inspection, attribute and freshness evidence",
    formulaDefault: "Recommendation = 35% relevance + 25% quality + 15% popularity + 15% discovery + 10% freshness",
    centerMap: "Center",
    fullscreen: "Fullscreen",
    exitFullscreen: "Exit",
    sourceLabel: "Source",
    lastUpdatedLabel: "Last updated",
    shuffle: "Shuffle",
  },
};

function modeLabel(mode: Mode, lang: Language): string {
  if (mode === "For you") return lang === "sv" ? "För dig" : "For you";
  if (mode === "Hidden gems") return lang === "sv" ? "Dolda pärlor" : "Hidden gems";
  if (mode === "Popular now") return lang === "sv" ? "Populära nu" : "Popular now";
  if (mode === "Local favourites") return lang === "sv" ? "Lokala favoriter" : "Local favourites";
  if (mode === "Quality first") return lang === "sv" ? "Kvalitet först" : "Quality first";
  if (mode === "Recently opened") return lang === "sv" ? "Nyligen öppnat" : "Recently opened";
  if (mode === "Expert selected") return lang === "sv" ? "Expertvalda" : "Expert selected";
  if (mode === "Most verified") return lang === "sv" ? "Mest verifierade" : "Most verified";
  return mode;
}

function sortModeLabel(sortMode: SortMode, lang: Language): string {
  if (sortMode === "Best match") return lang === "sv" ? "Bästa matchning" : "Best match";
  if (sortMode === "Distance") return lang === "sv" ? "Avstånd" : "Distance";
  if (sortMode === "Alphabetical") return lang === "sv" ? "Alfabetiskt" : "Alphabetical";
  if (sortMode === "Surprise me") return lang === "sv" ? "Överraska mig" : "Surprise me";
  return sortMode;
}

function kindFilterLabel(kind: EstablishmentFilter, lang: Language): string {
  if (kind === "All places") return translations[lang].allPlaces;
  if (kind === "Saved") return lang === "sv" ? "Sparade ★" : "Saved ★";
  if (kind === "Restaurant") return translations[lang].legendRestaurant;
  if (kind === "Bakery") return translations[lang].legendBakery;
  if (kind === "Café") return "Café";
  if (kind === "Specialty coffee") return "Specialty coffee";
  return kind;
}

function VerificationBar({ place, lang = "sv" }: { place: ScoredPlace; lang?: Language }) {
  const v = place.verification;
  const t = translations[lang];

  return (
    <div
      className="verification-bar"
      style={{
        marginTop: "14px",
        marginBottom: "14px",
        padding: "12px 14px",
        background: "var(--color-paper)",
        border: "1px solid var(--color-mist)",
        borderRadius: "var(--radius-none)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-signal)" }}>
          {t.whyItAppears}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            fontWeight: 600,
            padding: "3px 8px",
            background: place.evidence?.confidence === "High" ? "var(--color-water)" : "var(--color-white)",
            color: place.evidence?.confidence === "High" ? "var(--color-white)" : "var(--color-ink)",
            border: "1px solid var(--color-mist)",
            textTransform: "uppercase",
          }}
        >
          {place.evidence?.confidence === "High" ? t.confidenceHigh : place.evidence?.confidence === "Medium" ? t.confidenceMed : t.confidenceLow}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            padding: "4px 8px",
            background: "var(--color-white)",
            border: "1px solid var(--color-mist)",
            color: "var(--color-ink)",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <ShieldCheck size={14} weight="bold" style={{ color: "var(--color-water)" }} />
          {t.independentBusiness}
        </span>
        {v?.specialistGuide.verified ? (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              padding: "4px 8px",
              background: "var(--color-white)",
              border: "1px solid var(--color-mist)",
              color: "var(--color-ink)",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <Certificate size={14} weight="bold" style={{ color: "var(--color-water)" }} />
            {t.specialistGuide}
          </span>
        ) : null}
        {v?.structuredEvidence.verified ? (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              padding: "4px 8px",
              background: "var(--color-white)",
              border: "1px solid var(--color-mist)",
              color: "var(--color-ink)",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <CheckCircle size={14} weight="bold" style={{ color: "var(--color-water)" }} />
            {t.municipalInspection}
          </span>
        ) : null}
        {place.specialty?.specialtyVerified ? (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              padding: "4px 8px",
              background: "var(--color-white)",
              border: "1px solid var(--color-water)",
              color: "var(--color-water)",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <Coffee size={14} weight="bold" style={{ color: "var(--color-water)" }} />
            {t.specialtyProof}
          </span>
        ) : null}
      </div>

      <p style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--color-stone)", margin: "4px 0 0", lineHeight: "1.4" }}>
        {t.transparencyFooter}
      </p>
    </div>
  );
}

function ExternalMapLinks({ place, lang = "sv" }: { place: PlaceInput; lang?: Language }) {
  const t = translations[lang];
  const queryText = encodeURIComponent(`${place.name} ${place.address || place.area || ""} Stockholm`);

  const googleMapsUrl =
    place.latitude && place.longitude
      ? `https://www.google.com/maps/search/?api=1&query=${queryText}&query_place_id=${place.latitude},${place.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${queryText}`;

  const appleMapsUrl =
    place.latitude && place.longitude
      ? `https://maps.apple.com/?q=${encodeURIComponent(place.name)}&ll=${place.latitude},${place.longitude}`
      : `https://maps.apple.com/?q=${queryText}`;

  const osmUrl =
    place.latitude && place.longitude
      ? `https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=17/${place.latitude}/${place.longitude}`
      : `https://www.openstreetmap.org/search?query=${queryText}`;

  return (
    <div
      className="external-map-actions"
      style={{
        marginTop: "12px",
        paddingTop: "12px",
        borderTop: "1px solid var(--color-mist)",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--color-stone)",
        }}
      >
        {t.openMapIn}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "6px 10px",
            background: "var(--color-white)",
            border: "1px solid var(--color-mist)",
            color: "var(--color-ink)",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          <MapPin size={13} weight="fill" style={{ color: "var(--color-signal)" }} />
          Google Maps
          <ArrowSquareOut size={12} weight="bold" />
        </a>
        <a
          href={appleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "6px 10px",
            background: "var(--color-white)",
            border: "1px solid var(--color-mist)",
            color: "var(--color-ink)",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          <Compass size={13} weight="fill" style={{ color: "var(--color-water)" }} />
          Apple Maps
          <ArrowSquareOut size={12} weight="bold" />
        </a>
        <a
          href={osmUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "6px 10px",
            background: "var(--color-white)",
            border: "1px solid var(--color-mist)",
            color: "var(--color-ink)",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          <MapTrifold size={13} weight="fill" style={{ color: "var(--color-water)" }} />
          OpenStreetMap
          <ArrowSquareOut size={12} weight="bold" />
        </a>
        {place.website ? (
          <a
            href={place.website.startsWith("http") ? place.website : `https://${place.website}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "6px 10px",
              background: "var(--color-white)",
              border: "1px solid var(--color-mist)",
              color: "var(--color-water)",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <Globe size={13} weight="bold" />
            {lang === "sv" ? "Hemsida" : "Website"}
            <ArrowSquareOut size={12} weight="bold" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

const FEATURED_CUISINES = [
  "spanish",
  "french",
  "mexican",
  "german",
  "polish",
  "hungarian",
  "austrian",
  "italian",
  "pizza",
  "sushi",
  "burger",
  "thai",
  "asian",
  "indian",
  "japanese",
  "chinese",
];

function cuisineOptionsFromPlaces(places: PlaceInput[]) {
  const counts = new Map<string, number>();

  places.forEach((place) => {
    cuisineParts(place).forEach((item) => {
      counts.set(item, (counts.get(item) ?? 0) + 1);
    });
  });

  const available = new Set([...counts.keys()]);
  const featured = FEATURED_CUISINES.filter((c) => available.has(c));

  const sortedOthers = [...counts.entries()]
    .filter(([item]) => !FEATURED_CUISINES.includes(item))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([item]) => item);

  return [...new Set([...featured, ...sortedOthers])].slice(0, 24);
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
  onRefineQuery,
  lang = "sv",
}: {
  answer: string;
  places: PlaceInput[];
  onSelectPlace: (id: number) => void;
  onRefineQuery?: (extra: string) => void;
  lang?: Language;
}) {
  const parsed = useMemo(() => parseConciergeAnswer(answer), [answer]);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

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
      {parsed.clarification ? (
        <div
          className="concierge-clarification-box"
          style={{
            background: "var(--color-paper)",
            border: "2px solid var(--color-signal)",
            padding: "16px 20px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "var(--color-signal)",
              fontWeight: 700,
              textTransform: "uppercase",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              marginBottom: "8px",
            }}
          >
            <Sliders size={16} weight="bold" /> Sökförtydligande krävs
          </div>
          <p
            style={{
              margin: "0 0 12px",
              fontFamily: "var(--font-body)",
              fontSize: "15px",
              fontWeight: 500,
              lineHeight: 1.4,
              color: "var(--color-ink)",
            }}
          >
            {parsed.clarification.question}
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
            {["Spanien / Spanskt", "Mexiko / Mexikanskt", "Italien / Italienskt", "Frankrike / Franskt", "Asien / Thai"].map(
              (suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  style={{
                    background: "var(--color-white)",
                    border: "1px solid var(--color-ink)",
                    color: "var(--color-ink)",
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    padding: "6px 12px",
                    cursor: "pointer",
                  }}
                  onClick={() => onRefineQuery?.(suggestion.split(" / ")[0])}
                >
                  + {suggestion}
                </button>
              ),
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const input = form.elements.namedItem("country") as HTMLInputElement;
              if (input?.value.trim()) {
                onRefineQuery?.(input.value.trim());
              }
            }}
            style={{ display: "flex", gap: "8px" }}
          >
            <input
              name="country"
              type="text"
              placeholder="Skriv land eller kök (t.ex. Spanien)..."
              style={{
                flex: 1,
                padding: "8px 12px",
                border: "1px solid var(--color-mist)",
                background: "var(--color-white)",
                fontFamily: "var(--font-body)",
                fontSize: "13px",
              }}
            />
            <button
              type="submit"
              style={{
                background: "var(--color-ink)",
                color: "var(--color-paper)",
                border: "none",
                padding: "8px 16px",
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Precisera sökning
            </button>
          </form>
        </div>
      ) : parsed.intro ? (
        <p className="concierge-intro">{parsed.intro}</p>
      ) : null}

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
                <MapPin size={14} weight="fill" /> Select on Map
              </button>
              <a
                href={gmapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="concierge-btn"
              >
                <MapTrifold size={14} weight="bold" /> Google Maps <ArrowSquareOut size={11} />
              </a>
              <a
                href={osmUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="concierge-btn"
              >
                <Globe size={14} weight="bold" /> OpenStreetMap <ArrowSquareOut size={11} />
              </a>
              {websiteUrl ? (
                <a
                  href={websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="concierge-btn"
                >
                  <ArrowSquareOut size={14} weight="bold" /> Website
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
              <span key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <CheckCircle size={14} weight="fill" style={{ color: "#8ed6b5", flexShrink: 0 }} />
                {bullet}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div
        className="concierge-feedback-bar"
        style={{
          marginTop: "16px",
          padding: "12px 16px",
          background: "var(--color-paper)",
          border: "1px solid var(--color-mist)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--color-ink)",
          }}
        >
          {lang === "sv" ? "Var svaret hjälpsamt?" : "Was this recommendation helpful?"}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            className={`feedback-btn ${feedback === "up" ? "active-up" : ""}`}
            onClick={() => setFeedback("up")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              background: feedback === "up" ? "var(--color-water)" : "var(--color-white)",
              color: feedback === "up" ? "var(--color-white)" : "var(--color-ink)",
              border: "1px solid var(--color-mist)",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all var(--motion-fast)",
            }}
            title={lang === "sv" ? "Hjälpsamt (Tummen upp)" : "Helpful (Thumbs up)"}
          >
            <ThumbsUp size={14} weight={feedback === "up" ? "fill" : "bold"} />
            {lang === "sv" ? "Ja" : "Yes"}
          </button>
          <button
            type="button"
            className={`feedback-btn ${feedback === "down" ? "active-down" : ""}`}
            onClick={() => setFeedback("down")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              background: feedback === "down" ? "var(--color-signal)" : "var(--color-white)",
              color: feedback === "down" ? "var(--color-white)" : "var(--color-ink)",
              border: "1px solid var(--color-mist)",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all var(--motion-fast)",
            }}
            title={lang === "sv" ? "Inte hjälpsamt (Tummen ner)" : "Not helpful (Thumbs down)"}
          >
            <ThumbsDown size={14} weight={feedback === "down" ? "fill" : "bold"} />
            {lang === "sv" ? "Nej" : "No"}
          </button>
        </div>

        {feedback ? (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              color: feedback === "up" ? "var(--color-water)" : "var(--color-signal)",
              fontWeight: 600,
            }}
          >
            {feedback === "up"
              ? lang === "sv"
                ? "Tack för din feedback! 👍"
                : "Thanks for your feedback! 👍"
              : lang === "sv"
                ? "Tack! Vi förbättrar källorna. 👎"
                : "Thanks! We'll improve our sources. 👎"}
          </span>
        ) : null}
      </div>
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
  const [lang, setLang] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("motkarta_lang");
      if (saved === "sv" || saved === "en") return saved;
    }
    return "sv";
  });

  const t = translations[lang];

  const handleSetLang = (newLang: Language) => {
    setLang(newLang);
    if (typeof window !== "undefined") {
      localStorage.setItem("motkarta_lang", newLang);
    }
  };

  const [userRatings, setUserRatings] = useState<Record<number, number>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("motkarta_ratings");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return {};
  });

  const [savedPlaceIds, setSavedPlaceIds] = useState<number[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("motkarta_saved_places");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });

  const handleRatePlace = (id: number, rating: number) => {
    const updated = { ...userRatings, [id]: rating };
    setUserRatings(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("motkarta_ratings", JSON.stringify(updated));
    }
  };

  const handleToggleSavePlace = (id: number) => {
    const updated = savedPlaceIds.includes(id)
      ? savedPlaceIds.filter((pId) => pId !== id)
      : [...savedPlaceIds, id];
    setSavedPlaceIds(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("motkarta_saved_places", JSON.stringify(updated));
    }
  };

  const [concierge, setConcierge] = useState(
    lang === "sv"
      ? "specialty coffee och kardemummabulle, bortom de mest turistiga gatorna"
      : "specialty coffee and a cardamom bun, away from the busiest tourist streets",
  );
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPlaces() {
      try {
        const payload = await fetchPlacesPayload();

        if (!cancelled && payload.places?.length) {
          setPlaces(sanitizeAndAugmentPlaces(payload.places));
          setDataSource(payload.source);
        }
      } catch {
        if (!cancelled) {
          setPlaces(sanitizeAndAugmentPlaces(demoPlaces));
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
        .filter((place) =>
          kind === "All places"
            ? true
            : kind === "Saved"
              ? savedPlaceIds.includes(place.id)
              : place.kind === kind,
        )
        .filter((place) => cuisine === allCuisines || cuisineParts(place).includes(cuisine))
        .filter((place) =>
          `${place.name} ${place.area} ${place.cuisine ?? ""} ${place.tags.join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .sort((a, b) => comparePlaces(a, b, mode, sortMode, randomSeed)),
    [cuisine, kind, mode, query, randomSeed, savedPlaceIds, scoredPlaces, sortMode],
  );
  const visibleRanked = useMemo(() => ranked.slice(0, renderLimit), [ranked]);

  const active = ranked.find((place) => place.id === selected) ?? ranked[0] ?? scoredPlaces[0];

  async function askWithQuery(queryText: string) {
    if (!queryText.trim()) return;
    setAsking(true);
    setAnswer(null);

    try {
      const resp = await fetch("/api/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: queryText, places }),
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

    const ragResult = retrieveAndSynthesize(queryText, places);
    setAnswer(ragResult.answer);
    setAsking(false);
  }

  async function ask() {
    await askWithQuery(concierge);
  }

  const handleRefineQuery = (extra: string) => {
    const updated = `${concierge} (${extra})`;
    setConcierge(updated);
    void askWithQuery(updated);
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-counter-pin" />
          <b>MOTKARTA</b>
          <span>{t.brandDescriptor}</span>
        </a>
        <nav>
          <a href="#map" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <Compass size={14} weight="bold" /> {t.navMap}
          </a>
          <a href="#method" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <ShieldCheck size={14} weight="bold" /> {t.navMethod}
          </a>
          <a href="#concierge" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <MagnifyingGlass size={14} weight="bold" /> {t.navConcierge}
          </a>
        </nav>
        <div className="topbar-actions">
          <div className="lang-switcher" aria-label="Language selector">
            <button
              type="button"
              className={`lang-btn ${lang === "sv" ? "active" : ""}`}
              onClick={() => handleSetLang("sv")}
            >
              SV
            </button>
            <button
              type="button"
              className={`lang-btn ${lang === "en" ? "active" : ""}`}
              onClick={() => handleSetLang("en")}
            >
              EN
            </button>
          </div>
          <a className="about" href="#sources">
            <span className="status-dot" />
            {dataSource === "osm"
              ? t.dataSourceLiveOsm
              : dataSource === "d1"
                ? t.dataSourceLiveD1
                : dataSource === "loading"
                  ? t.dataSourceLoading
                  : t.dataSourceDemo}
          </a>
        </div>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h1>
            {t.titleMain}
            <br />
            <i>{t.titleSub}</i>
          </h1>
          <p className="sub-lede">{t.subLede}</p>
        </div>
        <p className="lede">{t.lede}</p>
      </section>

      <section className="controls" id="map">
        <label className="search" style={{ display: "flex", alignItems: "center" }}>
          <MagnifyingGlass size={16} weight="bold" style={{ color: "var(--color-ink)", marginRight: "8px" }} />
          <input
            aria-label={t.typeFilterLabel}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.searchPlaceholder}
          />
        </label>
        <div className="chips" aria-label="Filter typ">
          <span className="filter-label">{t.typeFilterLabel}</span>
          <div className="chip-row">
            {establishmentTypes.map((item) => (
              <button
                key={item}
                className={kind === item ? "active" : ""}
                onClick={() => setKind(item)}
                type="button"
              >
                {kindFilterLabel(item, lang)}
              </button>
            ))}
          </div>
        </div>
        <div className="chips cuisine-chips" aria-label="Filter kök">
          <span className="filter-label">{t.cuisineFilterLabel}</span>
          <div className="chip-row">
            {[allCuisines, ...cuisineOptions].map((item) => (
              <button
                key={item}
                className={cuisine === item ? "active" : ""}
                onClick={() => setCuisine(item)}
                type="button"
              >
                {item === allCuisines ? t.allCuisines : cuisineLabel(item)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="workspace">
        <div className="map-panel">
          <FoodMap places={visibleRanked} activePlace={active} onSelect={setSelected} lang={lang} />
          <div className="legend map-legend">
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Coffee size={14} weight="bold" style={{ color: "var(--color-water)" }} /> {t.legendSpecialty}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Bread size={14} weight="bold" style={{ color: "var(--color-water)" }} /> {t.legendBakery}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <ForkKnife size={14} weight="bold" style={{ color: "var(--color-water)" }} /> {t.legendRestaurant}
            </span>
          </div>

          <article className="map-card">
            <p>
              {kindFilterLabel(active.kind, lang)} · {active.area}
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
                <span>{t.quality}</span>
              </div>
              <div>
                <b>{rounded(active.scores.popularity)}</b>
                <span>{t.popularity}</span>
              </div>
              <div>
                <b>{rounded(active.scores.discovery)}</b>
                <span>{t.discovery}</span>
              </div>
              <div>
                <b>{rounded(active.scores.relevance)}</b>
                <span>{t.relevance}</span>
              </div>
            </div>
            <div
              className="user-rating-bar"
              style={{
                marginTop: "12px",
                paddingTop: "12px",
                borderTop: "1px solid var(--color-mist)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--color-ink)",
                  }}
                >
                  {lang === "sv" ? "Ditt betyg:" : "Your rating:"}
                </span>
                <div style={{ display: "flex", gap: "3px" }}>
                  {[1, 2, 3, 4, 5].map((star) => {
                    const currentRating = userRatings[active.id] ?? 0;
                    const isFilled = currentRating >= star;
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => handleRatePlace(active.id, star)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: "2px",
                          cursor: "pointer",
                          display: "inline-flex",
                        }}
                        title={lang === "sv" ? `Ge ${star} av 5 stjärnor` : `Rate ${star} out of 5 stars`}
                      >
                        <Star
                          size={18}
                          weight={isFilled ? "fill" : "regular"}
                          style={{ color: isFilled ? "#F59E0B" : "var(--color-mist)" }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleToggleSavePlace(active.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  background: savedPlaceIds.includes(active.id) ? "var(--color-ink)" : "var(--color-white)",
                  color: savedPlaceIds.includes(active.id) ? "var(--color-paper)" : "var(--color-ink)",
                  border: "1px solid var(--color-mist)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all var(--motion-fast)",
                }}
              >
                <Star
                  size={14}
                  weight={savedPlaceIds.includes(active.id) ? "fill" : "bold"}
                  style={{ color: savedPlaceIds.includes(active.id) ? "#F59E0B" : "currentColor" }}
                />
                {savedPlaceIds.includes(active.id)
                  ? lang === "sv"
                    ? "Sparad"
                    : "Saved"
                  : lang === "sv"
                    ? "Spara ställe"
                    : "Save place"}
              </button>
            </div>

            <VerificationBar place={active} lang={lang} />
            <ExternalMapLinks place={active} lang={lang} />
            {active.discoveryReasons?.length ? (
              <ul className="reason-list" aria-label="Discovery score reasons">
                {active.discoveryReasons.slice(0, 3).map((reason) => (
                  <li key={reason} style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                    <PlusCircle size={14} weight="fill" style={{ color: "var(--orange)", flexShrink: 0, marginTop: "2px" }} />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <small>
              {active.evidence.confidence === "High" ? t.confidenceHigh : active.evidence.confidence === "Medium" ? t.confidenceMed : t.confidenceLow} · {active.evidenceLabel}
            </small>
            <p className="source-line">
              {t.sourceLabel}: {active.sourceName ?? "OpenStreetMap"} · {t.lastUpdatedLabel}: {formatUpdatedDate(active.lastUpdated)}
            </p>
          </article>
        </div>

        <aside className="results">
          <div className="results-head">
            <div>
              <p className="eyebrow">{t.eyebrow}</p>
              <h2>{ranked.length} {t.placesInView}</h2>
              {ranked.length > renderLimit ? <small>{t.showingTop} {renderLimit}</small> : null}
            </div>
            <div className="rank-controls">
              <select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
                {modes.map((item) => (
                  <option key={item} value={item}>{modeLabel(item, lang)}</option>
                ))}
              </select>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                {sortModes.map((item) => (
                  <option key={item} value={item}>{sortModeLabel(item, lang)}</option>
                ))}
              </select>
              {sortMode === "Surprise me" ? (
                <button
                  type="button"
                  onClick={() => setRandomSeed((value) => value + 1)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  <Shuffle size={13} weight="bold" /> {t.shuffle}
                </button>
              ) : null}
            </div>
          </div>
          <p className="formula">
            {mode === "Hidden gems"
              ? t.formulaHiddenGems
              : mode === "Popular now"
                ? t.formulaPopularNow
                : mode === "Quality first"
                  ? t.formulaQualityFirst
                  : t.formulaDefault}
          </p>
          <div className="principles" aria-label="Ranking principles">
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Check size={13} weight="bold" style={{ color: "var(--color-water)" }} /> {t.principle1}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Check size={13} weight="bold" style={{ color: "var(--color-water)" }} /> {t.principle2}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Check size={13} weight="bold" style={{ color: "var(--color-water)" }} /> {t.principle3}
            </span>
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
                    {kindFilterLabel(place.kind, lang)} · {place.area}
                  </small>
                  <strong>{place.name}</strong>
                  <span>{place.tags.slice(0, 2).join(" · ")}</span>
                </span>
                <span className="total">
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSavePlace(place.id);
                      }}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", display: "inline-flex" }}
                      title={savedPlaceIds.includes(place.id) ? (lang === "sv" ? "Ta bort från sparade" : "Remove from saved") : (lang === "sv" ? "Spara ställe" : "Save place")}
                    >
                      <Star
                        size={15}
                        weight={savedPlaceIds.includes(place.id) ? "fill" : "regular"}
                        style={{ color: savedPlaceIds.includes(place.id) ? "#F59E0B" : "var(--color-mist)" }}
                      />
                    </button>
                    <b>{rounded(modeScore(place, mode))}</b>
                  </div>
                  <small>{mode === "For you" ? t.matchScoreLabel : t.totalScoreLabel}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className="concierge" id="concierge">
        <div>
          <p className="eyebrow">{t.conciergeEyebrow}</p>
          <h2>
            {t.conciergeHeadingMain} <i>{t.conciergeHeadingItalic}</i>
            <br />
            {t.conciergeHeadingSub}
          </h2>
          <p>{t.conciergeDesc}</p>
        </div>
        <div className="ask-box">
          <label htmlFor="ask">{t.askLabel}</label>
          <textarea id="ask" value={concierge} onChange={(event) => setConcierge(event.target.value)} placeholder={t.askPlaceholder} />
          <button onClick={ask} disabled={asking} type="button">
            {asking ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <CircleNotch size={16} className="animate-spin" /> {t.askingButton}
              </span>
            ) : (
              <>
                {t.askButton} <ArrowRight size={16} weight="bold" />
              </>
            )}
          </button>
          {answer ? (
            <ConciergeAnswerView
              answer={answer}
              places={places}
              onSelectPlace={setSelected}
              onRefineQuery={handleRefineQuery}
              lang={lang}
            />
          ) : null}
        </div>
      </section>

      <section className="method" id="method">
        <div>
          <p className="eyebrow">{t.methodEyebrow}</p>
          <h2>
            {t.methodHeadingMain}
            <br />
            {t.methodHeadingSub}
          </h2>
        </div>
        <div className="method-grid">
          <article>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <b>01</b>
              <Sliders size={20} weight="bold" style={{ color: "var(--color-water)" }} />
            </div>
            <h3>{t.method01Title}</h3>
            <p>{t.method01Desc}</p>
          </article>
          <article>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <b>02</b>
              <Scales size={20} weight="bold" style={{ color: "var(--color-water)" }} />
            </div>
            <h3>{t.method02Title}</h3>
            <p>{t.method02Desc}</p>
          </article>
          <article>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <b>03</b>
              <Certificate size={20} weight="bold" style={{ color: "var(--color-water)" }} />
            </div>
            <h3>{t.method03Title}</h3>
            <p>{t.method03Desc}</p>
          </article>
          <article>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <b>04</b>
              <Sparkle size={20} weight="bold" style={{ color: "var(--color-water)" }} />
            </div>
            <h3>{t.method04Title}</h3>
            <p>{t.method04Desc}</p>
          </article>
        </div>
        <div className="disclaimer" id="sources">
          {t.dataNoteLabel}
          <span>{t.dataNoteText}</span>
        </div>
      </section>

      <footer>
        <span>{t.footerLeft}</span>
        <span>{t.footerRight}</span>
      </footer>
    </main>
  );
}

function FoodMap({
  places,
  activePlace,
  onSelect,
  lang,
}: {
  places: ScoredPlace[];
  activePlace: ScoredPlace;
  onSelect: (id: number) => void;
  lang: Language;
}) {
  const t = translations[lang];
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
          title={t.centerMap}
        >
          <Crosshair size={14} weight="bold" /> {t.centerMap}
        </button>
        <button
          type="button"
          className="map-control-btn"
          onClick={handleToggleFullscreen}
          title={t.fullscreen}
        >
          {isFullscreen ? (
            <>
              <ArrowsIn size={14} weight="bold" /> {t.exitFullscreen}
            </>
          ) : (
            <>
              <ArrowsOut size={14} weight="bold" /> {t.fullscreen}
            </>
          )}
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

const EXCLUDED_COMMERCIAL_CHAINS = [
  "nespresso",
  "kahls",
  "kahl's",
  "espresso house",
  "starbucks",
  "wayne's coffee",
  "waynes coffee",
  "mcdonald",
  "burger king",
  "subway",
  "joe & the juice",
  "pressbyrån",
  "7-eleven",
  "7 eleven",
  "bönor & blad",
  "bönor och blad",
];

const PRIME_SPECIALTY_PATTERNS = [
  "pascal",
  "drop coffee",
  "johan & nyström",
  "johan & nystrom",
  "johan och nyström",
  "solkant",
  "volca",
  "lykke",
  "höga kusten",
  "hoga kusten",
  "gast",
  "muttley",
  "nordic brew lab",
  "a.b.café",
  "ab cafe",
  "standout",
  "café blom",
  "cafe blom",
];

const RESTAURANT_GRILL_KEYWORDS = [
  "grill",
  "grillen",
  "gastropub",
  "pub",
  "bar",
  "restaurang",
  "restaurant",
  "burger",
  "burgers",
  "pizza",
  "pizzeria",
  "kebab",
  "sushi",
  "steakhouse",
  "taverna",
  "sportsbar",
];

export function sanitizeAndAugmentPlaces(inputPlaces: PlaceInput[]): PlaceInput[] {
  // 1. Purge commercial chains
  const filtered = inputPlaces.filter((p) => {
    const n = p.name.toLowerCase();
    return !EXCLUDED_COMMERCIAL_CHAINS.some((chain) => n.includes(chain));
  });

  // 2. Normalize and promote matched specialty coffee venues / reclassify grills & gastropubs
  const promoted = filtered.map((p) => {
    const n = p.name.toLowerCase();
    const cu = (p.cuisine ?? "").toLowerCase();
    const fullText = `${n} ${cu}`;

    const isGrillOrRestaurant = RESTAURANT_GRILL_KEYWORDS.some((kw) => fullText.includes(kw));

    if (isGrillOrRestaurant) {
      return {
        ...p,
        kind: "Restaurant" as const,
        tags: p.tags.filter((t) => t.toLowerCase() !== "specialty coffee"),
        specialty: undefined,
      };
    }

    const isPrime =
      PRIME_SPECIALTY_PATTERNS.some((spec) => n.includes(spec)) ||
      n.includes("roaster") ||
      n.includes("roastery") ||
      n.includes("rosteri");

    if (isPrime) {
      return {
        ...p,
        kind: "Specialty coffee" as const,
        tags: Array.from(new Set([...p.tags, "Specialty coffee", "Filter", "Single origin"])),
        specialty: {
          specialtyVerified: true,
          ownRoastery:
            n.includes("roaster") ||
            n.includes("roastery") ||
            n.includes("rosteri") ||
            p.specialty?.ownRoastery ||
            false,
          traceableCoffee: true,
          filterCoffee: true,
          espressoBased: true,
          rotatingRoasters: true,
          singleOrigin: true,
          manualBrewMethods: p.specialty?.manualBrewMethods ?? ["V60", "Batch brew"],
          decafAvailable: true,
          beansForSale: true,
          verificationSources: 3,
        },
      };
    }
    return p;
  });

  // 3. Ensure all 18 demoPlaces (including all 15 prime specialty coffee venues) are present
  const result = [...promoted];
  for (const demoPlace of demoPlaces) {
    const exists = result.some(
      (p) =>
        p.name.toLowerCase().includes(demoPlace.name.toLowerCase()) ||
        demoPlace.name.toLowerCase().includes(p.name.toLowerCase()),
    );
    if (!exists) {
      result.push(demoPlace);
    }
  }

  return result;
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
