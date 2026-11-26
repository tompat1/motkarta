import type { CuratedSource } from "../src/app/shared";

export const DEFAULT_CURATED_SOURCES: CuratedSource[] = [
  {
    id: "husa-guide",
    name: "Anders Husa & Kaitlin Orr Guide",
    url: "https://andershusa.com",
    type: "Verified Guide",
    description: "Kurerad krog- och restaurangguide av Michelin- och World's 50 Best-jurymedlemmar Anders Husa & Kaitlin Orr.",
    license: "Citerat med tillstånd (andershusa.com)",
    verifiedCount: 44,
    scrapedPoints: 50,
    importedCount: 44,
    coveragePercent: 88.0,
    lastScrapedAt: "2026-09-03T08:30:00Z",
  },
  {
    id: "stockholm-stad",
    name: "Stockholms Stad Livsmedelskontroll",
    url: "https://miljo.stockholm.se",
    type: "Municipal Inspection",
    description: "Officiella kommunala miljö- och hälsoskyddsgranskningar samt livsmedelsinspektioner.",
    license: "CC0 1.0 Universal / Öppen kommunal data",
    verifiedCount: 3192,
    scrapedPoints: 3212,
    importedCount: 3192,
    coveragePercent: 80.6,
    lastScrapedAt: "2026-09-03T06:00:00Z",
  },
  {
    id: "openstreetmap",
    name: "OpenStreetMap Contributors",
    url: "https://www.openstreetmap.org",
    type: "Open Data",
    description: "Geografiska koordinater, byggnadskonturer och oberoende POI-identiteter för Stockholms stad.",
    license: "ODbL 1.0 (Open Database License)",
    verifiedCount: 3961,
    scrapedPoints: 14500,
    importedCount: 3961,
    coveragePercent: 100.0,
    lastScrapedAt: "2026-09-03T05:00:00Z",
  },
  {
    id: "white-guide",
    name: "White Guide Nordic",
    url: "https://whiteguide.com",
    type: "Editorial Review",
    description: "Nordiska krog- och fikatillsynsbedömningar av oberoende gastronomiprofessionella.",
    license: "Redaktionell granskning",
    verifiedCount: 77,
    scrapedPoints: 85,
    importedCount: 77,
    coveragePercent: 90.6,
    lastScrapedAt: "2026-09-03T08:00:00Z",
  },
  {
    id: "specialty-coffee-se",
    name: "Specialty Coffee Sweden Registry",
    url: "https://specialtycoffee.se",
    type: "Verified Guide",
    description: "Kvalitetssäkrade kaffebönskällor, spårbarhetsbevis och rosteriverifieringar i Stockholm.",
    license: "Öppen branschstandard",
    verifiedCount: 15,
    scrapedPoints: 15,
    importedCount: 15,
    coveragePercent: 100.0,
    lastScrapedAt: "2026-09-03T09:00:00Z",
  },
  {
    id: "visit-stockholm",
    name: "Visit Stockholm (Officiella Stadsguiden)",
    url: "https://www.visitstockholm.se",
    type: "Official City Guide",
    description: "Officiell besöks- och restaurangguide från Stockholms Stad. En opartisk och heltäckande resurs för Stockholms matkultur, krogar och caféer.",
    license: "Officiell stadsportal (Stockholms Stad)",
    verifiedCount: 87,
    scrapedPoints: 97,
    importedCount: 87,
    coveragePercent: 89.7,
    lastScrapedAt: "2026-09-03T07:30:00Z",
  },
  {
    id: "tasstipset",
    name: "Tasstipset (Hundvänliga ställen)",
    url: "https://tasstipset.se",
    type: "Verified Guide",
    description: "Verifierade hundvänliga caféer, bagerier, kvarterskrogar och restauranger i Storstockholm med hundpolicy och ägarbekräftelse.",
    license: "Citerat med tillstånd (tasstipset.se)",
    verifiedCount: 1058,
    scrapedPoints: 1680,
    importedCount: 1058,
    coveragePercent: 88.8,
    lastScrapedAt: "2026-09-03T09:07:00Z",
  },
  {
    id: "spotted-by-locals",
    name: "Spotted by Locals Stockholm",
    url: "https://www.spottedbylocals.com/stockholm/",
    type: "Verified Guide",
    description: "Handplockade och uppdaterade dolda pärlor, krogtipps och lokala favoritställen i Stockholm skrivna av lokala invånare (Spotters).",
    license: "Redaktionell stadsguide / Lokala spotters",
    verifiedCount: 52,
    scrapedPoints: 138,
    importedCount: 52,
    coveragePercent: 91.2,
    lastScrapedAt: "2026-09-08T12:00:00Z",
  },
  {
    id: "burgerdudes",
    name: "Burgerdudes",
    url: "https://www.burgerdudes.se",
    type: "Verified Guide",
    description: "Världens ledande hamburgarguide, grundad i Stockholm 2014, som recenserar och rankar Stockholms bästa hantverksburgare och oberoende hamburgerställen.",
    license: "Redaktionell hamburgarguide (burgerdudes.se)",
    verifiedCount: 24,
    scrapedPoints: 24,
    importedCount: 24,
    coveragePercent: 100.0,
    lastScrapedAt: "2026-11-18T12:00:00Z",
  },
  {
    id: "michelin-guide",
    name: "Guide Michelin Nordic",
    url: "https://guide.michelin.com/se/sv/stockholm-region/stockholm/restaurants",
    type: "Awards & Recognition",
    description: "Internationellt erkända utmärkelser för exceptionell gastronomi: Michelinstjärnor (1-3 stjärnor), Bib Gourmand, Green Star och Selected venues.",
    license: "Officiell gastronomisk guide (guide.michelin.com)",
    verifiedCount: 16,
    scrapedPoints: 16,
    importedCount: 16,
    coveragePercent: 100.0,
    lastScrapedAt: "2026-11-18T12:00:00Z",
  },
  {
    id: "dn-krog",
    name: "Dagens Nyheter (Krogkommissionen & DN På Stan)",
    url: "https://www.dn.se/om/krogkommissionen/",
    type: "Editorial Review",
    description: "Dagens Nyheters anonyma krogkommission med oberoende krogtester, betyg (1-5) och DN På Stan-rekommendationer för Stockholms matscen.",
    license: "Redaktionell krogkritik (dn.se)",
    verifiedCount: 29,
    scrapedPoints: 60,
    importedCount: 29,
    coveragePercent: 90.0,
    lastScrapedAt: "2026-11-05T09:00:00Z",
  },
  {
    id: "svd-krogguiden",
    name: "Svenska Dagbladet (SvD Krogguiden)",
    url: "https://www.svd.se/av/krog",
    type: "Editorial Review",
    description: "Svenska Dagbladets gastronomiska recensioner med poängbedömning (mat, miljö, service), krogklassiker och helhetsbetyg upp till 6 tärningar.",
    license: "Redaktionell krogkritik (svd.se)",
    verifiedCount: 25,
    scrapedPoints: 50,
    importedCount: 25,
    coveragePercent: 91.0,
    lastScrapedAt: "2026-11-06T09:30:00Z",
  },
  {
    id: "allt-om-mat",
    name: "Allt om Mat (Krogrecensioner & Bästa Krogarna)",
    url: "https://alltommat.expressen.se/restaurang/",
    type: "Editorial Review",
    description: "Sveriges ledande mattidning sedan 1970 med professionella krogtester, kockrekommendationer och Stockholmsbästalistor.",
    license: "Redaktionell gastronomiguide (alltommat.se)",
    verifiedCount: 22,
    scrapedPoints: 45,
    importedCount: 22,
    coveragePercent: 93.0,
    lastScrapedAt: "2026-11-08T11:00:00Z",
  },
  {
    id: "vagabond",
    name: "Vagabond Resemagasin (Stockholmsguiden)",
    url: "https://www.vagabond.se/sverige/stockholm/",
    type: "Travel & Dining Guide",
    description: "Sveriges ledande resemagasin med handplockade mat- och krogreportage, klassiska bakfickor och lokala pärlor i Stockholm.",
    license: "Redaktionell reseguide (vagabond.se)",
    verifiedCount: 28,
    scrapedPoints: 40,
    importedCount: 28,
    coveragePercent: 94.0,
    lastScrapedAt: "2026-11-09T14:00:00Z",
  },
  {
    id: "stora-restaurangpriset",
    name: "Stora Restaurangpriset / Svenska Gastronomipriset",
    url: "https://restaurangpriset.se",
    type: "Industry Awards",
    description: "Branschens mest prestigefyllda utmärkelse där Sveriges främsta kockar, sommelierer och krogfolk röstar fram Årets Krog, Bar och Kock.",
    license: "Branschens gastronomipris (restaurangpriset.se)",
    verifiedCount: 22,
    scrapedPoints: 30,
    importedCount: 22,
    coveragePercent: 95.0,
    lastScrapedAt: "2026-11-10T12:00:00Z",
  },
  {
    id: "sveriges-basta",
    name: "Sveriges Bästa (Bord, Barer & Krogtoppen)",
    url: "https://sverigesbasta.com",
    type: "Curated Ranking",
    description: "Oberoende ranking och guide till Sveriges och Stockholms bästa restauranger, barer och matupplevelser sammanställt av krogkännare.",
    license: "Oberoende krogportal (sverigesbasta.com)",
    verifiedCount: 17,
    scrapedPoints: 17,
    importedCount: 17,
    coveragePercent: 100.0,
    lastScrapedAt: "2026-11-18T12:00:00Z",
  },
  {
    id: "thatsup",
    name: "Thatsup Stockholm (Redaktionella guider & krogtips)",
    url: "https://thatsup.se/stockholm/",
    type: "Travel & Dining Guide",
    description:
      "Namngiven redaktion, daterade stadsdels- och köksguider, nyöppningar och signerade redaktionsfavoriter. Används som upptäckts- och relevanskälla (noll vikt på guideordning/upprepning; betalda Premium-placeringar exkluderas och högt förtroende kräver separat oberoende belägg).",
    license: "Redaktionell stadsguide med kommersiell annonsmodell — upptäcktskälla (thatsup.se)",
    verifiedCount: 90,
    scrapedPoints: 89,
    importedCount: 89,
    coveragePercent: 97.8,
    lastScrapedAt: "2026-11-26T18:35:00Z",
  },
];

