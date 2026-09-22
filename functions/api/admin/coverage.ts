import { getAdminSession, type AdminAuthEnv } from "../../../lib/admin-auth.ts";

type EventContext<Env> = {
  request: Request;
  env: Env;
};

type D1Database = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
      run(): Promise<{ success?: boolean }>;
    };
    all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
    run(): Promise<{ success?: boolean }>;
  };
};

type Env = AdminAuthEnv & {
  DB?: D1Database;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-cache",
};

export type BlockedUrlEntry = {
  url: string;
  normalizedUrl?: string;
  domain?: string;
  placeId?: number | string | null;
  placeName?: string;
  errorType: string;
  errorMessage?: string;
  statusCode?: number | null;
  firstFailedAt?: string;
  lastFailedAt?: string;
  failCount?: number;
};

export type EnrichmentRunReport = {
  version: string;
  runId: string;
  timestamp: string;
  durationSeconds: number;
  status: string;
  summary: {
    totalVenuesChecked: number;
    successfulScrapes: number;
    failedScrapes: number;
    skippedBlockedUrls: number;
    newlyBlockedUrls: number;
    totalBlockedUrls: number;
  };
  recentErrors: Array<{
    placeId?: number | string | null;
    placeName?: string;
    url: string;
    errorType: string;
    errorMessage?: string;
    timestamp?: string;
  }>;
  blocklist: BlockedUrlEntry[];
};

export type CoverageReport = {
  generatedAt: string;
  source: "d1" | "unavailable";
  errors: string[];
  totalPlaces: number;
  catalogPlaces: number;
  activePublishedPlaces: number;
  address: {
    count: number;
    percentage: number;
    target: number;
    status: "PASS" | "PROGRESSING";
  };
  photos: {
    count: number;
    totalPhotos: number;
    percentage: number;
    target: number;
    status: "PASS" | "PROGRESSING";
    placeholderCount: number;
  };
  openingHours: {
    count: number;
    percentage: number;
    target: number;
    status: "PASS" | "PROGRESSING";
  };
  priceInfo: {
    count: number;
    percentage: number;
    target: number;
    status: "PASS" | "PROGRESSING";
  };
  websites: {
    count: number;
    percentage: number;
  };
  coordinates: {
    count: number;
    percentage: number;
    status: "PASS" | "PROGRESSING" | "UNKNOWN";
  };
  curatedSources: {
    totalSources: number;
    passingSources: number;
    percentage: number;
    status: "PASS" | "PROGRESSING" | "UNKNOWN";
  };
  lastEnrichedAt: string | null;
  enrichmentReport?: EnrichmentRunReport | null;
  urlBlocklist?: BlockedUrlEntry[];
};

