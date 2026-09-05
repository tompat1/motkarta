import type { CuratedSource } from "../src/app/shared";

export const DEFAULT_CURATED_SOURCES: CuratedSource[] = [
  {
    id: "husa-guide",
    name: "Anders Husa & Kaitlin Orr Guide",
    url: "https://andershusa.com",
    type: "Verified Guide",
    description: "Kurerad krog- och restaurangguide av Michelin- och World's 50 Best-jurymedlemmar Anders Husa & Kaitlin Orr.",
    license: "Citerat med tillstånd (andershusa.com)",
    verifiedCount: 45,
    scrapedPoints: 50,
    importedCount: 45,
    coveragePercent: 90.0,
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
    verifiedCount: 78,
    scrapedPoints: 85,
    importedCount: 78,
    coveragePercent: 91.8,
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
    verifiedCount: 88,
    scrapedPoints: 240,
    importedCount: 88,
    coveragePercent: 90.7,
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
      return res.results.map((r) => ({
        id: r.id,
        name: r.name,
        url: r.url,
        type: r.type as CuratedSource["type"],
        description: r.description,
        license: r.license,
        verifiedCount: r.verified_count,
        addedByUser: Boolean(r.added_by_user),
      }));
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