export const DEFAULT_CONCIERGE_PROMPTS = [
  "specialty coffee och kardemummabulle på Södermalm",
  "bästa mexikanska tacos i Vasastan",
  "familjeägd fransk bistro med bra vin i Gamla Stan",
  "hantverksbageri med surdegsbröd i Zinkensdamm",
  "handgjorda polska pierogi i Gamla Stan",
  "dolda pärlor för middag nära mig",
  "3-stjärnig fine dining med avsmakningsmeny",
  "svensk husmanskost till rimligt pris",
  "bageri med nysandade kanelbullar",
  "italienska trattorias med färsk pasta",
  "izakaya och yakitori spett i Vasastan",
];

export const DEFAULT_CONCIERGE_PROMPTS_EN = [
  "specialty coffee and a cardamom bun in Södermalm",
  "best Mexican tacos in Vasastan",
  "family-owned French bistro with great wine in Gamla Stan",
  "artisan bakery with sourdough bread in Zinkensdamm",
  "handmade Polish pierogi in Gamla Stan",
  "hidden gems for dinner near me",
  "3-star fine dining with a tasting menu",
  "traditional Swedish home cooking at a fair price",
  "bakery with freshly baked cinnamon buns",
  "Italian trattorias with fresh pasta",
  "izakaya and yakitori skewers in Vasastan",
];

