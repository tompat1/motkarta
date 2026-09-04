import { DEFAULT_CONCIERGE_PROMPTS, DEFAULT_CURATED_SOURCES } from "../../lib/db-sources-prompts";
import {
  type EstablishmentType,
  type PlaceInput,
  type ScoredPlace,
  type UserPreferences,
} from "../../lib/scoring";
import { isBroadStockholmArea, resolveStockholmRegion } from "../../lib/stockholm-regions";

export const establishmentTypes = [
  "All places",
  "Curated",
  "Saved",
  "Latest",
  "Restaurant",
  "Bakery",
  "Café",
  "Specialty coffee",
] as const;

export const allCuisines = "All cuisines";
export const modes = [
  "For you",
  "Hidden gems",
  "Popular now",
  "Local favourites",
  "Quality first",
  "Recently opened",
  "Expert selected",
  "Most verified",
] as const;
export const sortModes = ["Best match", "Distance", "Alphabetical", "Surprise me"] as const;
export const renderLimit = 350;
export const recommendationImpressionLimit = 50;
export const stockholmCenter = { latitude: 59.3293, longitude: 18.0686 };

export type EstablishmentFilter = (typeof establishmentTypes)[number];

export type CuisineFilter = typeof allCuisines | string;
export type Mode = (typeof modes)[number];
export type SortMode = (typeof sortModes)[number];
export function modeScore(place: ScoredPlace, mode: Mode) {
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

export function rounded(value: number) {
  return Math.round(value);
}

export function comparePlaces(
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

export function distanceFromPoint(
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

export function formatDistance(distKm: number, _lang: Language): string {
  if (distKm === Number.POSITIVE_INFINITY || isNaN(distKm)) return "";
  if (distKm < 1) {
    return `${Math.round(distKm * 1000)} m`;
  }
  return `${distKm.toFixed(1)} km`;
}


export const DISTANCE_INTENT_REGEX = /\b(närmast|närmaste|närmst|närmsta|nära|i närheten|kortast|avstånd|closest|nearest|near me|nära mig|close by|closest place)\b/i;

export function seededRandom(id: number, seed: number) {
  const value = Math.sin((id + seed) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export function formatUpdatedDate(value: string | undefined) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-SE", { dateStyle: "medium" }).format(date);
}

export function sentenceList(parts: string[]) {
  if (parts.length <= 1) {
    return parts[0] ?? "";
  }

  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }

  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

export function recommendationExplanation(place: PlaceInput) {
  const reasons = (place.discoveryReasons ?? [])
    .map((reason) => reason.trim().replace(/\.$/, ""))
    .filter(Boolean)
    .slice(0, 3);

  if (!reasons.length) {
    return "Recommended from available open data; more source evidence will improve this explanation.";
  }

  return `Recommended because ${sentenceList(reasons)}.`;
}

export function cuisineParts(place: Pick<PlaceInput, "cuisine" | "tags">) {
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

export function modeLabel(mode: Mode, lang: Language): string {
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

export function sortModeLabel(sortMode: SortMode, lang: Language): string {
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

export function logConciergeQuery(queryText: string, lang: Language) {
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

export function kindFilterLabel(kind: EstablishmentFilter | string, lang: Language): string {
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

export function cuisineOptionsFromPlaces(places: PlaceInput[]) {
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

export function preferencesFromQuery(query: string, kind: EstablishmentFilter): UserPreferences {
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

export function hasCoordinates(place: ScoredPlace): place is ScoredPlace & { latitude: number; longitude: number } {
  return typeof place.latitude === "number" && typeof place.longitude === "number";
}


export interface CuratedSource {
  id: string;
  name: string;
  url: string;
  type: "Official City Guide" | "Verified Guide" | "Municipal Inspection" | "Open Data" | "Editorial Review" | "Community";
  description: string;
  license: string;
  verifiedCount?: number;
  scrapedPoints?: number;
  importedCount?: number;
  coveragePercent?: number;
  lastScrapedAt?: string;
  addedByUser?: boolean;
}

export const INITIAL_CURATED_SOURCES = DEFAULT_CURATED_SOURCES;

export const curatedSourceTypes: CuratedSource["type"][] = [
  "Official City Guide",
  "Verified Guide",
  "Municipal Inspection",
  "Open Data",
  "Editorial Review",
  "Community",
];

export const curatedSourceTypeLabels: Record<Language, Record<CuratedSource["type"], string>> = {
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

export const curatedSourceEnglishCopy: Record<string, Partial<Pick<CuratedSource, "name" | "description" | "license">>> = {
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

export function localizedCuratedSource(source: CuratedSource, lang: Language): CuratedSource {
  if (lang !== "en") return source;
  return { ...source, ...curatedSourceEnglishCopy[source.id] };
}

export function formatScrapeDate(dateStr?: string, lang: Language = "sv"): string {
  if (!dateStr) return lang === "sv" ? "Idag 11:07" : "Today 11:07 AM";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString(lang === "sv" ? "sv-SE" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export type SuperpowerMode = "add_place" | "add_review" | "add_photo" | "rate_place" | "add_source";
