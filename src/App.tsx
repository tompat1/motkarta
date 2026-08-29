"use client";

import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { demoPlaces } from "../lib/demo-places";
import { OnboardingModal } from "./components/OnboardingModal";
import { MerchPanel } from "./components/MerchPanel";
import { PreloaderModal } from "./components/PreloaderModal";
import {
  ArrowRight,
  ArrowClockwise,
  ArrowSquareOut,
  ArrowsIn,
  ArrowsOut,
  Bread,
  Certificate,
  ChatTeardropText,
  Check,
  CaretLeft,
  CaretRight,
  CaretUp,
  CaretDown,
  CheckCircle,
  CircleNotch,
  Clock,
  Coffee,
  Compass,
  Copy,
  Crosshair,
  DownloadSimple,
  ForkKnife,
  Globe,
  Image,
  MapPin,
  MapTrifold,
  MagnifyingGlass,
  Minus,
  Plus,
  PlusCircle,
  Scales,
  ShieldCheck,
  SignOut,
  ShoppingBag,
  ShoppingCart,
  Shuffle,
  Sliders,
  Sparkle,
  Star,
  TerminalWindow,
  ThumbsUp,
  ThumbsDown,
  X,
} from "@phosphor-icons/react";
import { parseConciergeAnswer } from "../lib/concierge-parser";
import { retrieveAndSynthesize } from "../functions/api/concierge";
import { CartDrawer } from "./components/CartDrawer";
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
  type PlaceLifecycleState,
  type ScoredPlace,
  type UserPreferences,
  scorePlace,
} from "../lib/scoring";
import { isBroadStockholmArea, resolveStockholmRegion, STOCKHOLM_REGIONS as STOCKHOLM_REGION_NAMES } from "../lib/stockholm-regions";
import {
  ANONYMOUS_ID_ROTATION_DAYS,
  MAX_RECOMMENDATION_EVENTS_PER_BATCH,
  RECOMMENDATION_SCORER_VERSION,
  buildRecommendationEventIdempotencyKey,
  queryLengthBucket,
  recommendationCuisineContext,
  recommendationModeForContext,
  recommendationResultSetSignature,
  type QueryContext,
  type QueryContextKind,
  type QueryContextRankingMode,
  type QueryContextSortMode,
  type RecommendationEventType,
  type RecommendationMode,
} from "../lib/recommendation-events";
import { DEFAULT_CONCIERGE_PROMPTS, DEFAULT_CURATED_SOURCES } from "../lib/db-sources-prompts";

