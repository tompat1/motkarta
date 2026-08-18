"use client";

import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { demoPlaces } from "../lib/demo-places";
import {
  ArrowRight,
  ArrowSquareOut,
  ArrowsIn,
  ArrowsOut,
  Bread,
  Certificate,
  ChatTeardropText,
  Check,
  CaretLeft,
  CaretRight,
  CheckCircle,
  CircleNotch,
  Coffee,
  Compass,
  Crosshair,
  ForkKnife,
  Globe,
  Image,
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
  fetchPlacePhotos,
  fetchPlaceReviews,
  addUserReview,
  addUserPhoto,
  loadUserStoredMedia,
  type PlacePhoto,
  type PlaceReview,
  type PlaceContext,
} from "../lib/lazy-media";
import {
  type EstablishmentType,
  type PlaceInput,
  type ScoredPlace,
  type UserPreferences,
  scorePlace,
} from "../lib/scoring";
import { DEFAULT_CONCIERGE_PROMPTS, DEFAULT_CURATED_SOURCES } from "../lib/db-sources-prompts";

const establishmentTypes = [
  "All places",
  "Curated",
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

function comparePlaces(
  a: ScoredPlace,
  b: ScoredPlace,
  mode: Mode,
  sortMode: SortMode,
  randomSeed: number,
  userCenter: { latitude: number; longitude: number } = stockholmCenter
) {
  if (sortMode === "Alphabetical") {
    return a.name.localeCompare(b.name, "sv");
  }

  if (sortMode === "Distance") {
    return distanceFromPoint(a, userCenter) - distanceFromPoint(b, userCenter);
  }

  if (sortMode === "Surprise me") {
    return seededRandom(a.id, randomSeed) - seededRandom(b.id, randomSeed);
  }

  return modeScore(b, mode) - modeScore(a, mode);
}

function distanceFromPoint(
  place: Pick<PlaceInput, "latitude" | "longitude">,
  center: { latitude: number; longitude: number } = stockholmCenter
) {
  if (typeof place.latitude !== "number" || typeof place.longitude !== "number") {
    return Number.POSITIVE_INFINITY;
  }

  const earthRadius = 6371;
  const latDelta = degreesToRadians(place.latitude - center.latitude);
  const lonDelta = degreesToRadians(place.longitude - center.longitude);
  const startLat = degreesToRadians(center.latitude);
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

export const POPULAR_CONCIERGE_PROMPTS = DEFAULT_CONCIERGE_PROMPTS;

export const STOCKHOLM_REGIONS = [
  { label: "Södermalm (Söder)", value: "Södermalm", aliases: ["söder", "södermalm", "sofo", "zinken", "mariatorget", "nytorget", "hornstull", "skanstull"] },
  { label: "Gamla Stan", value: "Gamla Stan", aliases: ["gamla stan", "gamlastan", "baggensgatan"] },
  { label: "Vasastan", value: "Vasastan", aliases: ["vasastan", "vasastaden", "birkastan", "st eriksplan", "odenplan", "rörstrandsgatan"] },
  { label: "Birkastan", value: "Birkastan", aliases: ["birkastan", "rörstrandsgatan", "vasastan"] },
  { label: "City / Norrmalm", value: "Norrmalm", aliases: ["city", "norrmalm", "t-centralen", "hötorget", "klara"] },
  { label: "Östermalm", value: "Östermalm", aliases: ["östermalm", "ostermalm", "stureplan"] },
  { label: "Kungsholmen", value: "Kungsholmen", aliases: ["kungsholmen", "fridhemsplan", "kronobergsgatan"] },
  { label: "Djurgården", value: "Djurgården", aliases: ["djurgården", "djurgarden"] },
] as const;

export const SEARCH_CUISINE_SUGGESTIONS = [
  { label: "Specialty Coffee", value: "Specialty Coffee", badge: "Kaffe" },
  { label: "Mexikanskt / Tacos", value: "Mexican", badge: "Kök" },
  { label: "Surdegsbageri & Bullar", value: "Bakery", badge: "Bageri" },
  { label: "Franskt / Bistro", value: "French", badge: "Kök" },
  { label: "Polsk / Pierogi", value: "Polish", badge: "Kök" },
  { label: "Japanskt / Izakaya / Yakitori", value: "Japanese", badge: "Kök" },
  { label: "Svensk Husmanskost", value: "Swedish", badge: "Kök" },
  { label: "Italienskt / Trattoria", value: "Italian", badge: "Kök" },
  { label: "Fine Dining", value: "Fine Dining", badge: "Kök" },
];

function logConciergeQuery(queryText: string, lang: Language) {
  if (!queryText.trim()) return;
  const cleanQuery = queryText.trim();
  const entry = {
    query: cleanQuery,
    timestamp: new Date().toISOString(),
    lang,
  };
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("motkarta_concierge_history");
      const list: Array<{ query: string; timestamp: string; lang: string }> = stored ? JSON.parse(stored) : [];
      const filtered = list.filter((item) => item.query.toLowerCase() !== cleanQuery.toLowerCase());
      const updated = [entry, ...filtered].slice(0, 100);
      localStorage.setItem("motkarta_concierge_history", JSON.stringify(updated));
    } catch {}
  }
}

