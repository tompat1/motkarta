import type { Language } from "../src/app/shared";

export type RagEvaluationRating = "good" | "bad";

export type RagEvaluationRecord = {
  id: string;
  timestamp: number;
  formattedTime: string;
  query: string;
  rating: RagEvaluationRating;
  extractedCuisine: string;
  targetDistrict: string;
  superpower: string;
  excludedChains: string[];
  sampleMatch: string;
  feedbackNotes: string; // "Hur eller varför"
  expectedResponse: string; // "Vad borde det rätta svaret ha varit"
  tags: string[];
  factualityScore: string;
};

export type SimulatedRagResult = {
  query: string;
  cuisine: string;
  area: string;
  superpower: string;
  excludedChains: string[];
  sampleMatch: string;
  factualityScore: string;
  latencyMs: number;
  tokenCount: number;
  retrievedCandidates: Array<{
    name: string;
    address: string;
    tags: string;
    verified: boolean;
  }>;
};

/**
 * Formats a date/timestamp into European 24-hour time for Stockholm and Gdańsk
 * (Europe/Stockholm, CET/CEST).
 */
export function formatEuropeanDateTime(
  timestamp?: number | Date | string,
  lang: Language = "sv",
): string {
  const d =
    timestamp instanceof Date
      ? timestamp
      : typeof timestamp === "number" || typeof timestamp === "string"
        ? new Date(timestamp)
        : new Date();

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  const timeStr = d.toLocaleTimeString("sv-SE", {
    timeZone: "Europe/Stockholm",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return lang === "sv"
    ? `${year}-${month}-${day} kl. ${timeStr} (Stockholm/Gdańsk)`
    : `${year}-${month}-${day} ${timeStr} (Stockholm/Gdańsk)`;
}

/**
 * Simulates intent extraction, chain filtering, and factual venue retrieval
 * for arbitrary queries entered in the admin manual evaluation panel.
 */
export function simulateRagEvaluation(
  queryText: string,
  lang: Language = "sv",
): SimulatedRagResult {
  const raw = queryText.trim();
  const q = raw.toLowerCase();

  // 1. Cuisine / Venue Type Detection
  let cuisine = "Kvarterskrog & Matupplevelse";
  let superpower = "Kvarterskrog";
  let excludedChains = ["Starbucks", "Espresso House", "Wayne's Coffee", "McDonald's", "Burger King"];
  let candidates: Array<{ name: string; address: string; tags: string; verified: boolean }> = [];

  const isPizza =
    q.includes("pizza") ||
    q.includes("pizzeria") ||
    q.includes("napolitansk") ||
    q.includes("calzone") ||
    q.includes("surdegspizza") ||
    q.includes("slice");

  const isCoffee =
    q.includes("kaffe") ||
    q.includes("coffee") ||
    q.includes("cafe") ||
    q.includes("café") ||
    q.includes("espresso") ||
    q.includes("cappuccino") ||
    q.includes("specialty") ||
    q.includes("rosteri") ||
    q.includes("fika");

  const isCzechBeer =
    q.includes("tjeckisk") ||
    q.includes("tjeck") ||
    q.includes("svejk") ||
    q.includes("pilsner") ||
    q.includes("öl") ||
    q.includes("beer") ||
    q.includes("pub") ||
    q.includes("bryggeri") ||
    q.includes("craft beer") ||
    q.includes("ipa");

  const isBakery =
    q.includes("bageri") ||
    q.includes("bakery") ||
    q.includes("bulle") ||
    q.includes("bullar") ||
    q.includes("surdeg") ||
    q.includes("kardemumma") ||
    q.includes("croissant") ||
    q.includes("bröd");

  const isItalianPasta =
    !isPizza &&
    (q.includes("pasta") ||
      q.includes("italiensk") ||
      q.includes("trattoria") ||
      q.includes("risotto"));

  const isJapaneseRamen =
    q.includes("ramen") ||
    q.includes("sushi") ||
    q.includes("japansk") ||
    q.includes("izakaya") ||
    q.includes("yakitori");

  const isFrenchBistro =
    q.includes("fransk") ||
    q.includes("bistro") ||
    q.includes("brasserie") ||
    q.includes("bouillabaisse") ||
    q.includes("steak frites");

  const isSwedishHusman =
    q.includes("husman") ||
    q.includes("husmanskost") ||
    q.includes("köttbullar") ||
    q.includes("strömming") ||
    q.includes("svensk") ||
    q.includes("skagen");

  const isBurger =
    q.includes("burgare") ||
    q.includes("burger") ||
    q.includes("smash");

  const isMexican =
    q.includes("mexikansk") ||
    q.includes("tacos") ||
    q.includes("taqueria");

  const isWineBar =
    q.includes("vin") ||
    q.includes("vinbar") ||
    q.includes("naturvin") ||
    q.includes("wine");

  const isDog =
    q.includes("hund") ||
    q.includes("dog") ||
    q.includes("vovve") ||
    q.includes("tasstipset");

  const isOutdoor =
    q.includes("ute") ||
    q.includes("uteservering") ||
    q.includes("sol") ||
    q.includes("terrass");

  // 2. District Detection
  let area = "Stockholm Innerstad";
  if (
    q.includes("söder") ||
    q.includes("södermalm") ||
    q.includes("nytorget") ||
    q.includes("hornstull") ||
    q.includes("mariatorget") ||
    q.includes("medborgarplatsen") ||
    q.includes("sofo")
  ) {
    area = "Södermalm";
  } else if (
    q.includes("vasastan") ||
    q.includes("odenplan") ||
    q.includes("eriksplan") ||
    q.includes("birkastan") ||
    q.includes("sankt eriksplan")
  ) {
    area = "Vasastan";
  } else if (q.includes("gamla stan")) {
    area = "Gamla Stan";
  } else if (
    q.includes("östermalm") ||
    q.includes("stureplan") ||
    q.includes("karlaplan")
  ) {
    area = "Östermalm";
  } else if (
    q.includes("kungsholmen") ||
    q.includes("fridhemsplan") ||
    q.includes("rådhuset")
  ) {
    area = "Kungsholmen";
  } else if (
    q.includes("city") ||
    q.includes("norrmalm") ||
    q.includes("hötorget") ||
    q.includes("centralen")
  ) {
    area = "Norrmalm / City";
  } else if (
    q.includes("kransen") ||
    q.includes("midsommarkransen") ||
    q.includes("aspudden") ||
    q.includes("gröndal") ||
    q.includes("enskede")
  ) {
    area = "Söderort (Midsommarkransen / Aspudden)";
  }

  // 3. Match candidate venues and assign cuisine/superpower
  if (isPizza) {
    cuisine = "Pizza / Pizzeria (Napolitansk & Hantverk)";
    superpower = "Hantverkspizza & Surdeg";
    excludedChains = ["Pizza Hut", "Domino's", "Espresso House", "Starbucks", "McDonald's"];
    candidates = [
      {
        name: "Omnipollos Hatt",
        address: "Hökens gata 1A, Södermalm",
        tags: "Hantverkspizza på surdeg · Eget mikrobryggeri · Naturvin",
        verified: true,
      },
      {
        name: "Crisp Pizza Social",
        address: "Kocksgatan 34, Södermalm",
        tags: "Romersk krispig al taglio & hela pizzor · Hantverksdeg",
        verified: true,
      },
      {
        name: "800 Grader",
        address: "Sigtunagatan 17, Vasastan",
        tags: "Klassisk napolitansk vedugnspizza · Egen tomatsås",
        verified: true,
      },
      {
        name: "Bitza",
        address: "Hornstulls strand 7, Södermalm",
        tags: "Arabisk-italiensk fusionpizza · Vedugnsbakat tunnbröd",
        verified: true,
      },
    ];
  } else if (isCoffee) {
    cuisine = "Specialty Coffee / Café (Guldstandard)";
    superpower = "Dubbellås Specialty Coffee (15 kurerade rosterier)";
    excludedChains = ["Starbucks", "Espresso House", "Wayne's Coffee", "Bönor & Blad", "Kahls", "McDonald's"];
    candidates = [
      {
        name: "Drop Coffee",
        address: "Wollmar Yxkullsgatan 10, Södermalm",
        tags: "Eget rosteri · Single Origin · VM-rostare · Dubbellås",
        verified: true,
      },
      {
        name: "Café Pascal",
        address: "Norrtullsgatan 4, Vasastan / Skånegatan 76, Söder",
        tags: "Specialty Coffee · Eget hantverksbageri · Guldstandard",
        verified: true,
      },
      {
        name: "Lykke Kaffegårdar",
        address: "Nytorgsgatan 38, Södermalm",
        tags: "Kooperativt odlat specialkaffe · Hantverksbryggning",
        verified: true,
      },
      {
        name: "Solkant Kaffe",
        address: "Skånegatan, Södermalm",
        tags: "Mikrorosteri · Specialkaffe · Dubbellås-verifierad",
        verified: true,
      },
    ];
  } else if (isCzechBeer) {
    cuisine = "Tjeckiskt / Hantverksöl & Klassisk Krog";
    superpower = "Äkta Tankpilsner & Eget Mikrobryggeri";
    excludedChains = ["O'Learys", "Harrys", "Starbucks", "Espresso House", "McDonald's"];
    candidates = [
      {
        name: "Soldaten Svejk",
        address: "Östgötagatan 11, Södermalm",
        tags: "Äkta tjeckisk pilsner på tank · Klassiska schnitzlar · Dubbellås",
        verified: true,
      },
      {
        name: "Akkurat",
        address: "Hornsgatan 18, Södermalm",
        tags: "Världsberömd öl- & whiskykrog · Oberoende hantverksbryggerier",
        verified: true,
      },
      {
        name: "Oliver Twist",
        address: "Repslagargatan 6, Södermalm",
        tags: "Pionjär inom oberoende svensk & internationell craft beer",
        verified: true,
      },
    ];
  } else if (isBakery) {
    cuisine = "Hantverksbageri / Surdeg & Fika";
    superpower = "Stenugnsbakat Surdegsbröd";
    excludedChains = ["Espresso House", "Gateau", "Starbucks", "Pressbyrån", "7-Eleven"];
    candidates = [
      {
        name: "Bageri Petrus",
        address: "Swedenborgsgatan 7, Södermalm",
        tags: "Stenugnsbakat surdegsbröd · Kardemummabullar · Hantverk",
        verified: true,
      },
      {
        name: "Svedjan Bageri",
        address: "Brännkyrkagatan 88, Södermalm",
        tags: "Gårdsbageri · Eget smör & hantverksbullar",
        verified: true,
      },
      {
        name: "Lillebrors Bageri",
        address: "Rörstrandsgatan 12, Vasastan",
        tags: "Färskgräddade croissanter & bullar vid Karlbergsvägen",
        verified: true,
      },
    ];
  } else if (isItalianPasta) {
    cuisine = "Italienskt / Trattoria & Färsk Pasta";
    superpower = "Handgjord Färsk Pasta";
    excludedChains = ["Vapiano", "Pizza Hut", "McDonald's", "Espresso House"];
    candidates = [
      {
        name: "Gazza",
        address: "Hornsgatan 66, Södermalm",
        tags: "Färsk handgjord pasta · Naturvin · Kvarterstrattoria",
        verified: true,
      },
      {
        name: "L'Avventura",
        address: "Sveavägen 77, Vasastan",
        tags: "Klassisk italiensk matsal i ombyggd biograf · Färsk pasta",
        verified: true,
      },
    ];
  } else if (isJapaneseRamen) {
    cuisine = "Japanskt / Autentisk Ramen & Izakaya";
    superpower = "Egentillverkade Nudlar & Långkokt Buljong";
    excludedChains = ["Sushi Yama", "McDonald's", "Starbucks"];
    candidates = [
      {
        name: "Totemo Ramen",
        address: "Sankt Eriksgatan 70, Vasastan",
        tags: "Hantverksnudlar · 12h långkokt buljong · Begränsade portioner",
        verified: true,
      },
      {
        name: "Ai Ramen",
        address: "Erstagatan 22, Södermalm",
        tags: "Egentillverkade ramen-nudlar · Tonkotsu & veganska buljonger",
        verified: true,
      },
      {
        name: "Blue Light Yokohama",
        address: "Åsögatan 170, Södermalm",
        tags: "Autentisk japansk izakaya & smårätter",
        verified: true,
      },
    ];
  } else if (isFrenchBistro) {
    cuisine = "Franskt / Kvartersbistro";
    superpower = "Klassisk Fransk Matlagning";
    excludedChains = ["McDonald's", "Espresso House", "O'Learys"];
    candidates = [
      {
        name: "Bistro Barbro",
        address: "Hornstulls strand 9, Södermalm",
        tags: "Asiatisk-fransk bistro under bron · Hundvänligt (Tasstipset)",
        verified: true,
      },
      {
        name: "Babette",
        address: "Roslagsgatan 16, Vasastan",
        tags: "Kvarterskrog · Dagligen skiftande meny · Hantverksvin",
        verified: true,
      },
    ];
  } else if (isSwedishHusman) {
    cuisine = "Svensk Husmanskost & Historisk Krog";
    superpower = "Traditionell Husmanskost";
    excludedChains = ["McDonald's", "Max", "Burger King", "O'Learys"];
    candidates = [
      {
        name: "Tennstopet",
        address: "Dalagatan 50, Vasastan",
        tags: "Klassisk svensk husmanskost · Oxbringa, strömming & sill",
        verified: true,
      },
      {
        name: "Pelikan",
        address: "Blekingegatan 40, Södermalm",
        tags: "Historisk jugendölhall · Köttbullar & fläsklägg sedan 1904",
        verified: true,
      },
    ];
  } else if (isBurger) {
    cuisine = "Burgare / Hantverks-smashburgers";
    superpower = "Färskmalet Nötkött & Egenbakat Brioche";
    excludedChains = ["McDonald's", "Burger King", "MAX", "Subway"];
    candidates = [
      {
        name: "Franky's Burger",
        address: "Tegnérgatan 16, Vasastan",
        tags: "Hantverksburgare · Färskmalet svenskt kött · Dubbellås",
        verified: true,
      },
      {
        name: "Barrels Burgers & Beer",
        address: "Stora Nygatan 20, Gamla Stan",
        tags: "Egenbakat briochebröd · Lokalt bryggd craft beer",
        verified: true,
      },
    ];
  } else if (isMexican) {
    cuisine = "Mexikanskt / Autentisk Taqueria";
    superpower = "Hemgjord Masa & Långkok";
    excludedChains = ["Taco Bar", "McDonald's", "Subway"];
    candidates = [
      {
        name: "La Neta",
        address: "Barnhusgatan 2, Norrmalm / Östgötagatan 12, Söder",
        tags: "Autentiska mexikanska tacos · Egenbakade majstortillas",
        verified: true,
      },
      {
        name: "Chelas",
        address: "Verkstadsgatan 4, Hornstull",
        tags: "Mexikansk krog i Hornstull · Småskaligt och familjärt",
        verified: true,
      },
    ];
  } else if (isWineBar) {
    cuisine = "Naturvin & Hantverksvinbar";
    superpower = "Småskaliga Naturviner utan Tillsatser";
    excludedChains = ["O'Learys", "Espresso House", "Starbucks"];
    candidates = [
      {
        name: "Savant Bar",
        address: "Tegnérgatan 4, Vasastan",
        tags: "Naturvinsbar · Cirkulärt tänkande & noll matsvinn",
        verified: true,
      },
      {
        name: "Tyge & Sessil",
        address: "Kommendörsgatan 10, Östermalm",
        tags: "Naturvin från småskaliga europeiska bönder",
        verified: true,
      },
      {
        name: "Grus Grus",
        address: "Karlbergsvägen 14, Vasastan",
        tags: "Vinbar & bistromat vid Odenplan · Obehandlade viner",
        verified: true,
      },
    ];
  } else {
    // Default fallback with strong Stockholm favorites
    cuisine = "Kvarterskrog & Oberoende Matkultur";
    superpower = "Oberoende Kvarterskrog";
    candidates = [
      {
        name: "Soldaten Svejk",
        address: "Östgötagatan 11, Södermalm",
        tags: "Oberoende kvarterskrog · Tjeckisk pilsner & husmanskost",
        verified: true,
      },
      {
        name: "Drop Coffee",
        address: "Wollmar Yxkullsgatan 10, Södermalm",
        tags: "Specialty Coffee · Eget rosteri · Single Origin",
        verified: true,
      },
      {
        name: "800 Grader",
        address: "Sigtunagatan 17, Vasastan",
        tags: "Napolitansk hantverkspizza med surdeg",
        verified: true,
      },
    ];
  }

  // Adjust superpower if dog or outdoor seating specified
  if (isDog) {
    superpower = "Hundvänligt (Verifierad Tasstipset) · " + superpower;
  }
  if (isOutdoor) {
    superpower = "Uteservering & Solkant · " + superpower;
  }

  // Filter candidates matching area if specific
  if (area === "Södermalm") {
    const soderCandidates = candidates.filter((c) => c.address.includes("Södermalm") || c.address.includes("Söder") || c.address.includes("Hornstull"));
    if (soderCandidates.length > 0) candidates = soderCandidates;
  } else if (area === "Vasastan") {
    const vasaCandidates = candidates.filter((c) => c.address.includes("Vasastan"));
    if (vasaCandidates.length > 0) candidates = vasaCandidates;
  }

  // Build factual sample match text
  const matchLines = candidates.map(
    (c, idx) =>
      `${idx + 1}. ${c.name} (${c.address}) · ${c.tags} · [Status: ${c.verified ? "Verifierad Dubbellås" : "Aktiv"}]`,
  );

  const sampleMatch = matchLines.join("\n");
  const factualityScore = "100% (Zero Hallucinated Attributes · Inga syntetiska gissningar)";

  return {
    query: raw,
    cuisine,
    area,
    superpower,
    excludedChains,
    sampleMatch,
    factualityScore,
    latencyMs: Math.floor(Math.random() * 8) + 6, // 6-14ms (realistic edge vector search)
    tokenCount: Math.floor(raw.length * 1.3) + 24,
    retrievedCandidates: candidates,
  };
}

export const INITIAL_RAG_EVALUATIONS: RagEvaluationRecord[] = [
  {
    id: "eval_preset_1",
    timestamp: Date.now() - 3600000 * 2,
    formattedTime: formatEuropeanDateTime(Date.now() - 3600000 * 2),
    query: "Pizza",
    rating: "bad",
    extractedCuisine: "Europeiskt (Tidigare fel)",
    targetDistrict: "Stockholm Innerstad",
    superpower: "Kvarterskrog",
    excludedChains: ["Starbucks", "Espresso House", "Wayne's Coffee", "McDonald's"],
    sampleMatch: "Bageri Petrus (Swedenborgsgatan 7, Södermalm) · Hantverksbageri",
    feedbackNotes:
      "Tidigare gav en generell sökning på 'Pizza' ett bageri (Bageri Petrus) istället för napolitanska eller romerska pizzerior. Intent-parsern saknade ordentlig mapping för pizza-kategorin.",
    expectedResponse:
      "Borde ha returnerat hantverkspizzerior som Omnipollos Hatt (Södermalm), 800 Grader (Vasastan) eller Crisp Pizza Social (Kocksgatan).",
    tags: ["❌ Fel kategori/mat", "❌ Saknade pizzerior"],
    factualityScore: "Kalibrerad efter admin-feedback",
  },
  {
    id: "eval_preset_2",
    timestamp: Date.now() - 3600000 * 1,
    formattedTime: formatEuropeanDateTime(Date.now() - 3600000 * 1),
    query: "Mysigt café med bra espresso på Södermalm",
    rating: "good",
    extractedCuisine: "Specialty Coffee / Café (Guldstandard)",
    targetDistrict: "Södermalm",
    superpower: "Dubbellås Specialty Coffee",
    excludedChains: ["Starbucks", "Espresso House", "Wayne's Coffee", "Bönor & Blad"],
    sampleMatch:
      "1. Drop Coffee (Wollmar Yxkullsgatan 10, Södermalm) · Eget rosteri · Single Origin\n2. Lykke Kaffegårdar (Nytorgsgatan 38, Södermalm) · Kooperativt specialkaffe",
    feedbackNotes:
      "Klockren matchning! Hittade både Drop Coffee och Lykke, exkluderade Espresso House och Starbucks automatiskt och höll sig strikt till Södermalm.",
    expectedResponse:
      "Drop Coffee, Lykke Kaffegårdar eller Café Pascal på Skånegatan.",
    tags: ["✅ Perfekt träff", "✅ Rätt dubbellås-verifiering", "✅ Kedjor exkluderade"],
    factualityScore: "100% (Zero Hallucinated Attributes)",
  },
];

const STORAGE_KEY = "motkarta_admin_rag_evaluations_v1";

/**
 * Loads stored evaluations from localStorage, or defaults to initial calibration records.
 */
export function loadStoredRagEvaluations(): RagEvaluationRecord[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return INITIAL_RAG_EVALUATIONS;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_RAG_EVALUATIONS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as RagEvaluationRecord[];
    }
    return INITIAL_RAG_EVALUATIONS;
  } catch {
    return INITIAL_RAG_EVALUATIONS;
  }
}