const establishmentTypes = [
  "All places",
  "Curated",
  "Saved",
  "Latest",
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
const recommendationImpressionLimit = 50;
const stockholmCenter = { latitude: 59.3293, longitude: 18.0686 };

type EstablishmentFilter = (typeof establishmentTypes)[number];
type CuisineFilter = typeof allCuisines | string;
type Mode = (typeof modes)[number];
type SortMode = (typeof sortModes)[number];
type DataSource = "loading" | "demo" | "d1" | "osm" | "unavailable";

const clientEnv = (import.meta as unknown as { env?: { DEV?: boolean; VITE_MOTKARTA_DEMO_MODE?: string } }).env;
const CLIENT_DEMO_MODE = Boolean(clientEnv?.DEV) || clientEnv?.VITE_MOTKARTA_DEMO_MODE === "true";

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

function formatDistance(distKm: number, _lang: Language): string {
  if (distKm === Number.POSITIVE_INFINITY || isNaN(distKm)) return "";
  if (distKm < 1) {
    return `${Math.round(distKm * 1000)} m`;
  }
  return `${distKm.toFixed(1)} km`;
}

const DISTANCE_INTENT_REGEX = /\b(närmast|närmaste|närmst|närmsta|nära|i närheten|kortast|avstånd|closest|nearest|near me|nära mig|close by|closest place)\b/i;

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

export function cuisineLabel(value: string, lang: Language = "sv"): string {
  const key = value.trim().toLowerCase().replaceAll("_", " ");

  if (lang === "sv") {
    const svMap: Record<string, string> = {
      spanish: "Spanskt",
      french: "Franskt",
      mexican: "Mexikanskt",
      german: "Tyskt",
      polish: "Polskt",
      austrian: "Österrikiskt",
      italian: "Italienskt",
      pizza: "Pizza",
      sushi: "Sushi",
      burger: "Hamburgare",
      thai: "Thailändskt",
      asian: "Asiatiskt",
      indian: "Indiskt",
      japanese: "Japanskt",
      chinese: "Kinesiskt",
      "coffee shop": "Kaffebar",
      coffee: "Kaffe",
      café: "Café",
      cafe: "Café",
      kebab: "Kebab",
      regional: "Svenskt",
      swedish: "Svenskt",
      grill: "Grill & BBQ",
      pasta: "Pasta",
      sandwich: "Smörgåsar & Mackor",
      greek: "Grekiskt",
      salad: "Sallad",
      bakery: "Bageri",
      patisserie: "Konditori",
      pastry: "Bakverk",
      schnitzel: "Schnitzel",
      "eastern european": "Östeuropeiskt",
      vietnamese: "Vietnamesiskt",
      korean: "Koreanskt",
      "middle eastern": "Mellanöstern",
      lebanese: "Libanesiskt",
      ramen: "Ramen",
      tapas: "Tapas",
      seafood: "Fisk & Skaldjur",
      bistro: "Bistro",
    };
    if (svMap[key]) return svMap[key];
  } else {
    const enMap: Record<string, string> = {
      regional: "Swedish",
      swedish: "Swedish",
      "coffee shop": "Coffee Shop",
      coffee: "Coffee",
      café: "Café",
      cafe: "Café",
      "eastern european": "Eastern European",
      "middle eastern": "Middle Eastern",
    };
    if (enMap[key]) return enMap[key];
  }

  return key.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export type Language = "sv" | "en";

export const translations = {
  sv: {
    brandDescriptor: "Stockholms fria matkarta",
    navMap: "KARTA",
    navMethod: "METOD",
    navReview: "GRANSKNING",
    navConcierge: "CONCIERGE",
    navAbout: "OM",
    dataSourceLiveOsm: "Live platser",
    dataSourceLiveD1: "Live platser",
    dataSourceLoading: "Laddar platser",
    dataSourceDemo: "Demodata",
    dataSourceUnavailable: "Platser saknas",
    noSearchResultsTitle: "Inga träffar",
    noSearchResultsText: "Vi hittade inga platser som matchar",
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
    centerMap: "Visa alla",
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
    navReview: "REVIEW",
    navConcierge: "CONCIERGE",
    navAbout: "ABOUT",
    dataSourceLiveOsm: "Live places",
    dataSourceLiveD1: "Live places",
    dataSourceLoading: "Loading places",
    dataSourceDemo: "Demo data",
    dataSourceUnavailable: "Places unavailable",
    noSearchResultsTitle: "No matches",
    noSearchResultsText: "We could not find any places matching",
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
    centerMap: "Show all",
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

export const STOCKHOLM_REGION_OPTIONS = [
  { label: "Södermalm (Söder)", value: "Södermalm", aliases: ["söder", "södermalm", "sofo", "zinken", "mariatorget", "nytorget", "hornstull", "skanstull"] },
  { label: "Gamla Stan", value: "Gamla Stan", aliases: ["gamla stan", "gamlastan", "baggensgatan"] },
  { label: "Vasastan", value: "Vasastan", aliases: ["vasastan", "vasastaden", "birkastan", "st eriksplan", "odenplan", "rörstrandsgatan"] },
  { label: "Birkastan", value: "Birkastan", aliases: ["birkastan", "rörstrandsgatan", "vasastan"] },
  { label: "City / Norrmalm", value: "Norrmalm", aliases: ["city", "norrmalm", "t-centralen", "hötorget", "klara"] },
  { label: "Östermalm", value: "Östermalm", aliases: ["östermalm", "ostermalm", "stureplan"] },
  { label: "Kungsholmen", value: "Kungsholmen", aliases: ["kungsholmen", "fridhemsplan", "kronobergsgatan"] },
  { label: "Djurgården", value: "Djurgården", aliases: ["djurgården", "djurgarden"] },
  { label: "Söderort", value: "Söderort", aliases: ["söderort", "soderort", "årsta", "arsta", "liljeholmen", "hägersten", "hagersten", "enskede", "farsta", "skarpnäck", "skarpnack"] },
  { label: "Västerort", value: "Västerort", aliases: ["västerort", "vasterort", "bromma", "alvik", "vällingby", "vallingby", "hässelby", "hasselby", "spånga", "spanga", "kista"] },
  { label: "Norrort", value: "Norrort", aliases: ["norrort", "solna", "sundbyberg", "danderyd", "täby", "taby", "sollentuna"] },
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
  if (kind === "Latest") return lang === "sv" ? "⚡ Senast tillagda" : "⚡ Latest added";
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

function ExternalMapLinks({
  place,
  lang = "sv",
  onDirectionRequest,
}: {
  place: PlaceInput;
  lang?: Language;
  onDirectionRequest?: () => void;
}) {
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
          onClick={onDirectionRequest}
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
          onClick={onDirectionRequest}
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
          onClick={onDirectionRequest}
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
    kind: ["All places", "Curated", "Saved", "Latest"].includes(kind) ? undefined : (kind as EstablishmentType),
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

  const handleSelect = (placeName: string, explicitId?: number) => {
    if (explicitId) {
      onSelectPlace(explicitId);
      document.getElementById("map")?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    const cleanQuery = placeName
      .replace(/^\d+[\.\)]\s*/, "")
      .replace(/\s*\([^)]*\)/g, "")
      .trim()
      .toLowerCase();

    const match =
      places.find((p) => p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase() === cleanQuery) ||
      places.find((p) => {
        const pClean = p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
        return pClean.startsWith(cleanQuery) || cleanQuery.startsWith(pClean);
      }) ||
      places.find((p) => p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase().includes(cleanQuery)) ||
      places.find((p) => {
        const pClean = p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
        return cleanQuery.includes(pClean) && pClean.length > 4;
      }) ||
      places.find((p) => {
        const tokens = cleanQuery.split(/\s+/).filter((t) => t.length > 2);
        const pLower = p.name.toLowerCase();
        return tokens.length > 0 && tokens.every((t) => pLower.includes(t));
      });

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
        const cardNameClean = card.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
        const matchedPlace =
          places.find((p) => p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase() === cardNameClean) ||
          places.find((p) => {
            const pClean = p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
            return pClean.startsWith(cardNameClean) || cardNameClean.startsWith(pClean);
          }) ||
          places.find((p) => p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase().includes(cardNameClean)) ||
          places.find((p) => {
            const pClean = p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
            return cardNameClean.includes(pClean) && pClean.length > 4;
          });

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
                  onClick={() => handleSelect(card.name, matchedPlace?.id)}
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
                onClick={() => handleSelect(card.name, matchedPlace?.id)}
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

  // Touch swipe handling for mobile & tablet
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) {
        handleNext();
      } else {
        handlePrev();
      }
    } else if (dy > 80 && Math.abs(dy) > Math.abs(dx)) {
      onClose();
    }
  };

  if (!currentPhoto) return null;

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button type="button" className="lightbox-close-btn" onClick={onClose} aria-label="Close lightbox">
        ✕
      </button>

      <div
        className="lightbox-content"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {total > 1 ? (
          <>
            <button
              type="button"
              className="lightbox-nav-btn lightbox-prev-btn"
              onClick={handlePrev}
              aria-label="Previous photo"
            >
              <CaretLeft size={22} weight="bold" />
            </button>
            <button
              type="button"
              className="lightbox-nav-btn lightbox-next-btn"
              onClick={handleNext}
              aria-label="Next photo"
            >
              <CaretRight size={22} weight="bold" />
            </button>
          </>
        ) : null}

        <img src={currentPhoto.url} alt={currentPhoto.caption} className="lightbox-img" />

        <div className="lightbox-caption-bar">
          <div className="lightbox-caption-text">
            <b>{currentPhoto.caption}</b>
            {total > 1 ? <span className="lightbox-counter">({index + 1} / {total})</span> : null}
          </div>
          {currentPhoto.credit ? <small className="lightbox-credit">{currentPhoto.credit}</small> : null}
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
          {lang === "sv" ? "Recensioner" : "Reviews"} ({reviews?.length ?? "..."})
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
  type: "Official City Guide" | "Verified Guide" | "Municipal Inspection" | "Open Data" | "Editorial Review" | "Community";
  description: string;
  license: string;
  verifiedCount?: number;
  addedByUser?: boolean;
}

export const INITIAL_CURATED_SOURCES = DEFAULT_CURATED_SOURCES;

const curatedSourceTypes: CuratedSource["type"][] = [
  "Official City Guide",
  "Verified Guide",
  "Municipal Inspection",
  "Open Data",
  "Editorial Review",
  "Community",
];

const curatedSourceTypeLabels: Record<Language, Record<CuratedSource["type"], string>> = {
  sv: {
    "Official City Guide": "Official City Guide",
    "Verified Guide": "Verified Guide",
    "Municipal Inspection": "Municipal Inspection",
    "Open Data": "Open Data",
    "Editorial Review": "Editorial Review",
    Community: "Community",
  },
  en: {
    "Official City Guide": "Official City Guide",
    "Verified Guide": "Verified Guide",
    "Municipal Inspection": "Municipal Inspection",
    "Open Data": "Open Data",
    "Editorial Review": "Editorial Review",
    Community: "Community",
  },
};

const curatedSourceEnglishCopy: Record<string, Partial<Pick<CuratedSource, "name" | "description" | "license">>> = {
  "husa-guide": {
    description:
      "Curated restaurant guide from Michelin and World's 50 Best jury members Anders Husa & Kaitlin Orr.",
    license: "Cited with permission (andershusa.com)",
  },
  "stockholm-stad": {
    description: "Official municipal environmental health and food-control inspection records.",
    license: "CC0 1.0 Universal / Open municipal data",
  },
  openstreetmap: {
    description: "Geographic coordinates, building outlines, and independent POI identities for Stockholm.",
  },
  "white-guide": {
    description: "Nordic restaurant and fika assessments by independent gastronomy professionals.",
    license: "Editorial review",
  },
  "specialty-coffee-se": {
    description: "Quality-assured coffee bean sources, traceability evidence, and roaster verification in Stockholm.",
    license: "Open industry standard",
  },
  "visit-stockholm": {
    name: "Visit Stockholm (Official City Guide)",
    description:
      "Official visitor and restaurant guide from the City of Stockholm, covering local food culture, restaurants, and cafes.",
    license: "Official city portal (City of Stockholm)",
  },
};

function localizedCuratedSource(source: CuratedSource, lang: Language): CuratedSource {
  if (lang !== "en") return source;
  return { ...source, ...curatedSourceEnglishCopy[source.id] };
}

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
  onAddReview: (placeId: number, review: { author: string; rating: number; content: string; source: "Community Submission" }) => void;
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
  const [sourceLicense, setSourceLicense] = useState(
    lang === "sv" ? "Öppen data / Citerat med tillstånd" : "Open data / Cited with permission",
  );
  const [sourceDesc, setSourceDesc] = useState("");
  const sourceModalCopy =
    lang === "sv"
      ? {
          title: "📜 Lägg till ny kurerad källa",
          nameLabel: "Källans namn / Titel *",
          namePlaceholder: "t.ex. Guide Michelin Stockholm eller Krogen & Bageriet",
          urlLabel: "Webbadress / URL *",
          typeLabel: "Typ av källa",
          typeHelp: {
            "Official City Guide": "Official City Guide (Officiell stads- eller besöksguide)",
            "Verified Guide": "Verified Guide (Redaktionell krog- & matguide)",
            "Municipal Inspection": "Municipal Inspection (Kommunalt tillsynsregister)",
            "Open Data": "Open Data (Öppet API / Databas)",
            "Editorial Review": "Editorial Review (Tidningsrecension)",
            Community: "Community (Verifierad användarsamling)",
          },
          licenseLabel: "Licens & Upphovsrättsattribuering",
          licensePlaceholder: "t.ex. CC0 1.0, ODbL, eller Citerat med tillstånd",
          descriptionLabel: "Källbeskrivning & Omfång",
          descriptionPlaceholder: "Beskriv vad källan granskar och bidrar med...",
          defaultLicense: "Citerat med källhänvisning",
          defaultDescription: "Kurerat källmaterial inskickat av användare.",
          submit: "Lägg till ny kurerad källa i registret",
        }
      : {
          title: "📜 Add new curated source",
          nameLabel: "Source name / Title *",
          namePlaceholder: "e.g. Michelin Guide Stockholm or Local Food Registry",
          urlLabel: "Web address / URL *",
          typeLabel: "Source type",
          typeHelp: {
            "Official City Guide": "Official City Guide",
            "Verified Guide": "Verified Guide",
            "Municipal Inspection": "Municipal Inspection",
            "Open Data": "Open Data",
            "Editorial Review": "Editorial Review",
            Community: "Community",
          },
          licenseLabel: "License & copyright attribution",
          licensePlaceholder: "e.g. CC0 1.0, ODbL, or Cited with permission",
          descriptionLabel: "Source description & scope",
          descriptionPlaceholder: "Describe what the source verifies and contributes...",
          defaultLicense: "Cited with source attribution",
          defaultDescription: "Curated source material submitted for admin review.",
          submit: "Add curated source to registry",
        };

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
      tags: [...tags.split(",").map((t) => t.trim()).filter(Boolean), "Community submission", "Pending verification"],
      evidenceLabel: "Pending community submission · not independently verified",
      lifecycleState: "candidate",
      ratingAverage: 4.1,
      reliableRatingCount: 0,
      reviewCount: 0,
      categoryMeanRating: 4.1,
      categoryPopularityRaw: 0,
      localPopularityPercentile: 0.5,
      priceLevel: 2,
      mainstreamExposure: 0,
      ageDays: 1,
      daysSinceFreshEvidence: 365,
      evidence: {
        specialistGuide: 0,
        independentEditorial: 0,
        verifiedUserRating: 0,
        repeatVisits: 0,
        recentReviews: 0,
        credibleReviewers: 0,
        inspectionStatus: 0,
        verifiedAttributes: 0,
        dataFreshness: 10,
        confidence: "Low",
      },
      latitude: activePlace && activePlace.latitude != null ? activePlace.latitude + 0.002 : 59.3326 + (Math.random() - 0.5) * 0.02,
      longitude: activePlace && activePlace.longitude != null ? activePlace.longitude + 0.002 : 18.0649 + (Math.random() - 0.5) * 0.02,
      engagement: {
        searchImpressions: 0,
        profileViews: 0,
        mapMarkerClicks: 0,
        saves: 0,
        directionRequests: 0,
        confirmedVisits: 0,
        repeatVisits: 0,
        recommendations: 0,
        recentSaves: 0,
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
      source: "Community Submission",
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
      license: sourceLicense.trim() || sourceModalCopy.defaultLicense,
      description: sourceDesc.trim() || sourceModalCopy.defaultDescription,
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
            {mode === "add_source" && sourceModalCopy.title}
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
              <label>{sourceModalCopy.nameLabel}</label>
              <input
                type="text"
                required
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder={sourceModalCopy.namePlaceholder}
              />
            </div>
            <div className="superpower-form-group">
              <label>{sourceModalCopy.urlLabel}</label>
              <input
                type="url"
                required
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="superpower-form-group">
              <label>{sourceModalCopy.typeLabel}</label>
              <select value={sourceType} onChange={(e) => setSourceType(e.target.value as CuratedSource["type"])}>
                {curatedSourceTypes.map((type) => (
                  <option key={type} value={type}>
                    {sourceModalCopy.typeHelp[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="superpower-form-group">
              <label>{sourceModalCopy.licenseLabel}</label>
              <input
                type="text"
                value={sourceLicense}
                onChange={(e) => setSourceLicense(e.target.value)}
                placeholder={sourceModalCopy.licensePlaceholder}
              />
            </div>
            <div className="superpower-form-group">
              <label>{sourceModalCopy.descriptionLabel}</label>
              <textarea
                rows={2}
                value={sourceDesc}
                onChange={(e) => setSourceDesc(e.target.value)}
                placeholder={sourceModalCopy.descriptionPlaceholder}
              />
            </div>
            <button type="submit" className="superpower-submit-btn">
              <ShieldCheck size={16} /> {sourceModalCopy.submit}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function CuratedSourcesPanel({
  sources,
  isLoading,
  lang,
  onAddSource,
}: {
  sources: CuratedSource[];
  isLoading?: boolean;
  lang: Language;
  onAddSource?: () => void;
}) {
  const copy =
    lang === "sv"
      ? {
          kicker: "Källregister",
          title: "Kurerade öppna källor",
          description:
            "Auditerbara datakällor och verifierade guider som driver Motkartas ranking.",
          addSource: "Lägg till ny källa",
          syncing: "D1-sync...",
          submitted: "Inskickad källa",
          dataPoints: "datapunkter",
        }
      : {
          kicker: "Source registry",
          title: "Curated open sources",
          description:
            "Auditable data sources and verified guides powering Motkarta's ranking.",
          addSource: "Add new source",
          syncing: "D1 sync...",
          submitted: "Submitted source",
          dataPoints: "data points",
        };

  return (
    <section className="admin-curated-sources-panel" id="sources" aria-labelledby="sources-title">
      <div className="admin-curated-sources-head">
        <div>
          <h2 id="sources-title">
            📜 {copy.title} ({sources.length})
          </h2>
          <p>{copy.description}</p>
        </div>
        {onAddSource ? (
          <button type="button" className="admin-source-add-btn" onClick={onAddSource}>
            <PlusCircle size={15} weight="bold" /> {copy.addSource}
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <p className="admin-source-sync" aria-live="polite">
          <CircleNotch size={13} className="animate-spin" /> {copy.syncing}
        </p>
      ) : null}

      <div className="admin-sources-grid">
        {sources.map((source) => {
          const displaySource = localizedCuratedSource(source, lang);
          return (
            <article className="admin-source-card" key={source.id}>
              <div>
                <div className="admin-source-card-topline">
                  <span className="admin-source-badge">
                    <span className="admin-source-dot" aria-hidden="true" />
                    {curatedSourceTypeLabels[lang][source.type]}
                  </span>
                  {source.addedByUser ? <span className="admin-source-user-tag">{copy.submitted}</span> : null}
                </div>
                <h3>
                  <a href={displaySource.url} target="_blank" rel="noopener noreferrer">
                    {displaySource.name} <ArrowSquareOut size={13} />
                  </a>
                </h3>
                <p>{displaySource.description}</p>
              </div>
              <div className="admin-source-meta">
                <span>📜 {displaySource.license}</span>
                {displaySource.verifiedCount ? (
                  <span>
                    {displaySource.verifiedCount.toLocaleString(lang === "sv" ? "sv-SE" : "en-US")} {copy.dataPoints}
                  </span>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

type AdminStateFilter = PlaceLifecycleState | "unresolved_region" | "needs_input" | "ml_dashboard" | "all";
type AdminValidationLabel = NonNullable<PlaceInput["validationLabel"]>;

type AdminCandidate = {
  id: number;
  name: string;
  kind: string;
  area: string;
  address: string | null;
  website: string | null;
  note: string;
  lifecycleState: PlaceLifecycleState;
  validationLabel: AdminValidationLabel | null;
  validationNotes: string | null;
  candidateSourceType: string | null;
  candidateSourceId: string | null;
  candidateReviewStatus: string | null;
  candidateAllowedUse: string | null;
  duplicateResolution: "merged" | "keep_separate" | null;
  mergedIntoEstablishmentId: number | null;
  updatedAt: string | null;
  createdAt: string | null;
  evidenceCount: number;
  evidenceSourceTypes: string[];
  latestEvidenceAt: string | null;
  evidenceGate: {
    independentEvidenceCount: number;
    independentEvidenceTypes: string[];
    canPromoteHiddenGem: boolean;
    hasCurrentExistence: boolean;
    sourceGaps: string[];
  };
  possibleDuplicateCount: number;
  possibleDuplicates: AdminDuplicateMatch[];
};

type AdminDuplicateMatch = {
  id: number;
  name: string;
  kind: string;
  area: string;
  lifecycleState: string;
  reason: string;
};

type AdminReviewLabelExport = {
  source?: string;
  updatedAt?: string;
  policy?: string;
  labels?: unknown[];
  duplicateResolutions?: unknown[];
  error?: string;
};

type AdminReviewDashboard = {
  source?: string;
  generatedAt?: string;
  nextStep?: "export" | "review" | "harvest" | "caught_up";
  actions?: {
    harvestNeeded: boolean;
    reviewNeeded: boolean;
    exportNeeded: boolean;
  };
  counts?: {
    candidateCount: number;
    newCandidateCount: number;
    hiddenGemReadyCount: number;
    needsEvidenceCount: number;
    possibleDuplicateCount: number;
    reviewEventCount: number;
    unexportedReviewCount: number;
  };
  latestReviewAt?: string | null;
  lastExportedAt?: string | null;
  exportLogAvailable?: boolean;
  error?: string;
};

type AdminSchemaStatus = {
  source?: string;
  checkedAt?: string;
  ready?: boolean;
  success?: boolean;
  baseSchemaReady?: boolean;
  missing?: Array<{
    kind: "missing_table" | "missing_column";
    table: string;
    column?: string;
  }>;
  error?: string;
};

type AdminSessionStatus = {
  admin: boolean;
  authMode?: "access_jwt" | "access_header" | "token" | "none";
  email?: string;
  reason?: string;
  configured?: {
    token: boolean;
    accessJwt: boolean;
    trustedHeaders: boolean;
    emailAllowlist: boolean;
  };
  error?: string;
};

type MlStatusResponse = {
  source?: string;
  timestamp?: string;
  models?: Array<{
    id: string;
    name: string;
    type: string;
    validation: string;
    status: string;
    description: string;
    metrics: Record<string, unknown>;
  }>;
  seabornCharts?: Array<{
    id: string;
    title: string;
    url: string;
    description: string;
  }>;
  lifecycleStages?: Array<{
    stage: string;
    completion: number;
    status: string;
    notes: string;
  }>;
  gapsAndImprovements?: Array<{
    id: string;
    title: string;
    impactScore: number;
    category: string;
    problem: string;
    solution: string;
  }>;
  telemetry?: {
    totalEvents?: number;
    last24hEvents?: number;
    eventsByMode?: Record<string, number>;
    eventsByType?: Record<string, number>;
    positionDistribution?: Record<string, number>;
  };
  codeSnippets?: Array<{
    id: string;
    title: string;
    filename: string;
    description: string;
    code: string;
  }>;
  error?: string;
};

function AdminMlDashboard({
  lang = "sv",
  adminHeaders,
  hasAdminAuth,
}: {
  lang?: Language;
  adminHeaders: (tokenOverride?: string, extraHeaders?: Record<string, string>) => Record<string, string>;
  hasAdminAuth: boolean;
}) {
  const [data, setData] = useState<MlStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("model_discovery");
  const [activeChartTab, setActiveChartTab] = useState("eda_feature_relationships");
  const [previewChartUrl, setPreviewChartUrl] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadMlStatus = useCallback(async () => {
    if (!hasAdminAuth) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/ml-status", {
        headers: adminHeaders(),
      });
      const res = (await resp.json().catch(() => ({}))) as MlStatusResponse;
      if (!resp.ok) {
        throw new Error(res.error ?? (lang === "sv" ? "Kunde inte ladda ML-status." : "Could not load ML status."));
      }
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [hasAdminAuth, adminHeaders, lang]);

  useEffect(() => {
    void loadMlStatus();
  }, [loadMlStatus]);

  const copyCode = (codeText: string, id: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(codeText);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  if (loading && !data) {
    return (
      <div className="admin-review-empty">
        <CircleNotch size={20} className="animate-spin" />
        <span>{lang === "sv" ? "Laddar ML-modeller & Seaborn-grafer..." : "Loading ML models & Seaborn charts..."}</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="admin-review-empty">
        <span className="admin-review-error">{error}</span>
      </div>
    );
  }

  const activeSnippet = data?.codeSnippets?.find((s) => s.id === activeTab) ?? data?.codeSnippets?.[0];
  const activeSeabornChart = data?.seabornCharts?.find((c) => c.id === activeChartTab) ?? data?.seabornCharts?.[0];

  return (
    <div className="admin-ml-container">
      <header className="admin-ml-header">
        <div className="admin-ml-title-group">
          <h3>
            <Sparkle size={20} weight="fill" style={{ color: "var(--color-gold)" }} />
            {lang === "sv" ? "Machine Learning Status, Seaborn Grafer & Livscykel" : "Machine Learning Status, Seaborn Charts & Lifecycle"}
          </h3>
          <p>
            {lang === "sv"
              ? "Fullständig livscykel för Motkartas ML-modeller, Seaborn EDA- & Residualgrafer, samt identifierade systemluckor."
              : "Complete lifecycle for Motkarta's ML models, Seaborn EDA & Residual graphs, and identified system gaps."}
          </p>
        </div>
        <button type="button" className="admin-ml-refresh-btn" onClick={() => void loadMlStatus()} disabled={loading}>
          {loading ? <CircleNotch size={14} className="animate-spin" /> : <Clock size={14} weight="bold" />}
          {lang === "sv" ? "Uppdatera status" : "Refresh status"}
        </button>
      </header>

      {/* 1. Model Status Cards */}
      <div className="admin-ml-cards-grid">
        {(data?.models ?? []).map((model) => (
          <div key={model.id} className="admin-ml-card">
            <div className="admin-ml-card-header">
              <span className="admin-ml-status-pill">{model.status}</span>
              <span className="admin-ml-model-type">{model.type}</span>
            </div>
            <h4>{model.name}</h4>
            <p className="admin-ml-card-desc">{model.description}</p>
            <div className="admin-ml-validation-tag">
              <ShieldCheck size={12} weight="bold" /> {model.validation}
            </div>
            <div className="admin-ml-metrics-row">
              {Object.entries(model.metrics).map(([k, v]) => (
                <div key={k} className="admin-ml-metric-badge">
                  <span className="admin-ml-metric-key">{k}</span>
                  <span className="admin-ml-metric-val">{Array.isArray(v) ? v.length : String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 2. Python Seaborn Visualization Gallery */}
      <div className="admin-ml-seaborn-section">
        <div className="admin-ml-seaborn-header">
          <h4>
            <Image size={18} weight="bold" />
            {lang === "sv" ? "Python Seaborn Grafer & Diagnosticering" : "Python Seaborn Charts & Diagnostics"}
          </h4>
          <p>
            {lang === "sv"
              ? "Genererade Seaborn EDA-plots, korrelationsmatriser, residualfelevalvering och Isolation Forest avvikelser."
              : "Generated Seaborn EDA plots, correlation matrices, residual error evaluation, and Isolation Forest outliers."}
          </p>
        </div>

        {/* Seaborn Chart Selector Tabs */}
        <div className="admin-ml-code-tabs">
          {(data?.seabornCharts ?? []).map((chart) => (
            <button
              key={chart.id}
              type="button"
              className={`admin-ml-code-tab ${activeChartTab === chart.id ? "active" : ""}`}
              onClick={() => setActiveChartTab(chart.id)}
            >
              <span>{chart.title}</span>
            </button>
          ))}
        </div>

        {/* Display Active Seaborn Chart */}
        {activeSeabornChart ? (
          <div className="admin-ml-seaborn-display-card">
            <div className="admin-ml-seaborn-topbar">
              <div>
                <h5>{activeSeabornChart.title}</h5>
                <small>{activeSeabornChart.description}</small>
              </div>
              <button
                type="button"
                className="admin-ml-copy-btn"
                onClick={() => setPreviewChartUrl(activeSeabornChart.url)}
              >
                <ArrowsOut size={13} weight="bold" />
                {lang === "sv" ? "Förstora graf" : "Enlarge chart"}
              </button>
            </div>
            <div className="admin-ml-seaborn-img-container">
              <img
                src={activeSeabornChart.url}
                alt={activeSeabornChart.title}
                className="admin-ml-seaborn-img"
                onClick={() => setPreviewChartUrl(activeSeabornChart.url)}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* 3. Full ML Model Lifecycle & Stage Progress */}
      <div className="admin-ml-charts-section">
        <h4>
          <Sliders size={18} weight="bold" />
          {lang === "sv" ? "ML-Modellers Livscykel & Genomförandegrad" : "ML Model Lifecycle & Progress Tracking"}
        </h4>

        <div className="admin-ml-lifecycle-grid">
          {(data?.lifecycleStages ?? []).map((stage, idx) => (
            <div key={idx} className="admin-ml-lifecycle-stage-row">
              <div className="admin-ml-lifecycle-stage-meta">
                <span className="admin-ml-lifecycle-stage-title">{stage.stage}</span>
                <span className="admin-ml-lifecycle-stage-pct">{stage.completion}%</span>
              </div>
              <div className="admin-ml-bar-track">
                <div
                  className={`admin-ml-bar-fill ${stage.completion === 100 ? "complete" : stage.completion >= 70 ? "in-progress" : "planned"}`}
                  style={{ width: `${stage.completion}%` }}
                />
              </div>
              <small className="admin-ml-lifecycle-notes">{stage.notes}</small>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Identified ML System Gaps & Needed Improvements */}
      <div className="admin-ml-gaps-section">
        <div className="admin-ml-gaps-header">
          <h4>
            <Scales size={18} weight="bold" />
            {lang === "sv" ? "Vad Vi Saknar & Behöver Förbättra (Gap Analysis)" : "What We Miss & Need to Improve (Gap Analysis)"}
          </h4>
          <p>
            {lang === "sv"
              ? "Identifierade utmaningar i nuvarande ML-arkitektur och rekommenderade förbättringsåtgärder."
              : "Identified challenges in the current ML architecture and recommended improvement actions."}
          </p>
        </div>

        <div className="admin-ml-gaps-grid">
          {(data?.gapsAndImprovements ?? []).map((gap) => (
            <div key={gap.id} className="admin-ml-gap-card">
              <div className="admin-ml-gap-card-header">
                <span className="admin-ml-gap-badge">{gap.category}</span>
                <span className="admin-ml-gap-severity">Impact {gap.impactScore}/100</span>
              </div>
              <h5>{gap.title}</h5>
              <div className="admin-ml-gap-problem">
                <strong>{lang === "sv" ? "Utmaning:" : "Challenge:"}</strong> {gap.problem}
              </div>
              <div className="admin-ml-gap-solution">
                <strong>{lang === "sv" ? "Lösning & Åtgärd:" : "Solution & Action:"}</strong> {gap.solution}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fullscreen Lightbox Preview for Seaborn Charts */}
      {previewChartUrl ? (
        <div className="admin-ml-lightbox" onClick={() => setPreviewChartUrl(null)}>
          <div className="admin-ml-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="admin-ml-lightbox-close" onClick={() => setPreviewChartUrl(null)}>
              ✕
            </button>
            <img src={previewChartUrl} alt="Seaborn ML Chart Full Preview" className="admin-ml-lightbox-img" />
          </div>
        </div>
      ) : null}

      {/* 3. Python Code Journey */}
      <div className="admin-ml-code-section">
        <div className="admin-ml-code-header">
          <h4>
            <TerminalWindow size={18} weight="bold" />
            {lang === "sv" ? "Python Kodresa — Våra ML-skript & Algoritmer" : "Python Code Journey — Our ML Scripts & Algorithms"}
          </h4>
          <p>
            {lang === "sv"
              ? "Bläddra igenom den faktiska Python-koden för avvikelsedetektering, residualberäkning och recommendation scoring."
              : "Browse the actual Python code driving anomaly detection, residual calculations, and recommendation scoring."}
          </p>
        </div>

        {/* Code Tabs */}
        <div className="admin-ml-code-tabs">
          {(data?.codeSnippets ?? []).map((snippet) => (
            <button
              key={snippet.id}
              type="button"
              className={`admin-ml-code-tab ${activeTab === snippet.id ? "active" : ""}`}
              onClick={() => setActiveTab(snippet.id)}
            >
              <span>{snippet.title}</span>
            </button>
          ))}
        </div>

        {/* Code Container */}
        {activeSnippet ? (
          <div className="admin-ml-code-block">
            <div className="admin-ml-code-topbar">
              <span className="admin-ml-code-filename">{activeSnippet.filename}</span>
              <span className="admin-ml-code-desc">{activeSnippet.description}</span>
              <button
                type="button"
                className="admin-ml-copy-btn"
                onClick={() => copyCode(activeSnippet.code, activeSnippet.id)}
              >
                <Copy size={13} weight="bold" />
                {copiedId === activeSnippet.id
                  ? (lang === "sv" ? "Kopierad!" : "Copied!")
                  : (lang === "sv" ? "Kopiera kod" : "Copy code")}
              </button>
            </div>
            <pre className="admin-ml-code-pre">
              <code>{activeSnippet.code}</code>
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const adminStateFilters: AdminStateFilter[] = ["candidate", "baseline", "verified", "featured", "unresolved_region", "needs_input", "ml_dashboard", "all"];

function AdminReviewPanel({ lang = "sv" }: { lang?: Language }) {
  const [tokenInput, setTokenInput] = useState(readStoredAdminToken);
  const [adminToken, setAdminToken] = useState(readStoredAdminToken);
  const [stateFilter, setStateFilter] = useState<AdminStateFilter>("candidate");
  const [candidates, setCandidates] = useState<AdminCandidate[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [exportingLabels, setExportingLabels] = useState(false);
  const [resolvingRegions, setResolvingRegions] = useState(false);
  const [websiteInputs, setWebsiteInputs] = useState<Record<number, string>>({});
  const [schemaBusy, setSchemaBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [labelExportStatus, setLabelExportStatus] = useState("");
  const [dashboard, setDashboard] = useState<AdminReviewDashboard | null>(null);
  const [schemaStatus, setSchemaStatus] = useState<AdminSchemaStatus | null>(null);
  const [adminSession, setAdminSession] = useState<AdminSessionStatus | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const hasAdminAuth = adminSession?.admin === true;

  const adminHeaders = useCallback(
    (tokenOverride?: string, extraHeaders?: Record<string, string>) => {
      const token = (tokenOverride ?? adminToken).trim();
      return token
        ? { ...extraHeaders, "x-motkarta-admin-token": token }
        : { ...extraHeaders };
    },
    [adminToken],
  );

  const loadCandidates = useCallback(
    async (tokenOverride?: string) => {
      const token = (tokenOverride ?? adminToken).trim();
      if (!token && !adminSession?.admin) {
        setCandidates([]);
        setStatus("");
        return;
      }

      if (stateFilter === "ml_dashboard") {
        setCandidates([]);
        setStatus(lang === "sv" ? "ML-Dashboard aktiv." : "ML Dashboard active.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/admin/candidates?state=${stateFilter}&limit=100`, {
          headers: adminHeaders(token),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          candidates?: AdminCandidate[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte ladda granskningskön." : "Could not load review queue."));
        }

        const nextCandidates = payload.candidates ?? [];
        const nextNotes: Record<number, string> = {};
        nextCandidates.forEach((candidate) => {
          nextNotes[candidate.id] = candidate.validationNotes ?? "";
        });
        setCandidates(nextCandidates);
        setReviewNotes(nextNotes);
        setStatus(
          lang === "sv"
            ? `${nextCandidates.length} poster laddade från D1.`
            : `${nextCandidates.length} records loaded from D1.`,
        );
      } catch (loadError) {
        setCandidates([]);
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        setLoading(false);
      }
    },
    [adminHeaders, adminSession?.admin, adminToken, lang, stateFilter],
  );

  const loadDashboard = useCallback(
    async (tokenOverride?: string) => {
      const token = (tokenOverride ?? adminToken).trim();
      if (!token && !adminSession?.admin) {
        setDashboard(null);
        return;
      }

      setLoadingDashboard(true);
      try {
        const response = await fetch("/api/admin/review-dashboard", {
          headers: adminHeaders(token),
        });
        const payload = (await response.json().catch(() => ({}))) as AdminReviewDashboard;

        if (!response.ok) {
          throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte ladda sessionsstatus." : "Could not load session status."));
        }

        setDashboard(payload);
      } catch (dashboardError) {
        setDashboard(null);
        setError(dashboardError instanceof Error ? dashboardError.message : String(dashboardError));
      } finally {
        setLoadingDashboard(false);
      }
    },
    [adminHeaders, adminSession?.admin, adminToken, lang],
  );

  const loadSchemaStatus = useCallback(
    async (tokenOverride?: string) => {
      const token = (tokenOverride ?? adminToken).trim();
      if (!token && !adminSession?.admin) {
        setSchemaStatus(null);
        return;
      }

      try {
        const response = await fetch("/api/admin/schema", {
          headers: adminHeaders(token),
        });
        const payload = (await response.json().catch(() => ({}))) as AdminSchemaStatus;

        if (!response.ok) {
          throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte läsa schema-status." : "Could not read schema status."));
        }

        setSchemaStatus(payload);
        return payload;
      } catch (schemaError) {
        setSchemaStatus(null);
        setError(schemaError instanceof Error ? schemaError.message : String(schemaError));
        return null;
      }
    },
    [adminHeaders, adminSession?.admin, adminToken, lang],
  );

  const runAdminSelfCheck = useCallback(
    async (tokenOverride?: string) => {
      const token = (tokenOverride ?? adminToken).trim();
      if (!token && !adminSession?.admin) return null;

      setSchemaBusy(true);
      setError(null);

      try {
        const response = await fetch("/api/admin/schema", {
          method: "POST",
          headers: adminHeaders(token),
        });
        const payload = (await response.json().catch(() => ({}))) as AdminSchemaStatus;

        if (!response.ok) {
          throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte köra runtime-check." : "Could not run runtime check."));
        }

        setSchemaStatus(payload);
        if (payload.ready) {
          setStatus(lang === "sv" ? "Runtime-check klar. DB och adminschema är redo." : "Runtime check complete. DB and admin schema are ready.");
          await Promise.all([loadDashboard(token), loadCandidates(token)]);
        }
        return payload;
      } catch (schemaError) {
        setDashboard(null);
        setCandidates([]);
        setError(schemaError instanceof Error ? schemaError.message : String(schemaError));
        return null;
      } finally {
        setSchemaBusy(false);
      }
    },
    [adminHeaders, adminSession?.admin, adminToken, lang, loadCandidates, loadDashboard],
  );

  const checkAdminSession = useCallback(
    async (tokenOverride?: string) => {
      const token = (tokenOverride ?? adminToken).trim();
      setCheckingSession(true);

      try {
        const response = await fetch("/api/admin/session", {
          headers: adminHeaders(token),
        });
        const payload = (await response.json().catch(() => ({}))) as AdminSessionStatus;
        setAdminSession(payload);

        if (!response.ok || !payload.admin) {
          if (!token) {
            setStatus(payload.reason ?? (lang === "sv" ? "Admin-konto krävs." : "Admin account required."));
          }
          return payload;
        }

        setStatus(
          payload.email
            ? lang === "sv"
              ? `Adminsession redo: ${payload.email}.`
              : `Admin session ready: ${payload.email}.`
            : lang === "sv"
              ? "Adminsession redo."
              : "Admin session ready.",
        );
        return payload;
      } catch (sessionError) {
        const message = sessionError instanceof Error ? sessionError.message : String(sessionError);
        setAdminSession({ admin: false, reason: message });
        setStatus(message);
        return null;
      } finally {
        setCheckingSession(false);
      }
    },
    [adminHeaders, adminToken, lang],
  );

  useEffect(() => {
    void checkAdminSession();
  }, []);

  useEffect(() => {
    if (adminSession?.admin) {
      void runAdminSelfCheck(adminToken);
    }
  }, [adminSession?.admin]);

  useEffect(() => {
    if (hasAdminAuth && schemaStatus?.ready) {
      void loadCandidates();
    }
  }, [hasAdminAuth, schemaStatus?.ready, loadCandidates]);

  const handleUnlock = (event: React.FormEvent) => {
    event.preventDefault();
    const token = tokenInput.trim();
    setAdminToken(token);
    if (typeof window !== "undefined" && token) {
      window.sessionStorage.setItem("motkarta_admin_token", token);
    }
    void checkAdminSession(token);
  };

  const handleForgetToken = () => {
    setAdminToken("");
    setTokenInput("");
    setCandidates([]);
    setReviewNotes({});
    setStatus("");
    setLabelExportStatus("");
    setDashboard(null);
    setSchemaStatus(null);
    setError(null);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("motkarta_admin_token");
    }
    void checkAdminSession("");
  };

  const handleAdminLogout = () => {
    setAdminToken("");
    setTokenInput("");
    setCandidates([]);
    setReviewNotes({});
    setStatus("");
    setLabelExportStatus("");
    setDashboard(null);
    setSchemaStatus(null);
    setError(null);

    if (typeof window === "undefined") {
      void checkAdminSession("");
      return;
    }

    window.sessionStorage.removeItem("motkarta_admin_token");

    if (adminSession?.authMode === "token") {
      void checkAdminSession("");
      return;
    }

    window.location.assign("/cdn-cgi/access/logout");
  };

  const promoteCandidate = async (
    candidate: AdminCandidate,
    lifecycleState: PlaceLifecycleState,
    validationLabel: AdminValidationLabel,
  ) => {
    if (!hasAdminAuth) return;

    const validationNotes = (reviewNotes[candidate.id] ?? candidate.validationNotes ?? "").trim();
    setBusyId(candidate.id);
    setError(null);

    try {
      const response = await fetch("/api/admin/candidates", {
        method: "POST",
        headers: adminHeaders(undefined, { "content-type": "application/json" }),
        body: JSON.stringify({
          id: candidate.id,
          state: lifecycleState,
          validationLabel,
          validationNotes,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        reviewedAt?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte spara granskningen." : "Could not save review."));
      }

      const updatedCandidate: AdminCandidate = {
        ...candidate,
        lifecycleState,
        validationLabel,
        validationNotes: validationNotes || null,
        updatedAt: payload.reviewedAt ?? new Date().toISOString(),
      };

      setCandidates((current) =>
        current.flatMap((row) => {
          if (row.id !== candidate.id) {
            return [row];
          }

          if (stateFilter !== "all" && lifecycleState !== stateFilter) {
            return [];
          }

          return [updatedCandidate];
        }),
      );
      setStatus(
        lang === "sv"
          ? `${candidate.name} uppdaterades till ${lifecycleStateLabel(lifecycleState, lang)}.`
          : `${candidate.name} updated to ${lifecycleStateLabel(lifecycleState, lang)}.`,
      );
      void loadDashboard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusyId(null);
    }
  };

  const resolveDuplicate = async (
    candidate: AdminCandidate,
    action: "merge_duplicate" | "keep_separate",
    targetId?: number,
  ) => {
    if (!hasAdminAuth) return;

    const validationNotes = (reviewNotes[candidate.id] ?? candidate.validationNotes ?? "").trim();
    setBusyId(candidate.id);
    setError(null);

    try {
      const response = await fetch("/api/admin/candidates", {
        method: "POST",
        headers: adminHeaders(undefined, { "content-type": "application/json" }),
        body: JSON.stringify({
          id: candidate.id,
          action,
          targetId,
          validationNotes,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        reviewedAt?: string;
        targetEstablishmentId?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte spara dubblettbeslutet." : "Could not save duplicate decision."));
      }

      if (action === "merge_duplicate") {
        setCandidates((current) => current.filter((row) => row.id !== candidate.id));
        setStatus(
          lang === "sv"
            ? `${candidate.name} slogs ihop med #${payload.targetEstablishmentId ?? targetId}.`
            : `${candidate.name} merged into #${payload.targetEstablishmentId ?? targetId}.`,
        );
      } else {
        setCandidates((current) =>
          current.map((row) =>
            row.id === candidate.id
              ? {
                  ...row,
                  duplicateResolution: "keep_separate",
                  candidateReviewStatus: "duplicate_checked_keep_separate",
                  validationNotes: validationNotes || row.validationNotes,
                  updatedAt: payload.reviewedAt ?? new Date().toISOString(),
                  possibleDuplicateCount: 0,
                  possibleDuplicates: [],
                }
              : row,
          ),
        );
        setStatus(
          lang === "sv"
            ? `${candidate.name} markerades som separat plats.`
            : `${candidate.name} marked as a separate place.`,
        );
      }
      void loadDashboard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusyId(null);
    }
  };

  const updateCandidateRegion = async (candidate: AdminCandidate, district: string) => {
    if (!hasAdminAuth || !district) return;

    const validationNotes = (reviewNotes[candidate.id] ?? candidate.validationNotes ?? "").trim();
    setBusyId(candidate.id);
    setError(null);

    try {
      const response = await fetch("/api/admin/candidates", {
        method: "POST",
        headers: adminHeaders(undefined, { "content-type": "application/json" }),
        body: JSON.stringify({
          id: candidate.id,
          action: "update_district",
          district,
          validationNotes,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        reviewedAt?: string;
        district?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte spara region." : "Could not save region."));
      }

      setCandidates((current) =>
        current.flatMap((row) => {
          if (row.id !== candidate.id) return [row];
          if (stateFilter === "unresolved_region" && !isBroadStockholmArea(district)) {
            return [];
          }
          return [{ ...row, area: district, updatedAt: payload.reviewedAt ?? new Date().toISOString() }];
        }),
      );
      setStatus(
        lang === "sv"
          ? `${candidate.name} uppdaterades till region ${district}.`
          : `${candidate.name} updated to region ${district}.`,
      );
      void loadDashboard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusyId(null);
    }
  };

  const updateCandidateWebsite = async (candidate: AdminCandidate, rawWebsite: string) => {
    if (!hasAdminAuth || !rawWebsite.trim()) return;

    const website = rawWebsite.trim();
    const validationNotes = (reviewNotes[candidate.id] ?? candidate.validationNotes ?? "").trim();
    setBusyId(candidate.id);
    setError(null);

    try {
      const response = await fetch("/api/admin/candidates", {
        method: "POST",
        headers: adminHeaders(undefined, { "content-type": "application/json" }),
        body: JSON.stringify({
          id: candidate.id,
          action: "update_website",
          website,
          scrapeImage: true,
          validationNotes,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        reviewedAt?: string;
        website?: string;
        scrapedPhotoUrl?: string | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte spara webbadress." : "Could not save website."));
      }

      const updatedWebsite = payload.website ?? website;
      setCandidates((current) =>
        current.flatMap((row) => {
          if (row.id !== candidate.id) return [row];
          if (stateFilter === "needs_input" && updatedWebsite && row.address && !isBroadStockholmArea(row.area)) {
            return [];
          }
          return [{ ...row, website: updatedWebsite, updatedAt: payload.reviewedAt ?? new Date().toISOString() }];
        }),
      );

      setStatus(
        payload.scrapedPhotoUrl
          ? lang === "sv"
            ? `Webbplats sparad för ${candidate.name} & bild hämtades (${payload.scrapedPhotoUrl}).`
            : `Saved website for ${candidate.name} & scraped official photo (${payload.scrapedPhotoUrl}).`
          : lang === "sv"
            ? `Webbplats sparad för ${candidate.name}.`
            : `Saved website for ${candidate.name}.`,
      );
      void loadDashboard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusyId(null);
    }
  };

  const exportReviewLabels = async () => {
    const token = adminToken.trim();
    if (!hasAdminAuth || typeof document === "undefined") return;

    setExportingLabels(true);
    setError(null);
    setLabelExportStatus("");

    try {
      const response = await fetch("/api/admin/review-labels", {
        method: "POST",
        headers: adminHeaders(token),
      });
      const payload = (await response.json().catch(() => ({}))) as AdminReviewLabelExport;

      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte exportera labels." : "Could not export labels."));
      }

      const filePayload = {
        updatedAt: payload.updatedAt ?? new Date().toISOString(),
        policy:
          payload.policy ??
          "Human validation labels exported from admin review events. Duplicate resolutions are kept separate from hidden-gem/mainstream labels.",
        labels: payload.labels ?? [],
        duplicateResolutions: payload.duplicateResolutions ?? [],
      };
      const blob = new Blob([`${JSON.stringify(filePayload, null, 2)}\n`], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `motkarta-human-validation-labels-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setLabelExportStatus(
        lang === "sv"
          ? `Exporterade ${filePayload.labels.length} labels och ${filePayload.duplicateResolutions.length} dubblettbeslut.`
          : `Exported ${filePayload.labels.length} labels and ${filePayload.duplicateResolutions.length} duplicate decisions.`,
      );
      await loadDashboard(token);
      await loadSchemaStatus(token);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setExportingLabels(false);
    }
  };

  const resolvePlacesWithoutRegion = async () => {
    const token = adminToken.trim();
    if (!hasAdminAuth) return;

    setResolvingRegions(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/resolve-regions", {
        method: "POST",
        headers: adminHeaders(token),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        totalChecked?: number;
        resolvedCount?: number;
        updatedPlaces?: Array<{ id: number; name: string; previousDistrict: string; resolvedDistrict: string }>;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte lösa saknade regioner." : "Could not resolve missing regions."));
      }

      const count = payload.resolvedCount ?? 0;
      const examples = (payload.updatedPlaces ?? [])
        .slice(0, 3)
        .map((p) => `${p.name} → ${p.resolvedDistrict}`)
        .join(", ");

      setStatus(
        count > 0
          ? lang === "sv"
            ? `Löste regioner för ${count} platser${examples ? ` (${examples})` : ""}.`
            : `Resolved regions for ${count} places${examples ? ` (${examples})` : ""}.`
          : lang === "sv"
            ? "Alla platser har redan giltiga regioner."
            : "All places already have specific regions.",
      );

      await Promise.all([loadCandidates(token), loadDashboard(token)]);
    } catch (resolveErr) {
      setError(resolveErr instanceof Error ? resolveErr.message : String(resolveErr));
    } finally {
      setResolvingRegions(false);
    }
  };

  return (
    <section className="admin-review-panel" id="admin-review" aria-labelledby="admin-review-title">
      <div className="admin-review-head">
        <div>
          <p className="admin-review-kicker">
            <ShieldCheck size={14} weight="bold" /> {lang === "sv" ? "Adminflöde" : "Admin workflow"}
          </p>
          <h3 id="admin-review-title">
            {lang === "sv" ? "Granskningskö" : "Review queue"}
          </h3>
        </div>

        {hasAdminAuth ? (
          <div className="admin-session-auth" aria-live="polite">
            <ShieldCheck size={14} weight="bold" />
            <span>
              {adminSession?.email
                ? adminSession.email
                : lang === "sv"
                  ? "Adminsession aktiv"
                  : "Admin session active"}
            </span>
            <button type="button" className="admin-review-ghost-btn admin-logout-btn" onClick={handleAdminLogout}>
              <SignOut size={14} weight="bold" />
              {adminSession?.authMode === "token"
                ? lang === "sv"
                  ? "Glöm token"
                  : "Forget token"
                : lang === "sv"
                  ? "Logga ut"
                  : "Log out"}
            </button>
          </div>
        ) : (
          <form className="admin-review-auth" onSubmit={handleUnlock}>
            <label className="sr-only" htmlFor="admin-token">
              {lang === "sv" ? "Lokal admin-token" : "Local admin token"}
            </label>
            <input
              id="admin-token"
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder={lang === "sv" ? "Lokal/dev-token" : "Local/dev token"}
              autoComplete="off"
            />
            <button type="submit" disabled={checkingSession} title={lang === "sv" ? "Lås upp lokal granskningskö" : "Unlock local review queue"}>
              {checkingSession ? <CircleNotch size={14} className="animate-spin" /> : <ShieldCheck size={14} weight="bold" />}
              {checkingSession ? (lang === "sv" ? "Kollar" : "Checking") : lang === "sv" ? "Lås upp" : "Unlock"}
            </button>
            {tokenInput || adminToken ? (
              <button
                type="button"
                className="admin-review-ghost-btn"
                onClick={handleForgetToken}
                title={lang === "sv" ? "Glöm lokal token" : "Forget local token"}
              >
                <X size={14} weight="bold" />
              </button>
            ) : null}
          </form>
        )}
      </div>

      <div className="admin-review-toolbar" aria-label={lang === "sv" ? "Filter för granskningskö" : "Review queue filters"}>
        <div className="admin-state-tabs">
          {adminStateFilters.map((state) => (
            <button
              key={state}
              type="button"
              className={stateFilter === state ? "active" : ""}
              aria-pressed={stateFilter === state}
              onClick={() => setStateFilter(state)}
            >
              {lifecycleStateLabel(state, lang)}
            </button>
          ))}
        </div>
        <div className="admin-toolbar-actions">
          <button
            type="button"
            className="admin-resolve-regions-btn"
            onClick={() => void resolvePlacesWithoutRegion()}
            disabled={!hasAdminAuth || resolvingRegions || loading || schemaStatus?.ready !== true}
            title={
              lang === "sv"
                ? "Lös regioner för alla platser utan specifik region (t.ex. Djurgården, Södermalm, Norrmalm, Vasastan, Söderort, Västerort)"
                : "Resolve regions for all places without a specific region"
            }
          >
            {resolvingRegions ? <CircleNotch size={14} className="animate-spin" /> : <MapPin size={14} weight="bold" />}
            {lang === "sv" ? "Lös saknade regioner" : "Resolve missing regions"}
          </button>
          <button
            type="button"
            className="admin-refresh-btn"
            onClick={() => void loadCandidates()}
            disabled={!hasAdminAuth || loading || schemaStatus?.ready !== true}
            title={lang === "sv" ? "Ladda om från D1" : "Reload from D1"}
          >
            {loading ? <CircleNotch size={14} className="animate-spin" /> : <ArrowClockwise size={14} weight="bold" />}
            {lang === "sv" ? "Ladda om" : "Reload"}
          </button>
        </div>
      </div>

      {hasAdminAuth ? (
        <div className={`admin-schema-panel ${schemaStatus?.ready ? "ready" : "needs-setup"}`}>
          <div className="admin-schema-copy">
            <span>{schemaStatus?.ready ? (lang === "sv" ? "Runtime redo" : "Runtime ready") : lang === "sv" ? "Runtime-check" : "Runtime check"}</span>
            <small>{schemaStatusText(schemaStatus, lang)}</small>
          </div>
          <button
            type="button"
            className="admin-schema-btn"
            onClick={() => void runAdminSelfCheck()}
            disabled={!hasAdminAuth || schemaBusy}
            title={lang === "sv" ? "Kontrollera token, DB och adminschema" : "Check token, DB, and admin schema"}
          >
            {schemaBusy ? <CircleNotch size={14} className="animate-spin" /> : <ShieldCheck size={14} weight="bold" />}
            {schemaBusy ? (lang === "sv" ? "Kollar" : "Checking") : schemaStatus?.ready ? (lang === "sv" ? "Kolla igen" : "Recheck") : lang === "sv" ? "Kör check" : "Run check"}
          </button>
        </div>
      ) : null}

      {hasAdminAuth && schemaStatus?.ready ? (
        <div className={`admin-session-dashboard step-${dashboard?.nextStep ?? "loading"}`} aria-live="polite">
          <div className="admin-session-summary">
            <span className="admin-session-badge">
              {dashboardStepLabel(dashboard?.nextStep, loadingDashboard, lang)}
            </span>
            <strong>{dashboardHeadline(dashboard, loadingDashboard, lang)}</strong>
            <small>{dashboardSubcopy(dashboard, loadingDashboard, lang)}</small>
          </div>
          <div className="admin-session-metrics">
            {dashboardMetrics(dashboard, lang).map((metric) => (
              <div key={metric.key} className={`admin-session-metric tone-${metric.tone}`}>
                <span className="admin-session-metric-icon">{metric.icon}</span>
                <span>{metric.label}</span>
                <b>{metric.value}</b>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="admin-export-panel">
        <div className="admin-export-copy">
          <span>{lang === "sv" ? "Efter granskning: exportera labels." : "After review: export labels."}</span>
          <small>{lang === "sv" ? "ML-labels och dubblettbeslut sparas separat." : "ML labels and duplicate decisions stay separate."}</small>
        </div>
        <button
          type="button"
          className="admin-export-btn"
          onClick={() => void exportReviewLabels()}
          disabled={!hasAdminAuth || exportingLabels || schemaStatus?.ready !== true}
          title={lang === "sv" ? "Ladda ner label-export från D1" : "Download label export from D1"}
        >
          {exportingLabels ? <CircleNotch size={14} className="animate-spin" /> : <DownloadSimple size={14} weight="bold" />}
          {lang === "sv" ? "Exportera" : "Export"}
        </button>
      </div>

      {labelExportStatus ? (
        <div className="admin-export-meta" aria-live="polite">
          {labelExportStatus}
        </div>
      ) : null}

      <div className="admin-review-status" aria-live="polite">
        {error ? <span className="admin-review-error">{error}</span> : status}
      </div>

      {!hasAdminAuth ? (
        <div className="admin-review-empty">
          {checkingSession ? <CircleNotch size={18} className="animate-spin" /> : <ShieldCheck size={18} weight="bold" />}
          <span>
            {checkingSession
              ? lang === "sv"
                ? "Kontrollerar adminsession..."
                : "Checking admin session..."
              : adminSession?.reason ??
                (lang === "sv"
                  ? "Admin-konto krävs. I produktion ska /admin skyddas med Cloudflare Access."
                  : "Admin account required. In production, /admin should be protected by Cloudflare Access.")}
          </span>
        </div>
      ) : schemaBusy || !schemaStatus ? (
        <div className="admin-review-empty">
          <CircleNotch size={18} className="animate-spin" />
          <span>{lang === "sv" ? "Kör runtime-check mot Cloudflare..." : "Running runtime check against Cloudflare..."}</span>
        </div>
      ) : schemaStatus.ready === false ? (
        <div className="admin-review-empty">
          <ShieldCheck size={18} weight="bold" />
          <span>{schemaStatusText(schemaStatus, lang)}</span>
        </div>
      ) : stateFilter === "ml_dashboard" ? (
        <AdminMlDashboard lang={lang} adminHeaders={adminHeaders} hasAdminAuth={hasAdminAuth} />
      ) : loading ? (
        <div className="admin-review-empty">
          <CircleNotch size={18} className="animate-spin" />
          <span>{lang === "sv" ? "Laddar kandidater..." : "Loading candidates..."}</span>
        </div>
      ) : candidates.length ? (
        <div className="admin-candidate-list">
          {candidates.map((candidate) => (
            <article key={candidate.id} className="admin-candidate-row" aria-busy={busyId === candidate.id}>
              <div className="admin-candidate-main">
                <div className="admin-candidate-meta">
                  <span className={`admin-state-badge state-${candidate.lifecycleState}`}>
                    {lifecycleStateLabel(candidate.lifecycleState, lang)}
                  </span>
                  <span>{candidate.kind} · {candidate.area}</span>
                  {isBroadStockholmArea(candidate.area) ? (
                    <span className="admin-region-warn-badge" title={lang === "sv" ? "Saknar specifik region/stadsdel" : "Needs specific region/district"}>
                      <MapPin size={12} weight="bold" /> {lang === "sv" ? "Saknar region" : "Needs region"}
                    </span>
                  ) : null}
                  {candidate.validationLabel ? <span>{validationLabelText(candidate.validationLabel, lang)}</span> : null}
                </div>
                <h4>{candidate.name}</h4>
                <p>{candidate.note}</p>
                <div className="admin-source-strip">
                  <span>
                    <ShieldCheck size={13} weight="bold" />
                    {candidate.candidateSourceType ?? "source_unknown"}
                  </span>
                  {candidate.candidateSourceId ? <span>{candidate.candidateSourceId}</span> : null}
                  {candidate.candidateReviewStatus ? <span>{candidate.candidateReviewStatus}</span> : null}
                  {candidate.address ? <span>{candidate.address}</span> : null}
                  {candidate.website ? (
                    <a href={candidate.website.startsWith("http") ? candidate.website : `https://${candidate.website}`} target="_blank" rel="noopener noreferrer">
                      <Globe size={13} weight="bold" />
                      {lang === "sv" ? "Webb" : "Web"}
                      <ArrowSquareOut size={11} weight="bold" />
                    </a>
                  ) : null}
                </div>
                <div className="admin-evidence-strip">
                  <span>
                    <ShieldCheck size={13} weight="bold" />
                    {candidate.evidenceCount} {lang === "sv" ? "signaler" : "signals"}
                  </span>
                  <span className={candidate.evidenceGate.canPromoteHiddenGem ? "admin-gate-pass" : "admin-gate-warn"}>
                    {candidate.evidenceGate.independentEvidenceCount}/2 {lang === "sv" ? "oberoende" : "independent"}
                  </span>
                  {candidate.evidenceSourceTypes.slice(0, 4).map((sourceType) => (
                    <span key={sourceType}>{sourceType}</span>
                  ))}
                  <span>
                    {lang === "sv" ? "Senast" : "Latest"} {formatUpdatedDate(candidate.latestEvidenceAt ?? undefined)}
                  </span>
                </div>
                {candidate.evidenceGate.sourceGaps.length ? (
                  <div className="admin-gap-row">
                    {candidate.evidenceGate.sourceGaps.map((gap) => (
                      <span key={gap}>{sourceGapLabel(gap, lang)}</span>
                    ))}
                  </div>
                ) : null}
                {candidate.possibleDuplicates.length ? (
                  <div className="admin-duplicate-box">
                    <div className="admin-duplicate-title">
                      <Scales size={13} weight="bold" />
                      {lang === "sv" ? "Möjlig dubblett" : "Possible duplicate"}
                    </div>
                    {candidate.possibleDuplicates.slice(0, 4).map((match) => (
                      <div key={match.id} className="admin-duplicate-row">
                        <div>
                          <b>#{match.id} {match.name}</b>
                          <span>
                            {match.kind} · {match.area} · {lifecycleStateLabel(match.lifecycleState as AdminStateFilter, lang)} · {duplicateReasonLabel(match.reason, lang)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="admin-mini-action"
                          disabled={busyId === candidate.id}
                          onClick={() => void resolveDuplicate(candidate, "merge_duplicate", match.id)}
                          title={lang === "sv" ? "Slå ihop kandidatens källor med vald plats" : "Merge candidate sources into selected place"}
                        >
                          <ArrowRight size={13} weight="bold" />
                          {lang === "sv" ? "Slå ihop" : "Merge"}
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="admin-mini-action secondary"
                      disabled={busyId === candidate.id}
                      onClick={() => void resolveDuplicate(candidate, "keep_separate")}
                    >
                      <CheckCircle size={13} weight="bold" />
                      {lang === "sv" ? "Behåll separat" : "Keep separate"}
                    </button>
                  </div>
                ) : candidate.duplicateResolution ? (
                  <div className="admin-duplicate-resolved">
                    {duplicateResolutionLabel(candidate.duplicateResolution, lang)}
                    {candidate.mergedIntoEstablishmentId ? ` #${candidate.mergedIntoEstablishmentId}` : ""}
                  </div>
                ) : null}
                {candidate.candidateAllowedUse ? (
                  <p className="admin-allowed-use">{candidate.candidateAllowedUse}</p>
                ) : null}

                <div className={`admin-region-picker-row ${isBroadStockholmArea(candidate.area) ? "unresolved" : ""}`}>
                  <label htmlFor={`admin-region-select-${candidate.id}`} className="admin-region-picker-label">
                    <MapPin size={13} weight="bold" />
                    {lang === "sv" ? "Manuell region / stadsdel:" : "Manual region / district:"}
                  </label>
                  <select
                    id={`admin-region-select-${candidate.id}`}
                    className="admin-region-select"
                    value={(STOCKHOLM_REGION_NAMES as readonly string[]).includes(candidate.area) ? candidate.area : ""}
                    disabled={busyId === candidate.id}
                    onChange={(event) => {
                      const nextRegion = event.target.value;
                      if (nextRegion) {
                        void updateCandidateRegion(candidate, nextRegion);
                      }
                    }}
                  >
                    <option value="" disabled>
                      {isBroadStockholmArea(candidate.area)
                        ? (lang === "sv" ? "⚠️ Välj region ur listan..." : "⚠️ Select region from list...")
                        : (lang === "sv" ? "— Välj ny region —" : "— Select new region —")}
                    </option>
                    {STOCKHOLM_REGION_NAMES.map((regionName) => (
                      <option key={regionName} value={regionName}>
                        {regionName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={`admin-website-picker-row ${!candidate.website ? "unresolved" : ""}`}>
                  <label htmlFor={`admin-website-input-${candidate.id}`} className="admin-website-picker-label">
                    <Globe size={13} weight="bold" />
                    {lang === "sv" ? "Webbplats & Bild-scraper:" : "Website & Image Scraper:"}
                  </label>
                  <div className="admin-website-input-wrap">
                    <input
                      id={`admin-website-input-${candidate.id}`}
                      type="url"
                      className="admin-website-input"
                      value={websiteInputs[candidate.id] ?? candidate.website ?? ""}
                      onChange={(event) =>
                        setWebsiteInputs((current) => ({
                          ...current,
                          [candidate.id]: event.target.value,
                        }))
                      }
                      placeholder="https://..."
                    />
                    <button
                      type="button"
                      className="admin-scrape-btn"
                      disabled={busyId === candidate.id || !(websiteInputs[candidate.id] ?? candidate.website ?? "").trim()}
                      onClick={() =>
                        void updateCandidateWebsite(
                          candidate,
                          websiteInputs[candidate.id] ?? candidate.website ?? "",
                        )
                      }
                      title={lang === "sv" ? "Spara webbadress och sök automatiskt efter bild (og:image)" : "Save website URL and automatically extract og:image photo"}
                    >
                      <DownloadSimple size={13} weight="bold" />
                      {lang === "sv" ? "Spara & hämta bild" : "Save & scrape photo"}
                    </button>
                  </div>
                </div>

                <label className="admin-notes-label" htmlFor={`admin-notes-${candidate.id}`}>
                  {lang === "sv" ? "Granskningsnotering" : "Review note"}
                </label>
                <textarea
                  id={`admin-notes-${candidate.id}`}
                  rows={2}
                  value={reviewNotes[candidate.id] ?? ""}
                  onChange={(event) =>
                    setReviewNotes((current) => ({
                      ...current,
                      [candidate.id]: event.target.value,
                    }))
                  }
                  placeholder={
                    lang === "sv"
                      ? "T.ex. OSM + kommunal träff + manuell webbkontroll."
                      : "E.g. OSM + municipal match + manual website check."
                  }
                />
              </div>

              <div className="admin-candidate-actions">
                <button
                  type="button"
                  className="admin-action-btn primary"
                  disabled={busyId === candidate.id || !candidate.evidenceGate.canPromoteHiddenGem}
                  title={
                    candidate.evidenceGate.canPromoteHiddenGem
                      ? validationLabelText("known_hidden_gem", lang)
                      : lang === "sv"
                        ? "Kräver minst två oberoende icke-Google-signaler"
                        : "Requires at least two independent non-Google signals"
                  }
                  onClick={() => void promoteCandidate(candidate, "verified", "known_hidden_gem")}
                >
                  <Sparkle size={14} weight="bold" />
                  {lang === "sv" ? "Dold pärla" : "Hidden gem"}
                </button>
                <button
                  type="button"
                  className="admin-action-btn"
                  disabled={busyId === candidate.id}
                  onClick={() => void promoteCandidate(candidate, "verified", "known_mainstream")}
                >
                  <CheckCircle size={14} weight="bold" />
                  {lang === "sv" ? "Mainstream" : "Mainstream"}
                </button>
                <button
                  type="button"
                  className="admin-action-btn"
                  disabled={busyId === candidate.id || !candidate.evidenceGate.canPromoteHiddenGem}
                  title={
                    candidate.evidenceGate.canPromoteHiddenGem
                      ? validationLabelText("known_hidden_gem", lang)
                      : lang === "sv"
                        ? "Kräver minst två oberoende icke-Google-signaler"
                        : "Requires at least two independent non-Google signals"
                  }
                  onClick={() => void promoteCandidate(candidate, "featured", "known_hidden_gem")}
                >
                  <ShieldCheck size={14} weight="bold" />
                  {lang === "sv" ? "Featured" : "Featured"}
                </button>
                <button
                  type="button"
                  className="admin-action-btn muted"
                  disabled={busyId === candidate.id}
                  onClick={() => void promoteCandidate(candidate, "candidate", "not_enough_evidence")}
                >
                  <Sliders size={14} weight="bold" />
                  {lang === "sv" ? "Mer bevis" : "More evidence"}
                </button>
                <button
                  type="button"
                  className="admin-action-btn danger"
                  disabled={busyId === candidate.id}
                  onClick={() => void promoteCandidate(candidate, "candidate", "closed_wrong_category")}
                >
                  <X size={14} weight="bold" />
                  {lang === "sv" ? "Stäng" : "Close"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="admin-review-empty">
          <CheckCircle size={18} weight="bold" />
          <span>{lang === "sv" ? "Inga poster i valt läge." : "No records in selected state."}</span>
        </div>
      )}
    </section>
  );
}

function dashboardStepLabel(
  step: AdminReviewDashboard["nextStep"] | undefined,
  loading: boolean,
  lang: Language,
) {
  if (loading && !step) {
    return lang === "sv" ? "Laddar" : "Loading";
  }
  const labels: Record<NonNullable<AdminReviewDashboard["nextStep"]>, { sv: string; en: string }> = {
    export: { sv: "Export nu", en: "Export now" },
    review: { sv: "Review nu", en: "Review now" },
    harvest: { sv: "Harvest nu", en: "Harvest now" },
    caught_up: { sv: "Ikapp", en: "Caught up" },
  };
  return labels[step ?? "caught_up"][lang];
}

function dashboardHeadline(
  dashboard: AdminReviewDashboard | null,
  loading: boolean,
  lang: Language,
) {
  if (loading && !dashboard) {
    return lang === "sv" ? "Läser sessionsstatus" : "Reading session status";
  }
  if (!dashboard) {
    return lang === "sv" ? "Sessionsstatus saknas" : "Session status unavailable";
  }
  if (dashboard.exportLogAvailable === false) {
    return lang === "sv" ? "Exportloggen saknar migration" : "Export log migration missing";
  }
  const labels: Record<NonNullable<AdminReviewDashboard["nextStep"]>, { sv: string; en: string }> = {
    export: { sv: "Exportera labels efter granskning", en: "Export labels after review" },
    review: { sv: "Starta en review-session", en: "Start a review session" },
    harvest: { sv: "Hämta mer oberoende evidens", en: "Harvest more independent evidence" },
    caught_up: { sv: "Inget akut i kön", en: "Nothing urgent in the queue" },
  };
  return labels[dashboard.nextStep ?? "caught_up"][lang];
}

function dashboardSubcopy(
  dashboard: AdminReviewDashboard | null,
  loading: boolean,
  lang: Language,
) {
  if (loading && !dashboard) {
    return lang === "sv" ? "Kontrollerar D1-kö, granskningshändelser och senaste export." : "Checking D1 queue, review events, and latest export.";
  }
  if (!dashboard) {
    return lang === "sv" ? "Lås upp med adminsession för att läsa live-status." : "Unlock with an admin session to read live status.";
  }
  if (dashboard.exportLogAvailable === false) {
    return lang === "sv" ? "Kör senaste D1-migrationerna så export-checkpoints kan sparas." : "Apply the latest D1 migrations so export checkpoints can be saved.";
  }

  const counts = dashboard.counts;
  if (dashboard.nextStep === "export") {
    return lang === "sv"
      ? `${counts?.unexportedReviewCount ?? 0} granskningsbeslut är nyare än senaste export.`
      : `${counts?.unexportedReviewCount ?? 0} review decisions are newer than the latest export.`;
  }
  if (dashboard.nextStep === "review") {
    return lang === "sv"
      ? `${counts?.candidateCount ?? 0} kandidater i kön, ${counts?.hiddenGemReadyCount ?? 0} redo för hidden-gem beslut.`
      : `${counts?.candidateCount ?? 0} candidates in queue, ${counts?.hiddenGemReadyCount ?? 0} ready for hidden-gem decisions.`;
  }
  if (dashboard.nextStep === "harvest") {
    return lang === "sv"
      ? `${counts?.needsEvidenceCount ?? 0} kandidater behöver fler eller färskare källsignaler.`
      : `${counts?.needsEvidenceCount ?? 0} candidates need more or fresher source signals.`;
  }
  return lang === "sv" ? "Inga oexporterade beslut och inga tydliga review-blockerare." : "No unexported decisions and no clear review blockers.";
}

function dashboardMetrics(dashboard: AdminReviewDashboard | null, lang: Language) {
  const counts = dashboard?.counts;
  return [
    {
      key: "new",
      label: lang === "sv" ? "Nya kandidater" : "New candidates",
      value: dashboardMetricValue(counts?.newCandidateCount),
      icon: <PlusCircle size={15} weight="bold" />,
      tone: counts?.newCandidateCount ? "review" : "neutral",
    },
    {
      key: "ready",
      label: lang === "sv" ? "Redo pärlor" : "Ready gems",
      value: dashboardMetricValue(counts?.hiddenGemReadyCount),
      icon: <Sparkle size={15} weight="bold" />,
      tone: counts?.hiddenGemReadyCount ? "review" : "neutral",
    },
    {
      key: "gaps",
      label: lang === "sv" ? "Källgap" : "Source gaps",
      value: dashboardMetricValue(counts?.needsEvidenceCount),
      icon: <Sliders size={15} weight="bold" />,
      tone: counts?.needsEvidenceCount ? "harvest" : "neutral",
    },
    {
      key: "duplicates",
      label: lang === "sv" ? "Dubbletter" : "Duplicates",
      value: dashboardMetricValue(counts?.possibleDuplicateCount),
      icon: <Scales size={15} weight="bold" />,
      tone: counts?.possibleDuplicateCount ? "review" : "neutral",
    },
    {
      key: "unexported",
      label: lang === "sv" ? "Oexporterat" : "Unexported",
      value: dashboardMetricValue(counts?.unexportedReviewCount),
      icon: <DownloadSimple size={15} weight="bold" />,
      tone: counts?.unexportedReviewCount ? "export" : "neutral",
    },
    {
      key: "last-export",
      label: lang === "sv" ? "Senaste export" : "Last export",
      value: dashboard?.lastExportedAt ? formatUpdatedDate(dashboard.lastExportedAt) : lang === "sv" ? "Aldrig" : "Never",
      icon: <CheckCircle size={15} weight="bold" />,
      tone: dashboard?.lastExportedAt ? "ok" : "neutral",
    },
  ];
}

function dashboardMetricValue(value: number | undefined) {
  return typeof value === "number" ? String(value) : "...";
}

function schemaStatusText(status: AdminSchemaStatus | null, lang: Language) {
  if (!status) {
    return lang === "sv" ? "Adminsession, DB-bindning och adminschema kontrolleras automatiskt." : "Admin session, DB binding, and admin schema are checked automatically.";
  }

  if (status.ready) {
    return lang === "sv" ? "Adminsession fungerar, DB är bunden och adminschema är redo." : "Admin session works, DB is bound, and admin schema is ready.";
  }

  if (status.baseSchemaReady === false) {
    return lang === "sv" ? "DB svarar, men grundtabellen saknas. Kör initial seed/import först." : "DB responds, but the base table is missing. Run the initial seed/import first.";
  }

  const missingCount = status.missing?.length ?? 0;
  return lang === "sv"
    ? `${missingCount} schemadelar saknades och förbereds automatiskt. Kör check igen om detta kvarstår.`
    : `${missingCount} schema parts were missing and are prepared automatically. Run check again if this remains.`;
}

function readStoredAdminToken() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.sessionStorage.getItem("motkarta_admin_token") ?? "";
  } catch {
    return "";
  }
}

function isAdminRoutePath() {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path === "/admin" || path.startsWith("/admin/") || path === "/api/admin/app";
}

function lifecycleStateLabel(state: AdminStateFilter | string, lang: Language) {
  const labels: Record<AdminStateFilter, { sv: string; en: string }> = {
    baseline: { sv: "Baseline", en: "Baseline" },
    candidate: { sv: "Kandidat", en: "Candidate" },
    verified: { sv: "Verifierad", en: "Verified" },
    featured: { sv: "Utvald", en: "Featured" },
    unresolved_region: { sv: "Saknar region", en: "Needs Region" },
    needs_input: { sv: "Saknar uppgifter", en: "Needs Info" },
    ml_dashboard: { sv: "🤖 ML & Modeller", en: "🤖 ML & Models" },
    all: { sv: "Alla", en: "All" },
  };
  return labels[state as AdminStateFilter]?.[lang] ?? state;
}

function validationLabelText(label: AdminValidationLabel, lang: Language) {
  const labels: Record<AdminValidationLabel, { sv: string; en: string }> = {
    known_mainstream: { sv: "Känd mainstream", en: "Known mainstream" },
    known_hidden_gem: { sv: "Känd dold pärla", en: "Known hidden gem" },
    not_enough_evidence: { sv: "Otillräckliga bevis", en: "Not enough evidence" },
    closed_wrong_category: { sv: "Stängd/fel kategori", en: "Closed/wrong category" },
  };
  return labels[label][lang];
}

function sourceGapLabel(gap: string, lang: Language) {
  const labels: Record<string, { sv: string; en: string }> = {
    needs_second_independent_evidence: { sv: "Behöver andra oberoende signalen", en: "Needs second independent signal" },
    needs_osm_or_open_data_match: { sv: "Behöver OSM/open-data match", en: "Needs OSM/open-data match" },
    needs_current_existence_signal: { sv: "Behöver aktuell existenssignal", en: "Needs current existence signal" },
    google_metadata_only: { sv: "Endast Google-metadata", en: "Google metadata only" },
  };
  return labels[gap]?.[lang] ?? gap.replaceAll("_", " ");
}

function duplicateReasonLabel(reason: string, lang: Language) {
  const labels: Record<string, { sv: string; en: string }> = {
    name_area: { sv: "namn + område", en: "name + area" },
    address: { sv: "adress", en: "address" },
    nearby_name: { sv: "nära + liknande namn", en: "nearby + similar name" },
    possible_match: { sv: "möjlig träff", en: "possible match" },
  };
  return labels[reason]?.[lang] ?? reason.replaceAll("_", " ");
}

function duplicateResolutionLabel(resolution: "merged" | "keep_separate", lang: Language) {
  const labels = {
    merged: { sv: "Dubblett ihopslagen med", en: "Duplicate merged into" },
    keep_separate: { sv: "Granskad som separat plats", en: "Reviewed as separate place" },
  };
  return labels[resolution][lang];
}

type RecommendationEventDraft = {
  establishmentId: number;
  eventType: RecommendationEventType;
  resultPosition?: number | null;
  recommendationMode?: RecommendationMode;
  resultSetId?: string;
  queryContext?: QueryContext;
};

type StoredRecommendationIdentity = {
  anonymousUserId: string;
  expiresAt: string;
};

function getRecommendationAnonymousUserId() {
  if (typeof window === "undefined") return null;

  const now = Date.now();
  try {
    const stored = localStorage.getItem("motkarta_recommendation_identity");
    if (stored) {
      const parsed = JSON.parse(stored) as StoredRecommendationIdentity;
      if (parsed.anonymousUserId && new Date(parsed.expiresAt).getTime() > now) {
        return parsed.anonymousUserId;
      }
    }
  } catch {}

  const anonymousUserId = `anon_${safeRandomId()}`;
  const expiresAt = new Date(now + ANONYMOUS_ID_ROTATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  try {
    localStorage.setItem("motkarta_recommendation_identity", JSON.stringify({ anonymousUserId, expiresAt }));
  } catch {}
  return anonymousUserId;
}

function getRecommendationSessionId() {
  if (typeof window === "undefined") return `session_${safeRandomId()}`;

  try {
    const stored = sessionStorage.getItem("motkarta_recommendation_session");
    if (stored) return stored;
  } catch {}

  const sessionId = `session_${safeRandomId()}`;
  try {
    sessionStorage.setItem("motkarta_recommendation_session", sessionId);
  } catch {}
  return sessionId;
}

function safeRandomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function recommendationKindContext(kind: EstablishmentFilter): QueryContextKind {
  const values: Record<EstablishmentFilter, QueryContextKind> = {
    "All places": "all_places",
    Curated: "curated",
    Saved: "saved",
    Latest: "latest",
    Restaurant: "restaurant",
    Bakery: "bakery",
    Café: "cafe",
    "Specialty coffee": "specialty_coffee",
  };
  return values[kind];
}

function recommendationRankingModeContext(mode: Mode): QueryContextRankingMode {
  const values: Record<Mode, QueryContextRankingMode> = {
    "For you": "for_you",
    "Hidden gems": "hidden_gems",
    "Popular now": "popular_now",
    "Local favourites": "local_favourites",
    "Quality first": "quality_first",
    "Recently opened": "recently_opened",
    "Expert selected": "expert_selected",
    "Most verified": "most_verified",
  };
  return values[mode];
}

function recommendationSortModeContext(sortMode: SortMode): QueryContextSortMode {
  const values: Record<SortMode, QueryContextSortMode> = {
    "Best match": "best_match",
    Distance: "distance",
    Alphabetical: "alphabetical",
    "Surprise me": "surprise_me",
  };
  return values[sortMode];
}

export default function App() {
  const [places, setPlaces] = useState<PlaceInput[]>(CLIENT_DEMO_MODE ? demoPlaces : []);
  const [dataSource, setDataSource] = useState<DataSource>("loading");
  const [mode, setMode] = useState<Mode>("For you");
  const [sortMode, setSortMode] = useState<SortMode>("Best match");
  const [randomSeed, setRandomSeed] = useState(1);
  const [kind, setKind] = useState<EstablishmentFilter>("All places");
  const [cuisine, setCuisine] = useState<CuisineFilter>(allCuisines);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [isMapCardMinimized, setIsMapCardMinimized] = useState(false);

  useEffect(() => {
    setIsMapCardMinimized(false);
  }, [selected]);
  const [superpowerMode, setSuperpowerMode] = useState<SuperpowerMode | null>(null);
  const [lang, setLang] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("motkarta_lang");
      if (saved === "sv" || saved === "en") return saved;
    }
    return "sv";
  });

  const t = translations[lang];
  const isAdminRoute = isAdminRoutePath();

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

  const [cart, setCart] = useState<Record<string, number>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("motkarta_cart");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return {};
  });
  const [isCartOpen, setIsCartOpen] = useState(false);

  const handleAddToCart = (itemId: string) => {
    setCart((prev) => {
      const current = prev[itemId] || 0;
      const next = { ...prev, [itemId]: current + 1 };
      if (typeof window !== "undefined") {
        localStorage.setItem("motkarta_cart", JSON.stringify(next));
      }
      return next;
    });
  };

  const handleUpdateCartQty = (itemId: string, delta: number) => {
    setCart((prev) => {
      const current = prev[itemId] || 0;
      const updated = current + delta;
      let next: Record<string, number>;
      if (updated <= 0) {
        next = { ...prev };
        delete next[itemId];
      } else {
        next = { ...prev, [itemId]: updated };
      }
      if (typeof window !== "undefined") {
        localStorage.setItem("motkarta_cart", JSON.stringify(next));
      }
      return next;
    });
  };

  const handleRemoveCartItem = (itemId: string) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[itemId];
      if (typeof window !== "undefined") {
        localStorage.setItem("motkarta_cart", JSON.stringify(next));
      }
      return next;
    });
  };

  const totalCartCount = Object.values(cart).reduce((sum, count) => sum + count, 0);

  const [showPreloader, setShowPreloader] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("motkarta_preloader_seen") !== "true";
    }
    return false;
  });

  const handleClosePreloader = () => {
    setShowPreloader(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("motkarta_preloader_seen", "true");
    }
  };

  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("motkarta_onboarded") !== "true";
    }
    return false;
  });

  const handleCloseOnboarding = () => {
    setShowOnboarding(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("motkarta_onboarded", "true");
    }
  };

  const handleRatePlace = (id: number, rating: number) => {
    const updated = { ...userRatings, [id]: rating };
    setUserRatings(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("motkarta_ratings", JSON.stringify(updated));
    }
  };

  const handleToggleSavePlace = (id: number) => {
    const wasSaved = savedPlaceIds.includes(id);
    const updated = savedPlaceIds.includes(id)
      ? savedPlaceIds.filter((pId) => pId !== id)
      : [...savedPlaceIds, id];
    setSavedPlaceIds(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("motkarta_saved_places", JSON.stringify(updated));
    }
    if (!wasSaved) {
      recordRecommendationEvents([{ establishmentId: id, eventType: "save", queryContext: { surface: "place_detail" } }]);
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
    setAnswer(
      lang === "sv"
        ? `Källan '${newSource.name}' har lagts till i registret och sparats i databasen.`
        : `The source '${newSource.name}' has been added to the registry and saved to the database.`,
    );
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
          setPlaces(sanitizeAndAugmentPlaces(payload.places, CLIENT_DEMO_MODE));
          setDataSource(payload.source);
        } else if (!cancelled && CLIENT_DEMO_MODE) {
          setPlaces(sanitizeAndAugmentPlaces(demoPlaces, true));
          setDataSource("demo");
        } else if (!cancelled) {
          setPlaces([]);
          setDataSource("unavailable");
        }
      } catch {
        if (!cancelled) {
          if (CLIENT_DEMO_MODE) {
            setPlaces(sanitizeAndAugmentPlaces(demoPlaces, true));
            setDataSource("demo");
          } else {
            setPlaces([]);
            setDataSource("unavailable");
          }
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
  const [locationStatus, setLocationStatus] = useState<"idle" | "requesting" | "acquired" | "denied">("idle");
  const [locationToast, setLocationToast] = useState<string | null>(null);

  const requestUserLocation = useCallback(
    (autoSortByDistance = false) => {
      if (typeof window === "undefined" || !navigator.geolocation) {
        setLocationStatus("denied");
        return;
      }
      setLocationStatus("requesting");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          setUserLocation(coords);
          setLocationStatus("acquired");
          if (autoSortByDistance) {
            setSortMode("Distance");
          }
        },
        (err) => {
          console.warn("Geolocation positioning error:", err);
          setLocationStatus("denied");
          if (autoSortByDistance) {
            setLocationToast(
              lang === "sv"
                ? "Kunde inte hämta din position. Tillåt platstjänster i webbläsaren."
                : "Could not retrieve your location. Please allow location access.",
            );
            setTimeout(() => setLocationToast(null), 4000);
          }
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    },
    [lang],
  );

  useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      requestUserLocation(false);
    }
  }, [requestUserLocation]);

  const ranked = useMemo(
    () =>
      scoredPlaces
        .filter((place) =>
          kind === "All places"
            ? true
            : kind === "Curated"
              ? place.evidence.specialistGuide === 1 ||
                place.evidence.independentEditorial === 1 ||
                (place.evidenceLabel ?? "").toLowerCase().includes("guide") ||
                (place.evidenceLabel ?? "").toLowerCase().includes("specialist") ||
                (place.evidenceLabel ?? "").toLowerCase().includes("visit stockholm") ||
                (place.evidenceLabel ?? "").toLowerCase().includes("visitstockholm") ||
                (place.evidenceLabel ?? "").toLowerCase().includes("officiella stadsguiden") ||
                (place.sourceName ?? "").toLowerCase().includes("husa") ||
                (place.sourceName ?? "").toLowerCase().includes("visit stockholm") ||
                (place.sourceName ?? "").toLowerCase().includes("visitstockholm") ||
                (place.sourceName ?? "").toLowerCase().includes("officiella stadsguiden")
              : kind === "Saved"
                ? savedPlaceIds.includes(place.id)
                : kind === "Latest"
                  ? true
                  : place.kind === kind,
        )
        .filter((place) => cuisine === allCuisines || cuisineParts(place).includes(cuisine))
        .filter((place) =>
          `${place.name} ${place.area} ${place.cuisine ?? ""} ${place.tags.join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .sort((a, b) => {
          if (kind === "Latest" && sortMode === "Best match") {
            const dateA = new Date(a.lastUpdated ?? 0).getTime();
            const dateB = new Date(b.lastUpdated ?? 0).getTime();
            if (dateA !== dateB) return dateB - dateA;
            return b.id - a.id;
          }
          return comparePlaces(a, b, mode, sortMode, randomSeed, userLocation ?? stockholmCenter);
        }),
    [cuisine, kind, mode, query, randomSeed, savedPlaceIds, scoredPlaces, sortMode, userLocation],
  );
  const visibleRanked = useMemo(() => ranked.slice(0, renderLimit), [ranked]);
  const hasSearchQuery = Boolean(query.trim());

  const recommendationQueryContext = useMemo<QueryContext>(
    () => ({
      hasQuery: Boolean(query.trim()),
      queryLengthBucket: queryLengthBucket(query),
      kind: recommendationKindContext(kind),
      cuisine: recommendationCuisineContext(cuisine),
      mode: recommendationRankingModeContext(mode),
      sortMode: recommendationSortModeContext(sortMode),
      resultCount: visibleRanked.length,
      surface: "results",
    }),
    [cuisine, kind, mode, query, sortMode, visibleRanked.length],
  );
  const resultSetSignature = useMemo(
    () => recommendationResultSetSignature(recommendationQueryContext, visibleRanked.map((place) => place.id)),
    [recommendationQueryContext, visibleRanked],
  );
  const resultSetStateRef = useRef({ signature: "", sequence: 0, id: "" });
  if (resultSetStateRef.current.signature !== resultSetSignature) {
    const sequence = resultSetStateRef.current.sequence + 1;
    resultSetStateRef.current = {
      signature: resultSetSignature,
      sequence,
      id: `rs_${Date.now().toString(36)}_${sequence}_${safeRandomId().slice(0, 12)}`,
    };
  }
  const recommendationResultSetId = resultSetStateRef.current.id;
  const attemptedRecommendationEventKeysRef = useRef<Set<string>>(new Set());
  const recommendationEventFlushRef = useRef<Promise<void>>(Promise.resolve());

  const recordRecommendationEvents = useCallback(
    (drafts: RecommendationEventDraft[]) => {
      if (typeof window === "undefined" || !drafts.length) return;
      if (dataSource !== "d1") return;

      const anonymousUserId = getRecommendationAnonymousUserId();
      const sessionId = getRecommendationSessionId();
      const occurredAt = new Date().toISOString();
      const events = drafts.map((draft) => {
        const queryContext = { ...recommendationQueryContext, ...(draft.queryContext ?? {}) };
        const resultSetId = draft.resultSetId ?? (draft.eventType === "impression" ? recommendationResultSetId : null);
        return {
          establishmentId: draft.establishmentId,
          anonymousUserId,
          sessionId,
          eventType: draft.eventType,
          resultPosition: draft.resultPosition ?? null,
          recommendationMode: draft.recommendationMode ?? recommendationModeForContext(queryContext),
          queryContext,
          modelVersion: RECOMMENDATION_SCORER_VERSION,
          occurredAt,
          idempotencyKey: buildRecommendationEventIdempotencyKey({
            sessionId,
            eventType: draft.eventType,
            establishmentId: draft.establishmentId,
            resultPosition: draft.resultPosition,
            modelVersion: RECOMMENDATION_SCORER_VERSION,
            queryContext,
            resultSetId,
          }),
        };
      });
      const attemptedKeys = attemptedRecommendationEventKeysRef.current;
      const unsentEvents = events.filter((event) => {
        if (attemptedKeys.has(event.idempotencyKey)) return false;
        attemptedKeys.add(event.idempotencyKey);
        return true;
      });

      if (!unsentEvents.length) return;

      if (attemptedKeys.size > 2_000) {
        for (const key of attemptedKeys) {
          attemptedKeys.delete(key);
          if (attemptedKeys.size <= 1_500) break;
        }
      }

      recommendationEventFlushRef.current = recommendationEventFlushRef.current
        .catch(() => {})
        .then(async () => {
          for (let index = 0; index < unsentEvents.length; index += MAX_RECOMMENDATION_EVENTS_PER_BATCH) {
            const chunk = unsentEvents.slice(index, index + MAX_RECOMMENDATION_EVENTS_PER_BATCH);
            await fetch("/api/recommendation-events", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ events: chunk }),
              keepalive: chunk.length <= 20,
            }).catch(() => undefined);
          }
        });
      void recommendationEventFlushRef.current;
    },
    [dataSource, recommendationQueryContext, recommendationResultSetId],
  );

  useEffect(() => {
    if (!visibleRanked.length) return;
    recordRecommendationEvents(
      visibleRanked
        .slice(0, recommendationImpressionLimit)
        .map((place, index) => ({
          establishmentId: place.id,
          eventType: "impression",
          resultPosition: index,
          resultSetId: recommendationResultSetId,
        })),
    );
  }, [recordRecommendationEvents, recommendationResultSetId, visibleRanked]);

  const active = selected !== null ? (scoredPlaces.find((place) => place.id === selected) ?? null) : null;

  const handleSelectPlace = useCallback(
    (id: number) => {
      setSelected(id);
      recordRecommendationEvents([{ establishmentId: id, eventType: "profile_view", queryContext: { surface: "map" } }]);
      const isVisibleInRanked = ranked.some((p) => p.id === id);
      if (!isVisibleInRanked) {
        setKind("All places");
        setCuisine(allCuisines);
        setQuery("");
      }
    },
    [ranked, recordRecommendationEvents],
  );

  const mapPlaces = useMemo(
    () => (active && !visibleRanked.some((p) => p.id === active.id) ? [active, ...visibleRanked] : visibleRanked),
    [active, visibleRanked],
  );

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

    const matchedRegions = STOCKHOLM_REGION_OPTIONS.filter(
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

    if (DISTANCE_INTENT_REGEX.test(queryText)) {
      if (!userLocation) {
        requestUserLocation(true);
      } else {
        setSortMode("Distance");
      }
    }

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
    setAnswer(`Superpower aktiverad. Ditt nya oberoende ställe '${newPlace.name}' i ${newPlace.area} har lagts till lokalt som kandidat för verifiering.`);
  };

  const handleAddReviewSuperpower = (placeId: number, rev: { author: string; rating: number; content: string; source: "Community Submission" }) => {
    addUserReview(placeId, rev);
    const targetPlace = places.find((p) => p.id === placeId);
    setSelected(placeId);
    setAnswer(`Superpower aktiverad. Din recension för '${targetPlace?.name ?? "Stället"}' har sparats och inväntar verifiering.`);
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

  async function askFromSearch() {
    const searchText = query.trim() || concierge.trim();
    if (!searchText) return;

    setConcierge(searchText);
    await askWithQuery(searchText);

    if (typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches) {
      document.getElementById("concierge")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const handleRefineQuery = (extra: string) => {
    const updated = `${concierge} (${extra})`;
    setConcierge(updated);
    void askWithQuery(updated);
  };

  if (isAdminRoute) {
    return (
      <main className="admin-app-shell">
        <header className="admin-app-topbar">
          <a className="brand" href="/" aria-label="MOTKARTA">
            <img src="/motkarta_drop_divided_black_red.svg" alt="MOTKARTA Pin" className="brand-counter-pin" />
            <img src="/logo.webp" alt="MOTKARTA" className="brand-logo" />
            <span>{t.brandDescriptor}</span>
          </a>
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
        </header>
        <section className="admin-app-intro" aria-labelledby="admin-app-title">
          <p className="eyebrow">{lang === "sv" ? "Skyddad adminyta" : "Protected admin area"}</p>
          <h1 id="admin-app-title">{lang === "sv" ? "Operationskö" : "Operations queue"}</h1>
          <p>
            {lang === "sv"
              ? "Granska kandidater, exportera labels och kontrollera att D1-adminschemat är redo."
              : "Review candidates, export labels, and check that the D1 admin schema is ready."}
          </p>
        </section>
        <CuratedSourcesPanel
          sources={curatedSources}
          isLoading={isSourcesLoading}
          lang={lang}
          onAddSource={() => setSuperpowerMode("add_source")}
        />
        <AdminReviewPanel lang={lang} />
        {superpowerMode === "add_source" ? (
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
      </main>
    );
  }

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
          <a href="#merch" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <ShoppingBag size={14} weight="bold" /> Merch
          </a>
          <button
            type="button"
            className="onboarding-trigger-btn"
            onClick={() => setShowOnboarding(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", font: "inherit", color: "inherit", cursor: "pointer" }}
          >
            <Sparkle size={14} weight="bold" /> {lang === "sv" ? "Principer" : "Principles"}
          </button>
        </nav>
        <div className="topbar-actions">
          <button
            type="button"
            className={`topbar-cart-btn ${totalCartCount > 0 ? "has-items" : ""}`}
            onClick={() => setIsCartOpen(true)}
            aria-label={lang === "sv" ? "Öppna varukorg" : "Open shopping cart"}
            title={lang === "sv" ? `Varukorg (${totalCartCount})` : `Shopping Cart (${totalCartCount})`}
          >
            <ShoppingCart size={16} weight="bold" />
            <span className="topbar-cart-badge">{totalCartCount}</span>
          </button>
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
            <span className={`status-dot status-dot-${dataSource}`} />
            {dataSource === "osm"
              ? t.dataSourceLiveOsm
              : dataSource === "d1"
                ? t.dataSourceLiveD1
                : dataSource === "loading"
                  ? t.dataSourceLoading
                  : dataSource === "demo"
                    ? t.dataSourceDemo
                    : t.dataSourceUnavailable}
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
              aria-label={lang === "sv" ? "Sök ställen, kök, område eller fråga concierge" : "Search places, cuisine, area, or ask concierge"}
              value={query}
              onChange={(event) => {
                const val = event.target.value;
                setQuery(val);
                setConcierge(val);
                if (DISTANCE_INTENT_REGEX.test(val)) {
                  if (!userLocation) {
                    requestUserLocation(true);
                  } else {
                    setSortMode("Distance");
                  }
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void askFromSearch();
                }
              }}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
              placeholder={lang === "sv" ? "Sök stadsdel (Söder, Vasastan...), ställe eller kök..." : "Search region (Söder, Vasastan...), place or cuisine..."}
            />
            {query.trim() ? (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => {
                  setQuery("");
                  setConcierge("");
                }}
                aria-label="Clear search field"
                title={lang === "sv" ? "Rensa fält" : "Clear field"}
              >
                ✕
              </button>
            ) : null}
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
                    setConcierge(item.value);
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
          <div className="mobile-search-actions" aria-label={lang === "sv" ? "Mobila sökåtgärder" : "Mobile search actions"}>
            <button
              type="button"
              className="search-ai-btn"
              onClick={() => void askFromSearch()}
              disabled={asking || !(query.trim() || concierge.trim())}
            >
              {asking ? (
                <CircleNotch size={15} className="animate-spin" />
              ) : (
                <Sparkle size={15} weight="bold" />
              )}
              <span>{lang === "sv" ? "Fråga concierge" : "Ask concierge"}</span>
            </button>
            <button
              type="button"
              className="search-reset-btn"
              onClick={() => {
                setQuery("");
                setConcierge("");
                setKind("All places");
                setCuisine(allCuisines);
              }}
            >
              {lang === "sv" ? "Rensa" : "Reset"}
            </button>
          </div>
        </div>
        <div className="mobile-filter-selects" aria-label={lang === "sv" ? "Mobil platsfiltrering" : "Mobile place filters"}>
          <label>
            <span>{t.typeFilterLabel}</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as EstablishmentFilter)}>
              {establishmentTypes.map((item) => (
                <option key={item} value={item}>
                  {kindFilterLabel(item, lang)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t.cuisineFilterLabel}</span>
            <select value={cuisine} onChange={(event) => setCuisine(event.target.value)}>
              {[allCuisines, ...cuisineOptions].map((item) => (
                <option key={item} value={item}>
                  {item === allCuisines ? t.allCuisines : cuisineLabel(item, lang)}
                </option>
              ))}
            </select>
          </label>
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
                {item === allCuisines ? t.allCuisines : cuisineLabel(item, lang)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="workspace">
        <div className="map-panel">
          <FoodMap
            places={mapPlaces}
            activePlace={active}
            userLocation={userLocation}
            onSelect={handleSelectPlace}
            onUserLocated={(loc) => {
              setUserLocation(loc);
              setSortMode("Distance");
            }}
            lang={lang}
          />
          {locationToast ? (
            <div className="location-toast" role="status">
              <span>{locationToast}</span>
              <button type="button" onClick={() => setLocationToast(null)}>✕</button>
            </div>
          ) : null}
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

          {active ? (
          <article className={`map-card ${isMapCardMinimized ? "is-minimized" : ""}`}>
            <div className="map-card-header">
              <div className="map-card-title-meta">
                <span className="map-card-kind-badge">
                  {kindFilterLabel(active.kind, lang)} · {active.area}
                  {userLocation && hasCoordinates(active) ? ` · 📍 ${formatDistance(distanceFromPoint(active, userLocation), lang)}` : ""}
                </span>
                <h3 className="map-card-header-title">{active.name}</h3>
              </div>
              <div className="map-card-header-actions">
                <button
                  type="button"
                  className="map-card-toggle-btn"
                  onClick={() => setIsMapCardMinimized(!isMapCardMinimized)}
                  title={
                    isMapCardMinimized
                      ? lang === "sv"
                        ? "Visa alla detaljer"
                        : "Expand details"
                      : lang === "sv"
                        ? "Minimera kort"
                        : "Minimize card"
                  }
                >
                  {isMapCardMinimized ? (
                    <>
                      <CaretDown size={14} weight="bold" />
                      <span>{lang === "sv" ? "Visa" : "Expand"}</span>
                    </>
                  ) : (
                    <>
                      <CaretUp size={14} weight="bold" />
                      <span>{lang === "sv" ? "Dölj" : "Minimize"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {!isMapCardMinimized && (
              <div className="map-card-body">
                {cuisineParts(active).length ? (
                  <p className="cuisine-line">{cuisineParts(active).map((c) => cuisineLabel(c, lang)).join(" · ")}</p>
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
                      ? "Kurerade källor används som källhänvisad plats- och evidensdata, inte som importerade betyg. Guidedata kan komma från Anders Husa & Kaitlin Orr Guide, White Guide Nordic, Specialty Coffee Sweden Registry och Visit Stockholm. Tillsynsdata från Stockholms stad (CC0). Kartdata från OpenStreetMap (ODbL)."
                      : "Curated sources are used as attributed place and evidence data, not imported ratings. Guide data may come from Anders Husa & Kaitlin Orr Guide, White Guide Nordic, Specialty Coffee Sweden Registry, and Visit Stockholm. Inspection data from Stockholm City (CC0). Map data from OpenStreetMap (ODbL)."}
                  </div>
                </div>
                <ExternalMapLinks
                  place={active}
                  lang={lang}
                  onDirectionRequest={() =>
                    recordRecommendationEvents([
                      { establishmentId: active.id, eventType: "direction_request", queryContext: { surface: "place_detail" } },
                    ])
                  }
                />
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
              </div>
            )}
          </article>
          ) : null}
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
            {hasSearchQuery && visibleRanked.length === 0 ? (
              <div className="search-empty-state" aria-live="polite">
                <strong>{t.noSearchResultsTitle}</strong>
                <span>
                  {t.noSearchResultsText} "{query.trim()}".
                </span>
              </div>
            ) : null}
            {visibleRanked.map((place, index) => (
              <div
                key={place.id}
                className={active && place.id === active.id ? "place active-place" : "place"}
                onClick={() => {
                  setSelected(place.id);
                  recordRecommendationEvents([
                    {
                      establishmentId: place.id,
                      eventType: "profile_view",
                      resultPosition: index,
                      queryContext: { surface: "results" },
                    },
                  ]);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(place.id);
                    recordRecommendationEvents([
                      {
                        establishmentId: place.id,
                        eventType: "profile_view",
                        resultPosition: index,
                        queryContext: { surface: "results" },
                      },
                    ]);
                  }
                }}
              >
                <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                <span className="place-main">
                  <small>
                    {kindFilterLabel(place.kind, lang)} · {place.area}
                    {userLocation && hasCoordinates(place) ? ` · 📍 ${formatDistance(distanceFromPoint(place, userLocation), lang)}` : ""}
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
              </div>
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
          </div>
        </div>
        <div className="ask-box" style={{ position: "relative" }}>
          <div className="ask-input-container">
            <label htmlFor="ask">{t.askLabel}</label>
            {concierge.trim() ? (
              <button
                type="button"
                className="concierge-clear-btn"
                onClick={() => setConcierge("")}
                aria-label="Clear input field"
                title={lang === "sv" ? "Rensa fält" : "Clear field"}
              >
                ✕
              </button>
            ) : null}
            <textarea
              id="ask"
              value={concierge}
              onChange={(event) => setConcierge(event.target.value)}
              onFocus={() => setIsConciergeFocused(true)}
              onBlur={() => setTimeout(() => setIsConciergeFocused(false), 200)}
              placeholder={t.askPlaceholder}
            />
          </div>

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
          <button onClick={ask} disabled={asking} type="button" className="ask-submit-btn">
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
              onSelectPlace={handleSelectPlace}
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
        <CuratedSourcesPanel
          sources={curatedSources}
          isLoading={isSourcesLoading}
          lang={lang}
        />
        <div className="disclaimer">
          {t.dataNoteLabel}
          <span>{t.dataNoteText}</span>
        </div>
      </section>

      <MerchPanel
        lang={lang}
        cart={cart}
        onAddToCart={handleAddToCart}
        onOpenCart={() => setIsCartOpen(true)}
      />

      {superpowerMode && superpowerMode !== "add_source" ? (
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

      <PreloaderModal
        isOpen={showPreloader}
        onClose={handleClosePreloader}
        lang={lang}
      />

      <OnboardingModal
        isOpen={showOnboarding}
        onClose={handleCloseOnboarding}
        onOpenConcierge={() => {
          const el = document.getElementById("concierge");
          if (el) el.scrollIntoView({ behavior: "smooth" });
        }}
        lang={lang}
      />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        onUpdateQuantity={handleUpdateCartQty}
        onRemoveItem={handleRemoveCartItem}
        lang={lang}
      />

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
  const markersRef = useRef<Map<number, L.Marker>>(new Map());
  const userMarkerRef = useRef<L.Marker | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [locating, setLocating] = useState(false);

  const handleLocateUser = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
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
      },
      (err) => {
        setLocating(false);
        console.warn("Location error:", err);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
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

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
      <div className="map-toolbar" role="toolbar" aria-label={lang === "sv" ? "Kartkontroller" : "Map controls"}>
        <button
          type="button"
          className={`map-control-btn map-locate-btn ${locating ? "is-active" : ""}`}
          onClick={handleLocateUser}
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

function hasCoordinates(place: ScoredPlace): place is ScoredPlace & { latitude: number; longitude: number } {
  return typeof place.latitude === "number" && typeof place.longitude === "number";
}

function isMobileMapViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
}

function placeIcon(place: ScoredPlace, active: boolean) {
  return L.divIcon({
    className: "",
    html: `<span class="leaflet-place-marker ${kindClass(place.kind)} ${active ? "active" : ""}">${escapeHtml(place.name.slice(0, 1))}</span>`,
    iconSize: active ? [32, 32] : [24, 24],
    iconAnchor: active ? [16, 16] : [12, 12],
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

export function sanitizeAndAugmentPlaces(inputPlaces: PlaceInput[], includeDemoPlaces = false): PlaceInput[] {
  // 1. Purge commercial chains
  const filtered = inputPlaces.filter((p) => {
    const n = p.name.toLowerCase();
    return !EXCLUDED_COMMERCIAL_CHAINS.some((chain) => n.includes(chain));
  });

  // 2. Replace broad location buckets with more useful regions when the data supports it.
  const regionResolved = filtered.map((place) => {
    const resolvedArea = resolveStockholmRegion(place);
    if (resolvedArea === place.area) {
      return place;
    }

    return {
      ...place,
      area: resolvedArea,
      tags: Array.from(new Set([...place.tags.filter((tag) => !isBroadStockholmArea(tag)), resolvedArea])),
    };
  });

  // 3. Normalize and promote matched specialty coffee venues / reclassify grills & gastropubs
  const promoted = regionResolved.map((p) => {
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

  // 4. In explicit demo/dev mode, ensure fixture places are present for demos.
  const result = [...promoted];
  if (includeDemoPlaces) {
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
  }

  // 5. Strict deduplication by ID and normalized name + area
  const seenIds = new Set<number>();
  const seenKeys = new Set<string>();
  const deduped: PlaceInput[] = [];

  for (const place of result) {
    if (seenIds.has(place.id)) {
      continue;
    }
    const key = `${place.name.toLowerCase().trim()}_${(place.area || "").toLowerCase().trim()}`;
    if (seenKeys.has(key)) {
      continue;
    }

    seenIds.add(place.id);
    seenKeys.add(key);
    deduped.push(place);
  }

  return deduped;
}

async function fetchPlacesPayload(): Promise<{ source: DataSource; places: PlaceInput[] }> {
  try {
    const apiResponse = await fetch("/api/places");
    if (apiResponse.ok) {
      const payload = (await apiResponse.json()) as { source?: string; places?: PlaceInput[] };
      if (payload.places?.length) {
        const rawSource = payload.source ?? "d1";
        const source: DataSource =
          rawSource === "osm" || rawSource.startsWith("osm")
            ? "osm"
            : rawSource === "demo"
              ? "demo"
              : "d1";
        return { source, places: payload.places };
      }
    }
  } catch {
    // Fall through to the static dataset when the API path is unavailable.
  }

  const staticResponse = await fetch("/data/places.json");
  if (!staticResponse.ok) {
    throw new Error(`Static places responded ${staticResponse.status}`);
  }

  const payload = (await staticResponse.json()) as { source?: string; places?: PlaceInput[] };
  if (!payload.places?.length) {
    throw new Error("Static places returned no places");
  }
  const rawSource = payload.source ?? "osm";
  const source: DataSource =
    rawSource === "d1" ? "d1" : rawSource === "demo" ? "demo" : "osm";
  return { source, places: payload.places };
}