type D1Db = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
      run(): Promise<{ success?: boolean }>;
    };
    all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
    run(): Promise<{ success?: boolean }>;
  };
};

export async function loadSourcesFromD1(db?: D1Db): Promise<CuratedSource[]> {
  if (!db) return DEFAULT_CURATED_SOURCES;
  try {
    const res = await db.prepare("SELECT * FROM curated_sources ORDER BY created_at DESC").all<{
      id: string;
      name: string;
      url: string;
      type: string;
      description: string;
      license: string;
      verified_count: number;
      added_by_user: number;
    }>();

    if (res.results && res.results.length > 0) {
      const dbSources: CuratedSource[] = res.results.map((r) => ({
        id: r.id,
        name: r.name,
        url: r.url,
        type: r.type as CuratedSource["type"],
        description: r.description,
        license: r.license,
        verifiedCount: r.verified_count,
        addedByUser: Boolean(r.added_by_user),
      }));
      const seenIds = new Set(dbSources.map((s) => s.id));
      for (const fallback of DEFAULT_CURATED_SOURCES) {
        if (!seenIds.has(fallback.id)) {
          dbSources.push(fallback);
        }
      }
      return dbSources;
    }
  } catch (err) {
    console.warn("Could not fetch curated_sources from D1, using defaults", err);
  }
  return DEFAULT_CURATED_SOURCES;
}

export async function saveSourceToD1(db: D1Db | undefined, source: CuratedSource): Promise<boolean> {
  if (!db) return false;
  try {
    await db
      .prepare(
        "INSERT INTO curated_sources (id, name, url, type, description, license, verified_count, added_by_user) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        source.id,
        source.name,
        source.url,
        source.type,
        source.description,
        source.license,
        source.verifiedCount ?? 0,
        source.addedByUser ? 1 : 0
      )
      .run();
    return true;
  } catch (err) {
    console.error("Failed to insert curated_source into D1", err);
    return false;
  }
}

export async function loadPromptsFromD1(db?: D1Db): Promise<string[]> {
  if (!db) return DEFAULT_CONCIERGE_PROMPTS;
  try {
    const res = await db.prepare("SELECT prompt FROM concierge_prompts ORDER BY usage_count DESC, created_at DESC LIMIT 50").all<{
      prompt: string;
    }>();

    if (res.results && res.results.length > 0) {
      const dbPrompts = res.results.map((r) => r.prompt);
      return Array.from(new Set([...dbPrompts, ...DEFAULT_CONCIERGE_PROMPTS]));
    }
  } catch (err) {
    console.warn("Could not fetch concierge_prompts from D1, using defaults", err);
  }
  return DEFAULT_CONCIERGE_PROMPTS;
}

export async function savePromptToD1(db: D1Db | undefined, promptText: string): Promise<boolean> {
  if (!db || !promptText.trim()) return false;
  const clean = promptText.trim();
  const id = `prompt-${clean.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 40)}`;
  try {
    await db
      .prepare(
        "INSERT INTO concierge_prompts (id, prompt, usage_count) VALUES (?, ?, 1) ON CONFLICT(prompt) DO UPDATE SET usage_count = usage_count + 1"
      )
      .bind(id, clean)
      .run();
    return true;
  } catch (err) {
    console.error("Failed to insert concierge_prompt into D1", err);
    return false;
  }
}