function kindFilterLabel(kind: EstablishmentFilter | string, lang: Language): string {
  if (kind === "All places") return translations[lang].allPlaces;
  if (kind === "Curated") return lang === "sv" ? "★ Handplockat" : "★ Curated";
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

function ImageLightboxModal({
  photos,
  initialIndex = 0,
  onClose,
}: {
  photos: PlacePhoto[] | null;
  initialIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  const total = photos?.length ?? 0;
  const currentPhoto = photos && total > 0 ? photos[index] : null;

  const handlePrev = useCallback(() => {
    if (total <= 1) return;
    setIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  const handleNext = useCallback(() => {
    if (total <= 1) return;
    setIndex((prev) => (prev + 1) % total);
  }, [total]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight") {
        handleNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev, onClose]);

  if (!currentPhoto) return null;

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lightbox-close-btn" onClick={onClose} aria-label="Close lightbox">
          ✕
        </button>

        {total > 1 ? (
          <>
            <button
              type="button"
              className="lightbox-nav-btn lightbox-prev-btn"
              onClick={handlePrev}
              aria-label="Previous photo"
            >
              <CaretLeft size={24} weight="bold" />
            </button>
            <button
              type="button"
              className="lightbox-nav-btn lightbox-next-btn"
              onClick={handleNext}
              aria-label="Next photo"
            >
              <CaretRight size={24} weight="bold" />
            </button>
          </>
        ) : null}

        <img src={currentPhoto.url} alt={currentPhoto.caption} className="lightbox-img" />
        <div className="lightbox-caption-bar">
          <div>
            <b>{currentPhoto.caption}</b>
            {total > 1 ? <span className="lightbox-counter">({index + 1} / {total})</span> : null}
          </div>
          {currentPhoto.credit ? <small>{currentPhoto.credit}</small> : null}
        </div>
      </div>
    </div>
  );
}

function LazyPlaceMediaDrawer({ place, lang = "sv" }: { place: PlaceInput; lang?: Language }) {
  const [activeTab, setActiveTab] = useState<"photos" | "reviews">("photos");
  const [photos, setPhotos] = useState<PlacePhoto[] | null>(null);
  const [reviews, setReviews] = useState<PlaceReview[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    let isCurrent = true;
    setLoading(true);
    setPhotos(null);
    setReviews(null);

    async function loadData() {
      const [fetchedPhotos, fetchedReviews] = await Promise.all([
        fetchPlacePhotos(place),
        fetchPlaceReviews(place),
      ]);
      if (isCurrent) {
        setPhotos(fetchedPhotos);
        setReviews(fetchedReviews);
        setLoading(false);
      }
    }

    void loadData();
    return () => {
      isCurrent = false;
    };
  }, [place]);

  return (
    <div className="lazy-media-drawer">
      {lightboxIndex !== null ? (
        <ImageLightboxModal
          photos={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
      <div className="lazy-media-tabs">
        <button
          type="button"
          className={`lazy-tab-btn ${activeTab === "photos" ? "active" : ""}`}
          onClick={() => setActiveTab("photos")}
        >
          <Image size={14} weight="bold" />
          {lang === "sv" ? "Bilder" : "Photos"} ({photos?.length ?? "..."})
        </button>
        <button
          type="button"
          className={`lazy-tab-btn ${activeTab === "reviews" ? "active" : ""}`}
          onClick={() => setActiveTab("reviews")}
        >
          <ChatTeardropText size={14} weight="bold" />
          {lang === "sv" ? "Verifierade Recensioner" : "Verified Reviews"} ({reviews?.length ?? "..."})
        </button>
      </div>

      {loading ? (
        <div className="media-loading-skeleton">
          <CircleNotch size={16} className="animate-spin" />
          <span>{lang === "sv" ? "Laddar media för stället..." : "Loading media for place..."}</span>
        </div>
      ) : activeTab === "photos" ? (
        <div className="photo-grid">
          {photos?.map((img, idx) => (
            <div
              key={img.id}
              className="photo-card"
              title={`${img.caption} (Klicka för fullskala)`}
              onClick={() => setLightboxIndex(idx)}
            >
              <img src={img.thumbnailUrl} alt={img.caption} loading="lazy" />
              <span className="photo-caption">{img.caption}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="review-list">
          {reviews?.map((rev) => (
            <article key={rev.id} className="review-card">
              <div className="review-card-head">
                <span className="review-author">{rev.author}</span>
                <span className="review-source-tag">{rev.source}</span>
              </div>
              <p className="review-content">"{rev.content}"</p>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--color-stone)" }}>
                <span>★ {rev.rating.toFixed(1)} / 5.0</span>
                <span>{rev.date}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export interface CuratedSource {
  id: string;
  name: string;
  url: string;
  type: "Verified Guide" | "Municipal Inspection" | "Open Data" | "Editorial Review" | "Community";
  description: string;
  license: string;
  verifiedCount?: number;
  addedByUser?: boolean;
}

export const INITIAL_CURATED_SOURCES = DEFAULT_CURATED_SOURCES;

type SuperpowerMode = "add_place" | "add_review" | "add_photo" | "rate_place" | "add_source";

function ConciergeSuperpowerModal({
  mode,
  places,
  activePlace,
  onClose,
  onAddPlace,
  onAddReview,
  onAddPhoto,
  onRatePlace,
  onAddSource,
  lang = "sv",
}: {
  mode: SuperpowerMode;
  places: PlaceInput[];
  activePlace: PlaceInput | null;
  onClose: () => void;
  onAddPlace: (place: PlaceInput) => void;
  onAddReview: (placeId: number, review: { author: string; rating: number; content: string; source: "Verified Local" }) => void;
  onAddPhoto: (placeId: number, photo: { url: string; thumbnailUrl: string; caption: string; credit?: string }) => void;
  onRatePlace: (placeId: number, rating: number) => void;
  onAddSource?: (source: CuratedSource) => void;
  lang?: Language;
}) {
  const [selectedPlaceId, setSelectedPlaceId] = useState<number>(activePlace ? activePlace.id : (places[0]?.id ?? 1));

  // Place form fields
  const [name, setName] = useState("");
  const [kind, setKind] = useState("Restaurant");
  const [cuisine, setCuisine] = useState("swedish");
  const [area, setArea] = useState("Vasastan");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [rating, setRating] = useState(5);
  const [tags, setTags] = useState("");

  // Review fields
  const [author, setAuthor] = useState("");
  const [reviewContent, setReviewContent] = useState("");

  // Photo fields
  const [photoUrl, setPhotoUrl] = useState("");
  const [caption, setCaption] = useState("");

  // Source fields
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceType, setSourceType] = useState<CuratedSource["type"]>("Verified Guide");
  const [sourceLicense, setSourceLicense] = useState("Öppen data / Citerat med tillstånd");
  const [sourceDesc, setSourceDesc] = useState("");

  const duplicateMatch = useMemo(() => {
    if (!name.trim() || mode !== "add_place") return null;
    const targetName = name.trim().toLowerCase();
    return places.find((p) => p.name.trim().toLowerCase() === targetName) ?? null;
  }, [name, places, mode]);

  const handleSubmitPlace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || duplicateMatch) return;

    const newPlace: PlaceInput = {
      id: Date.now(),
      name: name.trim(),
      kind: kind as EstablishmentType,
      cuisine: cuisine.trim(),
      area: area.trim(),
      address: address.trim() || `${area}, Stockholm`,
      note: note.trim() || `Oberoende ${kind.toLowerCase()} i ${area}.`,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      evidenceLabel: "Verifierad användarinskickning · OSM",
      ratingAverage: rating,
      reliableRatingCount: 1,
      reviewCount: 1,
      categoryMeanRating: 4.2,
      categoryPopularityRaw: 0.8,
      localPopularityPercentile: 50,
      priceLevel: 2,
      mainstreamExposure: 20,
      ageDays: 1,
      daysSinceFreshEvidence: 1,
      evidence: {
        specialistGuide: 0.8,
        independentEditorial: 1,
        verifiedUserRating: 1,
        repeatVisits: 50,
        recentReviews: 90,
        credibleReviewers: 80,
        inspectionStatus: 100,
        verifiedAttributes: 90,
        dataFreshness: 100,
        confidence: "High",
      },
      latitude: activePlace && activePlace.latitude != null ? activePlace.latitude + 0.002 : 59.3326 + (Math.random() - 0.5) * 0.02,
      longitude: activePlace && activePlace.longitude != null ? activePlace.longitude + 0.002 : 18.0649 + (Math.random() - 0.5) * 0.02,
      engagement: {
        searchImpressions: 100,
        profileViews: 50,
        mapMarkerClicks: 30,
        saves: 10,
        directionRequests: 5,
        confirmedVisits: 5,
        repeatVisits: 2,
        recommendations: 3,
        recentSaves: 10,
      },
      x: 50,
      y: 50,
    };

    onAddPlace(newPlace);
    onClose();
  };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewContent.trim()) return;
    onAddReview(selectedPlaceId, {
      author: author.trim() || "Oberoende Matälskare",
      rating,
      content: reviewContent.trim(),
      source: "Verified Local",
    });
    onClose();
  };

  const handleSubmitPhoto = (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoUrl.trim()) return;
    onAddPhoto(selectedPlaceId, {
      url: photoUrl.trim(),
      thumbnailUrl: photoUrl.trim(),
      caption: caption.trim() || "Foto inskickat av användare",
      credit: "Inskickat via Concierge",
    });
    onClose();
  };

  const handleSubmitRating = (e: React.FormEvent) => {
    e.preventDefault();
    onRatePlace(selectedPlaceId, rating);
    onClose();
  };

  const handleSubmitSource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceName.trim() || !sourceUrl.trim()) return;
    onAddSource?.({
      id: `src-${Date.now()}`,
      name: sourceName.trim(),
      url: sourceUrl.trim(),
      type: sourceType,
      license: sourceLicense.trim() || "Citerat med källhänvisning",
      description: sourceDesc.trim() || "Kurerat källmaterial inskickat av användare.",
      addedByUser: true,
    });
    onClose();
  };

  return (
    <div className="superpower-modal-overlay" onClick={onClose}>
      <div className="superpower-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="superpower-modal-head">
          <h3>
            {mode === "add_place" && "➕ Lägg till nytt ställe"}
            {mode === "add_review" && "✍️ Skriv verifierad recension"}
            {mode === "add_photo" && "📷 Lägg till foto till ställe"}
            {mode === "rate_place" && "⭐ Betygsätt ställe"}
            {mode === "add_source" && "📜 Lägg till ny kurerad källa"}
          </h3>
          <button type="button" className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {mode === "add_place" && (
          <form className="superpower-form" onSubmit={handleSubmitPlace}>
            <div className="superpower-form-group">
              <label>Namn på stället *</label>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="t.ex. Oaxen Slip" />
            </div>
            {duplicateMatch ? (
              <div
                style={{
                  padding: "10px 14px",
                  background: "#FEF2F2",
                  border: "1px solid #F87171",
                  color: "#991B1B",
                  fontSize: "12px",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                ⚠️ Stället "{duplicateMatch.name}" finns redan i kartan ({duplicateMatch.area}).
              </div>
            ) : null}
            <div className="superpower-form-group">
              <label>Typ av ställe</label>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="Restaurant">Restaurant / Bistro</option>
                <option value="Specialty coffee">Specialty Coffee</option>
                <option value="Bakery">Bakery / Bageri</option>
                <option value="Café">Café / Fika</option>
              </select>
            </div>
            <div className="superpower-form-group">
              <label>Kök / Kategori</label>
              <input type="text" value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="t.ex. swedish, bakery, mexican" />
            </div>
            <div className="superpower-form-group">
              <label>Stadsdel / Område</label>
              <input type="text" value={area} onChange={(e) => setArea(e.target.value)} placeholder="t.ex. Djurgården, Vasastan, Södermalm" />
            </div>
            <div className="superpower-form-group">
              <label>Adress</label>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="t.ex. Beckholmsvägen 26" />
            </div>
            <div className="superpower-form-group">
              <label>Beskrivning / Notering</label>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Berätta vad som gör stället unikt..." />
            </div>
            <div className="superpower-form-group">
              <label>Startbetyg (1–5 stjärnor)</label>
              <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                <option value={5}>★ ★ ★ ★ ★ (5.0)</option>
                <option value={4}>★ ★ ★ ★ ☆ (4.0)</option>
                <option value={3}>★ ★ ★ ☆ ☆ (3.0)</option>
              </select>
            </div>
            <div className="superpower-form-group">
              <label>Taggar (kommaseparerade)</label>
              <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Oberoende, Ekologiskt, Sjöutsikt" />
            </div>
            <button type="submit" className="superpower-submit-btn" disabled={Boolean(duplicateMatch)} style={{ opacity: duplicateMatch ? 0.5 : 1, cursor: duplicateMatch ? "not-allowed" : "pointer" }}>
              <PlusCircle size={16} /> Publicera nytt ställe i kartan
            </button>
          </form>
        )}

        {mode === "add_review" && (
          <form className="superpower-form" onSubmit={handleSubmitReview}>
            <div className="superpower-form-group">
              <label>Välj ställe *</label>
              <select value={selectedPlaceId} onChange={(e) => setSelectedPlaceId(Number(e.target.value))}>
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.area})
                  </option>
                ))}
              </select>
            </div>
            <div className="superpower-form-group">
              <label>Ditt namn / Alias</label>
              <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="t.ex. Anna K." />
            </div>
            <div className="superpower-form-group">
              <label>Betyg</label>
              <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                <option value={5}>★ ★ ★ ★ ★ (5/5)</option>
                <option value={4}>★ ★ ★ ★ ☆ (4/5)</option>
                <option value={3}>★ ★ ★ ☆ ☆ (3/5)</option>
                <option value={2}>★ ★ ☆ ☆ ☆ (2/5)</option>
                <option value={1}>★ ☆ ☆ ☆ ☆ (1/5)</option>
              </select>
            </div>
            <div className="superpower-form-group">
              <label>Din Recension *</label>
              <textarea rows={4} required value={reviewContent} onChange={(e) => setReviewContent(e.target.value)} placeholder="Dela din upplevelse av mat, atmosfär och service..." />
            </div>
            <button type="submit" className="superpower-submit-btn">
              <Sparkle size={16} /> Publicera Recension
            </button>
          </form>
        )}

        {mode === "add_photo" && (
          <form className="superpower-form" onSubmit={handleSubmitPhoto}>
            <div className="superpower-form-group">
              <label>Välj ställe *</label>
              <select value={selectedPlaceId} onChange={(e) => setSelectedPlaceId(Number(e.target.value))}>
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.area})
                  </option>
                ))}
              </select>
            </div>
            <div className="superpower-form-group">
              <label>Bild-URL *</label>
              <input type="url" required value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="superpower-form-group">
              <label>Bildtext / Bildbeskrivning</label>
              <input type="text" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="t.ex. Färskgräddade bullar & baristakaffe" />
            </div>
            <button type="submit" className="superpower-submit-btn">
              <Image size={16} /> Lägg till foto i galleriet
            </button>
          </form>
        )}

        {mode === "rate_place" && (
          <form className="superpower-form" onSubmit={handleSubmitRating}>
            <div className="superpower-form-group">
              <label>Välj ställe *</label>
              <select value={selectedPlaceId} onChange={(e) => setSelectedPlaceId(Number(e.target.value))}>
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.area})
                  </option>
                ))}
              </select>
            </div>
            <div className="superpower-form-group">
              <label>Sätt betyg (1–5 stjärnor)</label>
              <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                <option value={5}>★ ★ ★ ★ ★ (Fem stjärnor)</option>
                <option value={4}>★ ★ ★ ★ ☆ (Fyra stjärnor)</option>
                <option value={3}>★ ★ ★ ☆ ☆ (Tre stjärnor)</option>
                <option value={2}>★ ★ ☆ ☆ ☆ (Två stjärnor)</option>
                <option value={1}>★ ☆ ☆ ☆ ☆ (En stjärna)</option>
              </select>
            </div>
            <button type="submit" className="superpower-submit-btn">
              <Star size={16} weight="fill" /> Spara betyg
            </button>
          </form>
        )}

        {mode === "add_source" && (
          <form className="superpower-form" onSubmit={handleSubmitSource}>
            <div className="superpower-form-group">
              <label>Källans namn / Titel *</label>
              <input
                type="text"
                required
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder="t.ex. Guide Michelin Stockholm eller Krogen & Bageriet"
              />
            </div>
            <div className="superpower-form-group">
              <label>Webbadress / URL *</label>
              <input
                type="url"
                required
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="superpower-form-group">
              <label>Typ av källa</label>
              <select value={sourceType} onChange={(e) => setSourceType(e.target.value as CuratedSource["type"])}>
                <option value="Verified Guide">Verified Guide (Redaktionell krog- & matguide)</option>
                <option value="Municipal Inspection">Municipal Inspection (Kommunalt tillsynsregister)</option>
                <option value="Open Data">Open Data (Öppet API / Databas)</option>
                <option value="Editorial Review">Editorial Review (Tidningsrecension)</option>
                <option value="Community">Community (Verifierad användarsamling)</option>
              </select>
            </div>
            <div className="superpower-form-group">
              <label>Licens & Upphovsrättsattribuering</label>
              <input
                type="text"
                value={sourceLicense}
                onChange={(e) => setSourceLicense(e.target.value)}
                placeholder="t.ex. CC0 1.0, ODbL, eller Citerat med tillstånd"
              />
            </div>
            <div className="superpower-form-group">
              <label>Källbeskrivning & Omfång</label>
              <textarea
                rows={2}
                value={sourceDesc}
                onChange={(e) => setSourceDesc(e.target.value)}
                placeholder="Beskriv vad källan granskar och bidrar med..."
              />
            </div>
            <button type="submit" className="superpower-submit-btn">
              <ShieldCheck size={16} /> Lägg till ny kurerad källa i registret
            </button>
          </form>
        )}
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
  const [superpowerMode, setSuperpowerMode] = useState<SuperpowerMode | null>(null);
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
  const [curatedSources, setCuratedSources] = useState<CuratedSource[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("motkarta_user_sources");
        if (stored) {
          const userSources: CuratedSource[] = JSON.parse(stored);
          return [...INITIAL_CURATED_SOURCES, ...userSources];
        }
      } catch {}
    }
    return INITIAL_CURATED_SOURCES;
  });

  const handleAddSourceSuperpower = (newSource: CuratedSource) => {
    setCuratedSources((prev) => [...prev, newSource]);
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("motkarta_user_sources");
        const list: CuratedSource[] = stored ? JSON.parse(stored) : [];
        localStorage.setItem("motkarta_user_sources", JSON.stringify([...list, newSource]));
      } catch {}
    }
    void fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSource),
    }).catch(() => {});
    setAnswer(`📜 Superpower Aktiverad! Den nya kurerade källan '${newSource.name}' har lagts till i registret och sparats i databasen!`);
  };
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const [isSourcesLoading, setIsSourcesLoading] = useState(false);
  const [isPromptsLoading, setIsPromptsLoading] = useState(false);

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

    async function loadDbSources() {
      setIsSourcesLoading(true);
      try {
        const resp = await fetch("/api/sources");
        if (resp.ok) {
          const payload = (await resp.json()) as { sources?: CuratedSource[] };
          if (!cancelled && payload.sources?.length) {
            setCuratedSources(payload.sources);
          }
        }
      } catch {}
      if (!cancelled) setIsSourcesLoading(false);
    }

    async function loadDbPrompts() {
      setIsPromptsLoading(true);
      try {
        const resp = await fetch("/api/prompts");
        if (resp.ok) {
          const payload = (await resp.json()) as { prompts?: string[] };
          if (!cancelled && payload.prompts?.length) {
            setConciergeHistory((prev) => Array.from(new Set([...payload.prompts!, ...prev])));
          }
        }
      } catch {}
      if (!cancelled) setIsPromptsLoading(false);
    }

    void loadPlaces();
    void loadDbSources();
    void loadDbPrompts();

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

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const ranked = useMemo(
    () =>
      scoredPlaces
        .filter((place) =>
          kind === "All places"
            ? true
            : kind === "Curated"
              ? place.evidence.specialistGuide === 1 ||
                (place.evidenceLabel ?? "").toLowerCase().includes("guide") ||
                (place.evidenceLabel ?? "").toLowerCase().includes("specialist") ||
                (place.sourceName ?? "").toLowerCase().includes("husa")
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
        .sort((a, b) => comparePlaces(a, b, mode, sortMode, randomSeed, userLocation ?? stockholmCenter)),
    [cuisine, kind, mode, query, randomSeed, savedPlaceIds, scoredPlaces, sortMode, userLocation],
  );
  const visibleRanked = useMemo(() => ranked.slice(0, renderLimit), [ranked]);

  const active = ranked.find((place) => place.id === selected) ?? ranked[0] ?? scoredPlaces[0];

  const [isConciergeFocused, setIsConciergeFocused] = useState(false);
  const [conciergeHistory, setConciergeHistory] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("motkarta_concierge_history");
        if (stored) {
          const list: Array<{ query: string }> = JSON.parse(stored);
          return list.map((item) => item.query);
        }
      } catch {}
    }
    return [];
  });

  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const matchingSuggestions = useMemo(() => {
    const inputClean = concierge.trim().toLowerCase();
    const allCandidates = Array.from(new Set([...conciergeHistory, ...POPULAR_CONCIERGE_PROMPTS]));
    if (!inputClean) {
      return allCandidates.slice(0, 5);
    }
    return allCandidates
      .filter((prompt) => prompt.toLowerCase().includes(inputClean))
      .slice(0, 5);
  }, [concierge, conciergeHistory]);

  const searchAutocompleteSuggestions = useMemo(() => {
    const q = query.trim().toLowerCase();

    const matchedRegions = STOCKHOLM_REGIONS.filter(
      (r) => r.label.toLowerCase().includes(q) || r.aliases.some((a) => a.includes(q))
    ).map((r) => ({
      id: `region-${r.value}`,
      label: r.label,
      value: r.value,
      badge: "Stadsdel",
      icon: "📍",
    }));

    const matchedCuisines = SEARCH_CUISINE_SUGGESTIONS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.value.toLowerCase().includes(q)
    ).map((c) => ({
      id: `cuisine-${c.value}`,
      label: c.label,
      value: c.value,
      badge: c.badge,
      icon: "🍴",
    }));

    const matchedPlaces = places
      .filter((p) => p.name.toLowerCase().includes(q) || p.area.toLowerCase().includes(q))
      .slice(0, 5)
      .map((p) => ({
        id: `place-${p.id}`,
        label: `${p.name} (${p.area})`,
        value: p.name,
        badge: p.kind,
        icon: "🏢",
      }));

    if (!q) {
      return [...matchedRegions.slice(0, 4), ...matchedCuisines.slice(0, 4), ...matchedPlaces.slice(0, 3)];
    }

    return [...matchedRegions, ...matchedCuisines, ...matchedPlaces].slice(0, 8);
  }, [places, query]);

  async function askWithQuery(queryText: string) {
    if (!queryText.trim()) return;
    setAsking(true);
    setAnswer(null);

    logConciergeQuery(queryText, lang);
    setConciergeHistory((prev) => {
      const filtered = prev.filter((q) => q.toLowerCase() !== queryText.trim().toLowerCase());
      return [queryText.trim(), ...filtered].slice(0, 100);
    });

    let finalAnswer = "";

    try {
      const resp = await fetch("/api/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: queryText, places }),
      });

      if (resp.ok) {
        const payload = (await resp.json()) as { answer?: string };
        if (payload.answer) {
          finalAnswer = payload.answer;
        }
      }
    } catch {
      // Fallback to local RAG when endpoint is unreachable in standalone dev
    }

    if (!finalAnswer) {
      const ragResult = retrieveAndSynthesize(queryText, places);
      finalAnswer = ragResult.answer;
    }

    setAnswer(finalAnswer);
    setAsking(false);

    const parsed = parseConciergeAnswer(finalAnswer);
    if (parsed.superpowerAction) {
      setSuperpowerMode(parsed.superpowerAction);
    }
  }

  const handleAddPlaceSuperpower = (newPlace: PlaceInput) => {
    setPlaces((prev) => [newPlace, ...prev]);
    setSelected(newPlace.id);
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("motkarta_user_places");
        const list: PlaceInput[] = stored ? JSON.parse(stored) : [];
        localStorage.setItem("motkarta_user_places", JSON.stringify([newPlace, ...list]));
      } catch {}
    }
    setAnswer(`🎉 Superpower Aktiverad! Ditt nya oberoende ställe '${newPlace.name}' i ${newPlace.area} har lagts till i kartan och är nu live!`);
  };

  const handleAddReviewSuperpower = (placeId: number, rev: { author: string; rating: number; content: string; source: "Verified Local" }) => {
    addUserReview(placeId, rev);
    const targetPlace = places.find((p) => p.id === placeId);
    setSelected(placeId);
    setAnswer(`✍️ Superpower Aktiverad! Din verifierade recension för '${targetPlace?.name ?? "Stället"}' har publicerats i detaljkortet!`);
  };

  const handleAddPhotoSuperpower = (placeId: number, ph: { url: string; thumbnailUrl: string; caption: string; credit?: string }) => {
    addUserPhoto(placeId, ph);
    const targetPlace = places.find((p) => p.id === placeId);
    setSelected(placeId);
    setAnswer(`📷 Superpower Aktiverad! Ditt foto för '${targetPlace?.name ?? "Stället"}' har lagts till i bildgalleriet!`);
  };

  const handleRatePlaceSuperpower = (placeId: number, rating: number) => {
    handleRatePlace(placeId, rating);
    const targetPlace = places.find((p) => p.id === placeId);
    setSelected(placeId);
    setAnswer(`⭐ Superpower Aktiverad! Ditt betyg (${rating}/5 stjärnor) för '${targetPlace?.name ?? "Stället"}' har sparats!`);
  };

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
        <a className="brand" href="#" aria-label="MOTKARTA">
          <img src="/motkarta_drop_divided_black_red.svg" alt="MOTKARTA Pin" className="brand-counter-pin" />
          <img src="/logo.webp" alt="MOTKARTA" className="brand-logo" />
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
        <div className="search-container-relative">
          <label className="search" style={{ display: "flex", alignItems: "center" }}>
            <MagnifyingGlass size={16} weight="bold" style={{ color: "var(--color-ink)", marginRight: "8px" }} />
            <input
              aria-label={t.typeFilterLabel}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
              placeholder={lang === "sv" ? "Sök stadsdel (Söder, Vasastan...), ställe eller kök..." : "Search region (Söder, Vasastan...), place or cuisine..."}
            />
          </label>

          {isSearchFocused && searchAutocompleteSuggestions.length > 0 ? (
            <div className="search-autocomplete-box">
              <div className="autocomplete-category-header">
                <Compass size={12} weight="bold" />
                <span>{lang === "sv" ? "AUTOCOMPLETE: STADSDELAR, STÄLLEN & KÖK" : "AUTOCOMPLETE: REGIONS, PLACES & CUISINES"}</span>
              </div>
              {searchAutocompleteSuggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="autocomplete-item"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setQuery(item.value);
                    setIsSearchFocused(false);
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>{item.icon}</span>
                    <span style={{ fontWeight: 600 }}>{item.label}</span>
                  </span>
                  <span className="autocomplete-type-badge">{item.badge}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
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
          <FoodMap
            places={visibleRanked}
            activePlace={active}
            onSelect={setSelected}
            onUserLocated={(loc) => {
              setUserLocation(loc);
              setSortMode("Distance");
            }}
            lang={lang}
          />
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
              {active.tags.map((tag: string) => (
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
            <div className="curated-attribution-box">
              <div className="curated-attribution-title">
                <ShieldCheck size={14} style={{ color: "var(--color-water)" }} />
                {lang === "sv" ? "KÄLLTILLSKRIVNING & UPPHOVSRÄTT" : "SOURCE ATTRIBUTION & COPYRIGHT"}
              </div>
              <div className="curated-attribution-body">
                {lang === "sv"
                  ? "Guiderekommendationer & citat återges med källhänvisning till Anders Husa & Kaitlin Orr Guide (andershusa.com). Tillsynsdata från Stockholms stad (CC0). Kartdata från OpenStreetMap (ODbL). Alla upphovsrätter tillhör respektive skapare."
                  : "Guide recommendations & quotes cited with attribution to Anders Husa & Kaitlin Orr Guide (andershusa.com). Inspection data from Stockholm City (CC0). Map data from OpenStreetMap (ODbL). All copyrights belong to their respective owners."}
              </div>
            </div>
            <ExternalMapLinks place={active} lang={lang} />
            {active.discoveryReasons?.length ? (
              <ul className="reason-list" aria-label="Discovery score reasons">
                {active.discoveryReasons.slice(0, 3).map((reason: string) => (
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
            <LazyPlaceMediaDrawer place={active} lang={lang} />
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
          <div className="superpower-chips" aria-label="Concierge superpowers">
            <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("add_place")}>
              <PlusCircle size={14} weight="bold" /> {lang === "sv" ? "➕ Lägg till nytt ställe" : "➕ Add new place"}
            </button>
            <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("add_review")}>
              <Sparkle size={14} weight="bold" /> {lang === "sv" ? "✍️ Skriv recension" : "✍️ Write review"}
            </button>
            <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("add_photo")}>
              <Image size={14} weight="bold" /> {lang === "sv" ? "📷 Lägg till foto" : "📷 Add photo"}
            </button>
            <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("rate_place")}>
              <Star size={14} weight="bold" /> {lang === "sv" ? "⭐ Betygsätt ställe" : "⭐ Rate place"}
            </button>
            <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("add_source")}>
              <ShieldCheck size={14} weight="bold" /> {lang === "sv" ? "📜 Lägg till ny källa" : "📜 Add source"}
            </button>
          </div>
        </div>
        <div className="ask-box" style={{ position: "relative" }}>
          <label htmlFor="ask">{t.askLabel}</label>
          <textarea
            id="ask"
            value={concierge}
            onChange={(event) => setConcierge(event.target.value)}
            onFocus={() => setIsConciergeFocused(true)}
            onBlur={() => setTimeout(() => setIsConciergeFocused(false), 200)}
            placeholder={t.askPlaceholder}
          />

          {isConciergeFocused && matchingSuggestions.length > 0 ? (
            <div className="concierge-autosuggest-box">
              <div className="autosuggest-header">
                <Sparkle size={12} weight="bold" />
                <span>{lang === "sv" ? "FÖRSLAG & ML-SÖKHISTORIK" : "AUTOSUGGEST & SEARCH HISTORY"}</span>
                {isPromptsLoading ? (
                  <CircleNotch size={11} className="animate-spin" style={{ marginLeft: "auto" }} />
                ) : null}
              </div>
              {matchingSuggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="autosuggest-item"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setConcierge(item);
                    setIsConciergeFocused(false);
                    void askWithQuery(item);
                  }}
                >
                  <MagnifyingGlass size={13} style={{ color: "var(--color-water)" }} />
                  <span>{item}</span>
                </button>
              ))}
            </div>
          ) : null}
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

        <div className="curated-sources-panel" style={{ marginTop: "32px", paddingTop: "24px", borderTop: "1px solid var(--color-mist)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-mono)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "8px" }}>
                📜 Kurerade Öppna Källor ({curatedSources.length})
                {isSourcesLoading ? (
                  <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--color-water)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <CircleNotch size={12} className="animate-spin" /> D1-sync...
                  </span>
                ) : null}
              </h3>
              <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--color-stone)" }}>
                Auditerbara datakällor och verifierade guider som driver Motkartas ranking.
              </p>
            </div>
            <button
              type="button"
              className="superpower-chip-btn"
              onClick={() => setSuperpowerMode("add_source")}
              style={{ background: "var(--color-ink)", color: "var(--color-paper)", border: "none" }}
            >
              <PlusCircle size={14} weight="bold" /> {lang === "sv" ? "➕ Lägg till ny källa" : "➕ Add new source"}
            </button>
          </div>

          <div className="sources-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
            {curatedSources.map((src) => (
              <article
                key={src.id}
                style={{
                  padding: "14px 16px",
                  background: "var(--color-paper)",
                  border: "1px solid var(--color-ink)",
                  fontSize: "12px",
                  fontFamily: "var(--font-mono)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "10px",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 6px", background: "var(--color-water)", color: "#fff", borderRadius: "2px" }}>
                      🟢 {src.type}
                    </span>
                    {src.addedByUser ? (
                      <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--orange)" }}>
                        [Inskickad källa]
                      </span>
                    ) : null}
                  </div>
                  <h4 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: 700, color: "var(--color-ink)" }}>
                    <a href={src.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      {src.name} <ArrowSquareOut size={13} />
                    </a>
                  </h4>
                  <p style={{ margin: 0, color: "rgba(28, 25, 23, 0.85)", lineHeight: 1.45, fontSize: "11px" }}>
                    {src.description}
                  </p>
                </div>
                <div style={{ borderTop: "1px dashed var(--color-mist)", paddingTop: "8px", fontSize: "10px", color: "var(--color-stone)", display: "flex", justifyContent: "space-between" }}>
                  <span>📜 {src.license}</span>
                  {src.verifiedCount ? <span>{src.verifiedCount.toLocaleString()} datapunkter</span> : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {superpowerMode ? (
        <ConciergeSuperpowerModal
          mode={superpowerMode}
          places={places}
          activePlace={active}
          onClose={() => setSuperpowerMode(null)}
          onAddPlace={handleAddPlaceSuperpower}
          onAddReview={handleAddReviewSuperpower}
          onAddPhoto={handleAddPhotoSuperpower}
          onRatePlace={handleRatePlaceSuperpower}
          onAddSource={handleAddSourceSuperpower}
          lang={lang}
        />
      ) : null}

      <footer>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
          <img src="/logo.webp" alt="MOTKARTA" className="footer-logo" />
          <span>/ {t.footerLeft.replace(/^MOTKARTA \/ /, "")}</span>
        </div>
        <span>{t.footerRight}</span>
      </footer>
    </main>
  );
}

function FoodMap({
  places,
  activePlace,
  onSelect,
  onUserLocated,
  lang,
}: {
  places: ScoredPlace[];
  activePlace: ScoredPlace;
  onSelect: (id: number) => void;
  onUserLocated?: (loc: { latitude: number; longitude: number }) => void;
  lang: Language;
}) {
  const t = translations[lang];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());
  const userMarkerRef = useRef<L.Marker | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [locating, setLocating] = useState(false);

  const handleLocateUser = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      alert(lang === "sv" ? "Geolokaliseringsstöd saknas i din webbläsare." : "Geolocation is not supported by your browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setLocating(false);
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

          userMarkerRef.current = L.marker([coords.latitude, coords.longitude], { icon: pulseIcon })
            .bindPopup(`<b>${lang === "sv" ? "Din position" : "Your location"}</b>`)
            .addTo(map)
            .openPopup();
        }
        onUserLocated?.(coords);
      },
      () => {
        setLocating(false);
        alert(lang === "sv" ? "Kunde inte hämta din position. Tillåt platstjänster i webbläsaren." : "Could not retrieve your location. Please allow location access.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

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
      <button
        type="button"
        className="map-locate-btn"
        onClick={handleLocateUser}
        title={lang === "sv" ? "Visa min position & ställen nära mig" : "Show my location & places near me"}
      >
        <Crosshair size={14} weight="bold" />
        {locating
          ? (lang === "sv" ? "Söker..." : "Locating...")
          : (lang === "sv" ? "Min position" : "Near me")}
      </button>
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