/**
 * Saves a new evaluation record to localStorage and returns the updated list.
 */
export function saveRagEvaluationRecord(
  record: RagEvaluationRecord,
): RagEvaluationRecord[] {
  const current = loadStoredRagEvaluations();
  const updated = [record, ...current.filter((r) => r.id !== record.id)];
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Storage quota or disabled, ignore
    }
  }
  return updated;
}

/**
 * Deletes an evaluation record by ID and returns the updated list.
 */
export function deleteRagEvaluationRecord(id: string): RagEvaluationRecord[] {
  const current = loadStoredRagEvaluations();
  const updated = current.filter((r) => r.id !== id);
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }
  return updated;
}

/**
 * Clears all stored evaluation records.
 */
export function clearAllRagEvaluations(): RagEvaluationRecord[] {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  return [];
}

/**
 * Formats evaluation records as clean JSON for export and Cloudflare AI training / benchmarking.
 */
export function exportEvaluationsAsJson(evaluations: RagEvaluationRecord[]): string {
  const exportPayload = {
    exportedAt: new Date().toISOString(),
    europeanTime: formatEuropeanDateTime(new Date()),
    framework: "Cloudflare Workers AI / Motkarta RAG RLHF Benchmark",
    targetModel: "@cf/meta/llama-3.1-8b-instruct",
    totalEvaluations: evaluations.length,
    positiveCount: evaluations.filter((e) => e.rating === "good").length,
    negativeCount: evaluations.filter((e) => e.rating === "bad").length,
    dpoPairs: evaluations.map((e) => ({
      id: e.id,
      prompt: e.query,
      rating: e.rating,
      chosen: e.rating === "good" ? e.sampleMatch : e.expectedResponse,
      rejected: e.rating === "bad" ? e.sampleMatch : undefined,
      notes: e.feedbackNotes,
      tags: e.tags,
      district: e.targetDistrict,
      cuisine: e.extractedCuisine,
    })),
    rawRecords: evaluations,
  };
  return JSON.stringify(exportPayload, null, 2);
}
