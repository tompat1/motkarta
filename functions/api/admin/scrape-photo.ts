import { pickWebsiteImageCandidate } from "../../../lib/website-image-scrape.ts";
import { requireAdmin, type AdminAuthEnv } from "../../../lib/admin-auth.ts";

type Context = { request: Request; env: AdminAuthEnv & { DB?: unknown } };
const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export async function onRequestPost({ request, env }: Context) {
  const auth = await requireAdmin(request, env);
  if (auth) return auth;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400, headers });
  }

  const placeId = Number(payload.placeId ?? payload.place_id);
  const website = normalizeWebsiteUrl(typeof payload.website === "string" ? payload.website : "");
  const currentUrl = typeof payload.currentUrl === "string" ? payload.currentUrl.trim()
    : typeof payload.current_url === "string" ? payload.current_url.trim() : "";

  if (!Number.isSafeInteger(placeId) || placeId <= 0 || !website) {
    return Response.json({ error: "Missing or invalid placeId/website." }, { status: 400, headers });
  }

  try {
    const response = await fetch(website, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Motkarta/1.0",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) {
      return Response.json({ error: `Could not fetch website (${response.status}).` }, { status: 502, headers });
    }

    const html = await response.text();
    const pick = pickWebsiteImageCandidate(html, website, currentUrl || null);
    if (!pick.imageUrl) {
      return Response.json({
        success: false,
        placeId,
        website,
        photoUrl: null,
        hasMore: false,
        candidateIndex: pick.candidateIndex,
        totalCandidates: pick.totalCandidates,
        skippedLogoCount: pick.skippedLogoUrls.length,
        error: pick.totalCandidates > 0
          ? "No more website image candidates after the current one."
          : "No usable website images found (only logo/banner candidates).",
      }, { status: 404, headers });
    }

    return Response.json({
      success: true,
      placeId,
      website,
      photoUrl: pick.imageUrl,
      source: pick.source,
      width: pick.width,
      height: pick.height,
      candidateIndex: pick.candidateIndex,
      totalCandidates: pick.totalCandidates,
      hasMore: pick.hasMore,
      skippedLogoCount: pick.skippedLogoUrls.length,
    }, { headers });
  } catch (cause) {
    console.error("Admin scrape-photo failed", cause);
    return Response.json({ error: "Website image scrape failed." }, { status: 503, headers });
  }
}

function normalizeWebsiteUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed.replace(/^http:\/\//i, "https://");
}