export async function computeCoverageReport(db?: D1Database): Promise<CoverageReport> {
  let totalPlaces = 0, catalogPlaces = 0, activePublishedPlaces = 0;
  let addressCount = 0, websiteCount = 0, photosPlaceCount = 0;
  let totalPhotos = 0, hoursCount = 0, priceCount = 0;
  let coordinateCount = 0;
  const errors: string[] = [];
  let available = false;
  if (!db) errors.push("D1 is not configured.");

  if (db) {
    try {
      // Check table column info to avoid SQL syntax errors when migrations are pending
      const colsRes = await db.prepare("PRAGMA table_info(establishments)").all<{ name: string }>();
      const cols = new Set((colsRes.results ?? []).map((r) => r.name.toLowerCase()));

      const hasHours = cols.has("opening_hours");
      const hasPriceSek = cols.has("price_sek");
      const hasPriceLevel = cols.has("price_level");
      const hasChainStatus = cols.has("chain_status");
      const hasValidationLabel = cols.has("validation_label");

      const hoursSql = hasHours
        ? "sum(case when opening_hours is not null and opening_hours != '' and opening_hours != 'undefined' then 1 else 0 end)"
        : "0";

      let priceSql = "0";
      if (hasPriceSek && hasPriceLevel) {
        priceSql = "sum(case when (price_sek is not null and price_sek != '') or (price_level is not null and price_level > 0) then 1 else 0 end)";
      } else if (hasPriceSek) {
        priceSql = "sum(case when price_sek is not null and price_sek != '' then 1 else 0 end)";
      } else if (hasPriceLevel) {
        priceSql = "sum(case when price_level is not null and price_level > 0 then 1 else 0 end)";
      }

      let activeSql = "count(*)";
      if (hasChainStatus && hasValidationLabel) {
        activeSql = "sum(case when chain_status != 'chain' and (validation_label is null or validation_label != 'closed_wrong_category') then 1 else 0 end)";
      } else if (hasChainStatus) {
        activeSql = "sum(case when chain_status != 'chain' then 1 else 0 end)";
      }

      const query = `SELECT
        count(*) as count,
        sum(case when address is not null and address != '' and address GLOB '*[0-9]*' then 1 else 0 end) as with_addr,
        sum(case when website is not null and website != '' then 1 else 0 end) as with_web,
        ${hoursSql} as with_hours,
        ${priceSql} as with_price,
        ${activeSql} as active_count,
        sum(case when latitude between -90 and 90 and longitude between -180 and 180 then 1 else 0 end) as coordinate_count
      FROM establishments`;

      const placesRes = await db.prepare(query).all<{
        count: number;
        with_addr: number;
        with_web: number;
        with_hours: number;
        with_price: number;
        active_count: number;
        coordinate_count: number;
      }>();

      if (placesRes.results?.[0] && typeof placesRes.results[0].count === "number") {
        available = true;
        coordinateCount = placesRes.results[0].coordinate_count ?? 0;
        totalPlaces = placesRes.results[0].count;
        catalogPlaces = totalPlaces;
        const d1Addr = placesRes.results[0].with_addr ?? 0;
        addressCount = Math.min(totalPlaces, d1Addr);
        const d1Web = placesRes.results[0].with_web ?? 0;
        websiteCount = Math.min(totalPlaces, d1Web);
        const d1Hours = placesRes.results[0].with_hours ?? 0;
        hoursCount = Math.min(totalPlaces, d1Hours);
        const d1Price = placesRes.results[0].with_price ?? 0;
        priceCount = Math.min(totalPlaces, d1Price);
        activePublishedPlaces = Math.min(totalPlaces, placesRes.results[0].active_count ?? totalPlaces);
      }

      const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{ name: string }>();
      const names = new Set((tables.results ?? []).map((r) => r.name));
      const photoQueries: string[] = [];
      if (names.has("place_photos")) photoQueries.push("SELECT place_id FROM place_photos WHERE url IS NOT NULL AND url != '' AND url NOT LIKE '%unsplash.com%' AND url NOT LIKE '%wikimedia.org%' AND url NOT LIKE '%wikipedia%'");
      else errors.push("Scraped photo storage is not provisioned.");
      if (names.has("place_photo_uploads")) photoQueries.push("SELECT place_id FROM place_photo_uploads");
      else errors.push("Public photo upload storage is not provisioned.");
      if (photoQueries.length) {
        const photos = await db.prepare(`SELECT count(*) AS total_photos, count(distinct place_id) AS place_count FROM (${photoQueries.join(" UNION ALL ")}) media JOIN establishments e ON e.id = media.place_id`).all<{total_photos: number; place_count: number}>();
        totalPhotos = photos.results?.[0]?.total_photos ?? 0;
        photosPlaceCount = photos.results?.[0]?.place_count ?? 0;
      }
      if (!hasHours) errors.push("Opening-hours column is not provisioned.");
      if (!hasPriceSek && !hasPriceLevel) errors.push("Price columns are not provisioned.");
    } catch {
      errors.push("D1 coverage query failed; incomplete measurements are unavailable.");
    }
  }

  addressCount = Math.min(totalPlaces, addressCount);
  photosPlaceCount = Math.min(totalPlaces, photosPlaceCount);
  websiteCount = Math.min(totalPlaces, websiteCount);
  hoursCount = Math.min(totalPlaces, hoursCount);
  priceCount = Math.min(totalPlaces, priceCount);

  const addressPct = totalPlaces > 0 ? Number(Math.min(100, (addressCount / totalPlaces) * 100).toFixed(1)) : 0;
  const photosPct = totalPlaces > 0 ? Number(Math.min(100, (photosPlaceCount / totalPlaces) * 100).toFixed(1)) : 0;
  const websitePct = totalPlaces > 0 ? Number(Math.min(100, (websiteCount / totalPlaces) * 100).toFixed(1)) : 0;
  const hoursPct = totalPlaces > 0 ? Number(Math.min(100, (hoursCount / totalPlaces) * 100).toFixed(1)) : 0;
  const pricePct = totalPlaces > 0 ? Number(Math.min(100, (priceCount / totalPlaces) * 100).toFixed(1)) : 0;

  const placeholderCount = Math.max(0, totalPlaces - photosPlaceCount);

  return {
    generatedAt: new Date().toISOString(),
    source: available ? "d1" : "unavailable",
    errors,
    totalPlaces,
    catalogPlaces,
    activePublishedPlaces,
    address: {
      count: addressCount,
      percentage: addressPct,
      target: 100,
      status: addressPct >= 95 ? "PASS" : "PROGRESSING",
    },
    photos: {
      count: photosPlaceCount,
      totalPhotos,
      percentage: photosPct,
      target: 100,
      status: photosPct >= 95 ? "PASS" : "PROGRESSING",
      placeholderCount,
    },
    openingHours: {
      count: hoursCount,
      percentage: hoursPct,
      target: 100,
      status: hoursPct >= 95 ? "PASS" : "PROGRESSING",
    },
    priceInfo: {
      count: priceCount,
      percentage: pricePct,
      target: 100,
      status: pricePct >= 95 ? "PASS" : "PROGRESSING",
    },
    websites: {
      count: websiteCount,
      percentage: websitePct,
    },
    coordinates: {
      count: coordinateCount,
      percentage: totalPlaces ? Number((100 * coordinateCount / totalPlaces).toFixed(1)) : 0,
      status: totalPlaces && coordinateCount === totalPlaces ? "PASS" : "PROGRESSING",
    },
    curatedSources: {
      totalSources: 0,
      passingSources: 0,
      percentage: 0,
      status: "UNKNOWN",
    },
    lastEnrichedAt: null,
  };
}

