import { requireAdmin, type AdminAuthEnv } from "../../../lib/admin-auth.ts";
import {
  combineVenueStatusSignals,
  detectClosureTextInHtml,
  interpretGoogleBusinessStatus,
  interpretOsmTags,
  isSafePublicHttpUrl,
  type VenueStatusCheckResult,
  type VenueStatusSignal,
} from "../../../lib/venue-status-check.ts";

type EventContext<Env> = {
  request: Request;
  env: Env;
};

type Env = {
  DB?: unknown;
  GOOGLE_PLACES_API_KEY?: string;
} & AdminAuthEnv;

type VenueCheckInput = {
  id: number;
  name: string;
  area?: string | null;
  website?: string | null;
  osmType?: string | null;
  osmId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const MAX_VENUES_PER_REQUEST = 15;
const FETCH_TIMEOUT_MS = 4500;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkWebsiteSignal(website: string | null | undefined): Promise<VenueStatusSignal | null> {
  const safeUrl = isSafePublicHttpUrl(website);
  if (!safeUrl) return null;

  try {
    const res = await fetchWithTimeout(safeUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": "MotkartaStatusCheck/1.0 (+https://motkarta.rynell.org)",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });
    if (res.status === 404 || res.status === 410 || res.status >= 500) {
      return {
        source: "website",
        status: "website_down",
        detail: `Website HTTP ${res.status}`,
      };
    }
    if (!res.ok) {
      return {
        source: "website",
        status: "unknown",
        detail: `Website HTTP ${res.status}`,
      };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      const bodyText = (await res.text()).slice(0, 65536);
      const closure = detectClosureTextInHtml(bodyText);
      if (closure.status) {
        return {
          source: "website",
          status: closure.status,
          detail: `Website mentions "${closure.matchedPhrase}"`,
        };
      }
    }

    return {
      source: "website",
      status: "open",
      detail: `Website reachable (HTTP ${res.status})`,
    };
  } catch (err) {
    const message = err instanceof Error && err.name === "AbortError" ? "timed out" : "unreachable";
    return {
      source: "website",
      status: "website_down",
      detail: `Website ${message}`,
    };
  }
}

async function checkOsmSignal(
  osmType: string | null | undefined,
  osmId: string | null | undefined,
): Promise<VenueStatusSignal | null> {
  const type = typeof osmType === "string" ? osmType.trim().toLowerCase() : "";
  const id = typeof osmId === "string" ? osmId.trim() : "";
  if (!["node", "way", "relation"].includes(type) || !/^\d+$/.test(id)) {
    return null;
  }

  try {
    const res = await fetchWithTimeout(`https://api.openstreetmap.org/api/0.6/${type}/${id}.json`, {
      headers: { "user-agent": "MotkartaStatusCheck/1.0 (+https://motkarta.rynell.org)" },
    });
    if (res.status === 404 || res.status === 410) {
      return interpretOsmTags(null, false);
    }
    if (!res.ok) return null;
    const payload = (await res.json()) as {
      elements?: Array<{ tags?: Record<string, string> }>;
    };
    const element = payload.elements?.[0];
    return interpretOsmTags(element?.tags ?? null, Boolean(element));
  } catch {
    return null;
  }
}

async function checkGoogleBusinessStatusSignal(
  venue: VenueCheckInput,
  apiKey: string | undefined,
): Promise<VenueStatusSignal | null> {
  if (!apiKey || !venue.name.trim()) return null;

  try {
    const textQuery = [venue.name.trim(), venue.area?.trim(), "Stockholm"].filter(Boolean).join(", ");
    const body: Record<string, unknown> = {
      textQuery,
      maxResultCount: 1,
    };
    if (typeof venue.latitude === "number" && typeof venue.longitude === "number") {
      body.locationBias = {
        circle: {
          center: { latitude: venue.latitude, longitude: venue.longitude },
          radius: 400.0,
        },
      };
    }

    const res = await fetchWithTimeout("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        // Neutral existence check only: never request ratings or reviews.
        "x-goog-fieldmask": "places.businessStatus,places.displayName",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as {
      places?: Array<{ businessStatus?: string }>;
    };
    return interpretGoogleBusinessStatus(payload.places?.[0]?.businessStatus);
  } catch {
    return null;
  }
}

async function checkSingleVenue(
  venue: VenueCheckInput,
  googleApiKey: string | undefined,
): Promise<VenueStatusCheckResult> {
  const [webSignal, osmSignal, googleSignal] = await Promise.all([
    checkWebsiteSignal(venue.website),
    checkOsmSignal(venue.osmType, venue.osmId),
    checkGoogleBusinessStatusSignal(venue, googleApiKey),
  ]);

  const signals = [webSignal, osmSignal, googleSignal].filter((s): s is VenueStatusSignal => Boolean(s));
  const { status, summary } = combineVenueStatusSignals(signals);

  return {
    id: venue.id,
    status,
    checkedAt: new Date().toISOString(),
    summary,
    signals,
  };
}

export async function onRequestPost(context: EventContext<Env>) {
  const auth = await requireAdmin(context.request, context.env);
  if (auth) return auth;

  let payload: { venues?: unknown };
  try {
    payload = (await context.request.json()) as { venues?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { headers: jsonHeaders, status: 400 });
  }

  const rawVenues = Array.isArray(payload.venues) ? payload.venues : [];
  if (rawVenues.length === 0) {
    return Response.json({ error: "At least one venue is required." }, { headers: jsonHeaders, status: 400 });
  }

  const venues: VenueCheckInput[] = rawVenues
    .slice(0, MAX_VENUES_PER_REQUEST)
    .filter((v): v is Record<string, unknown> => Boolean(v && typeof v === "object"))
    .map((v) => ({
      id: Number(v.id),
      name: String(v.name ?? ""),
      area: typeof v.area === "string" ? v.area : null,
      website: typeof v.website === "string" ? v.website : null,
      osmType: typeof v.osmType === "string" ? v.osmType : null,
      osmId: typeof v.osmId === "string" ? v.osmId : null,
      latitude: typeof v.latitude === "number" ? v.latitude : null,
      longitude: typeof v.longitude === "number" ? v.longitude : null,
    }))
    .filter((v) => Number.isFinite(v.id) && v.name.trim().length > 0);

  if (venues.length === 0) {
    return Response.json({ error: "No valid venues supplied." }, { headers: jsonHeaders, status: 400 });
  }

  const results: VenueStatusCheckResult[] = [];
  for (const venue of venues) {
    results.push(await checkSingleVenue(venue, context.env.GOOGLE_PLACES_API_KEY));
  }

  return Response.json({ results }, { headers: jsonHeaders });
}