async function loadEnrichmentArtifacts(context?: { request?: Request; env?: Env }): Promise<{
  enrichmentReport: EnrichmentRunReport | null;
  urlBlocklist: BlockedUrlEntry[];
}> {
  let enrichmentReport: EnrichmentRunReport | null = null;
  let urlBlocklist: BlockedUrlEntry[] = [];

  const assets = (context?.env as { ASSETS?: { fetch: (req: Request | string) => Promise<Response> } })?.ASSETS;
  if (assets && context?.request?.url) {
    try {
      const [rRes, bRes] = await Promise.all([
        assets.fetch(new URL("/data/enrichment_run_report.json", context.request.url).toString()).catch(() => null),
        assets.fetch(new URL("/data/enrichment_url_blocklist.json", context.request.url).toString()).catch(() => null),
      ]);
      if (rRes && rRes.ok) {
        enrichmentReport = (await rRes.json().catch(() => null)) as EnrichmentRunReport | null;
      }
      if (bRes && bRes.ok) {
        const bData = (await bRes.json().catch(() => null)) as { blockedUrls?: BlockedUrlEntry[] } | null;
        if (bData && Array.isArray(bData.blockedUrls)) {
          urlBlocklist = bData.blockedUrls;
        }
      }
    } catch {}
  }

  if (!enrichmentReport || urlBlocklist.length === 0) {
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const root = process.cwd();
      if (!enrichmentReport) {
        const rPath = path.resolve(root, "public/data/enrichment_run_report.json");
        const rContent = await fs.readFile(rPath, "utf-8").catch(() => null);
        if (rContent) {
          enrichmentReport = JSON.parse(rContent) as EnrichmentRunReport;
        }
      }
      if (urlBlocklist.length === 0) {
        const bPath = path.resolve(root, "public/data/enrichment_url_blocklist.json");
        const bContent = await fs.readFile(bPath, "utf-8").catch(() => null);
        if (bContent) {
          const bData = JSON.parse(bContent) as { blockedUrls?: BlockedUrlEntry[] };
          if (bData && Array.isArray(bData.blockedUrls)) {
            urlBlocklist = bData.blockedUrls;
          }
        }
      }
    } catch {}
  }

  return { enrichmentReport, urlBlocklist };
}

export async function onRequestGet(context: EventContext<Env>) {
  const session = await getAdminSession(context.request, context.env);
  if (!session.admin) {
    return Response.json(
      { error: "Unauthorized admin access." },
      { headers: jsonHeaders, status: session.status ?? 401 },
    );
  }

  const report = await computeCoverageReport(context.env.DB);
  const artifacts = await loadEnrichmentArtifacts(context);
  report.enrichmentReport = artifacts.enrichmentReport;
  report.urlBlocklist = artifacts.urlBlocklist;
  return Response.json(report, { headers: jsonHeaders });
}

export async function onRequestPost(context: EventContext<Env>) {
  const session = await getAdminSession(context.request, context.env);
  if (!session.admin) {
    return Response.json(
      { error: "Unauthorized admin access." },
      { headers: jsonHeaders, status: session.status ?? 401 },
    );
  }

  const body = (await context.request.json().catch(() => ({}))) as {
    action?: string;
    url?: string;
  };

  const report = await computeCoverageReport(context.env.DB);
  const artifacts = await loadEnrichmentArtifacts(context);

  if (body.action === "unblock_url" && body.url) {
    const targetUrl = body.url.trim();
    const normTarget = targetUrl.toLowerCase().replace(/\/+$/, "");

    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const blocklistPath = path.resolve(process.cwd(), "public/data/enrichment_url_blocklist.json");
      const content = await fs.readFile(blocklistPath, "utf-8").catch(() => null);
      if (content) {
        const bData = JSON.parse(content) as { version?: string; blockedUrls?: BlockedUrlEntry[] };
        if (Array.isArray(bData.blockedUrls)) {
          bData.blockedUrls = bData.blockedUrls.filter((entry) => {
            const entryNorm = (entry.normalizedUrl || entry.url || "").trim().toLowerCase().replace(/\/+$/, "");
            return entryNorm !== normTarget && entry.url !== targetUrl;
          });
          await fs.writeFile(blocklistPath, JSON.stringify(bData, null, 2) + "\n", "utf-8");
        }
      }
    } catch {}

    const filtered = artifacts.urlBlocklist.filter((entry) => {
      const entryNorm = (entry.normalizedUrl || entry.url || "").trim().toLowerCase().replace(/\/+$/, "");
      return entryNorm !== normTarget && entry.url !== targetUrl;
    });

    report.enrichmentReport = artifacts.enrichmentReport;
    report.urlBlocklist = filtered;

    return Response.json(
      {
        success: true,
        action: "unblock_url",
        message: `Unblocked ${targetUrl}`,
        report,
      },
      { headers: jsonHeaders },
    );
  }

  report.enrichmentReport = artifacts.enrichmentReport;
  report.urlBlocklist = artifacts.urlBlocklist;

  const message = "Coverage measured from D1. This action does not run enrichment or synchronize data.";

  return Response.json(
    {
      success: report.source === "d1",
      action: "audit",
      message,
      report,
    },
    { headers: jsonHeaders },
  );
}
