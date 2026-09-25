const LOGO_ASSET_PATTERN =
  /(?:^|[\W_])(logos?|loggo|favicon|icons?|pixel|placeholder|tracking|wordmark|brandmark|social[-_]?share)(?:$|[\W_])/i;

const MONOCHROME_NAME_PATTERN = /(?:^|[\W_])(black|white|invert|mono)(?:$|[\W_])/i;

type WebsiteImageDimensions = {
  width?: number | null;
  height?: number | null;
};

export type WebsiteImageCandidate = WebsiteImageDimensions & {
  url: string;
  source: string;
};

type ImageCandidate = WebsiteImageCandidate;

export type WebsiteImageScrapeResult = {
  imageUrl: string | null;
  width: number | null;
  height: number | null;
  skippedAsLogoBanner: boolean;
  skipReason: string | null;
  skippedLogoUrls: string[];
};

export function isLikelyLogoBanner(imageUrl: string, dimensions: WebsiteImageDimensions = {}) {
  try {
    const parsed = new URL(imageUrl);
    const asset = decodeURIComponent(`${parsed.pathname}${parsed.search}`).toLowerCase();
    if (LOGO_ASSET_PATTERN.test(asset) || MONOCHROME_NAME_PATTERN.test(asset)) {
      return true;
    }

    const width = Number(dimensions.width);
    const height = Number(dimensions.height);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      const ratio = width / height;
      if (ratio >= 2.8 && height <= 520) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

export type WebsiteImagePickResult = {
  imageUrl: string | null;
  width: number | null;
  height: number | null;
  source: string | null;
  candidateIndex: number;
  totalCandidates: number;
  hasMore: boolean;
  skippedLogoUrls: string[];
};

export function usableWebsiteImageCandidates(candidates: WebsiteImageCandidate[]) {
  const skippedLogoUrls: string[] = [];
  const usable: WebsiteImageCandidate[] = [];
  for (const candidate of candidates) {
    if (isLikelyLogoBanner(candidate.url, candidate)) {
      skippedLogoUrls.push(candidate.url);
      continue;
    }
    usable.push(candidate);
  }
  return { usable, skippedLogoUrls };
}

export function pickWebsiteImageCandidate(
  html: string,
  websiteUrl: string,
  afterUrl?: string | null,
): WebsiteImagePickResult {
  const candidates = collectWebsiteImageCandidates(html, websiteUrl);
  const { usable, skippedLogoUrls } = usableWebsiteImageCandidates(candidates);
  if (!usable.length) {
    const fallback = candidates[0];
    return {
      imageUrl: fallback?.url ?? null,
      width: fallback?.width ?? null,
      height: fallback?.height ?? null,
      source: fallback?.source ?? null,
      candidateIndex: -1,
      totalCandidates: 0,
      hasMore: false,
      skippedLogoUrls,
    };
  }

  const normalizedAfter = afterUrl ? normalizeImageUrl(afterUrl, websiteUrl) : null;
  let startIndex = 0;
  if (normalizedAfter) {
    const currentIndex = usable.findIndex((candidate) => candidate.url === normalizedAfter);
    startIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
  }

  if (startIndex >= usable.length) {
    return {
      imageUrl: null,
      width: null,
      height: null,
      source: null,
      candidateIndex: usable.length,
      totalCandidates: usable.length,
      hasMore: false,
      skippedLogoUrls,
    };
  }

  const picked = usable[startIndex];
  return {
    imageUrl: picked.url,
    width: picked.width ?? null,
    height: picked.height ?? null,
    source: picked.source,
    candidateIndex: startIndex,
    totalCandidates: usable.length,
    hasMore: startIndex < usable.length - 1,
    skippedLogoUrls,
  };
}

export function extractWebsiteImageFromHtml(html: string, websiteUrl: string): WebsiteImageScrapeResult {
  const pick = pickWebsiteImageCandidate(html, websiteUrl);
  if (pick.imageUrl && pick.candidateIndex >= 0) {
    return {
      imageUrl: pick.imageUrl,
      width: pick.width,
      height: pick.height,
      skippedAsLogoBanner: false,
      skipReason: null,
      skippedLogoUrls: pick.skippedLogoUrls,
    };
  }

  if (pick.skippedLogoUrls.length > 0) {
    const firstSkipped = pick.skippedLogoUrls[0];
    const candidate = collectWebsiteImageCandidates(html, websiteUrl).find((item) => item.url === firstSkipped);
    return {
      imageUrl: firstSkipped,
      width: candidate?.width ?? null,
      height: candidate?.height ?? null,
      skippedAsLogoBanner: true,
      skipReason: "logo_banner",
      skippedLogoUrls: pick.skippedLogoUrls,
    };
  }

  return {
    imageUrl: null,
    width: null,
    height: null,
    skippedAsLogoBanner: false,
    skipReason: null,
    skippedLogoUrls: pick.skippedLogoUrls,
  };
}

export function collectWebsiteImageCandidates(html: string, websiteUrl: string): ImageCandidate[] {
  const seen = new Set<string>();
  const candidates: ImageCandidate[] = [];

  const pushCandidate = (rawUrl: string | null, source: string, dimensions: WebsiteImageDimensions = {}) => {
    const url = normalizeImageUrl(rawUrl, websiteUrl);
    if (!url || seen.has(url) || isUnlikelyPhotoAsset(url)) return;
    seen.add(url);
    const fromUrl = dimensionsFromUrl(url);
    candidates.push({
      url,
      source,
      width: dimensions.width ?? fromUrl.width ?? null,
      height: dimensions.height ?? fromUrl.height ?? null,
    });
  };

  for (const match of html.matchAll(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/gi)) {
    pushCandidate(match[1], "og:image", readNearbyOgDimensions(html, match.index ?? 0));
  }
  for (const match of html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["'][^>]*>/gi)) {
    pushCandidate(match[1], "og:image", readNearbyOgDimensions(html, match.index ?? 0));
  }
  for (const match of html.matchAll(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/gi)) {
    pushCandidate(match[1], "twitter:image");
  }
  for (const match of html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["'][^>]*>/gi)) {
    pushCandidate(match[1], "twitter:image");
  }
  for (const match of html.matchAll(/<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["'][^>]*>/gi)) {
    pushCandidate(match[1], "itemprop:image");
  }
  for (const match of html.matchAll(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>/gi)) {
    pushCandidate(match[1], "link:image_src");
  }
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src = readTagAttribute(tag, "src")
      ?? readTagAttribute(tag, "data-src")
      ?? readTagAttribute(tag, "data-lazy-src")
      ?? pickSrcsetUrl(readTagAttribute(tag, "srcset"));
    if (!src) continue;
    const width = parseDimension(readTagAttribute(tag, "width"));
    const height = parseDimension(readTagAttribute(tag, "height"));
    if (width !== null && height !== null && width < 220 && height < 220) continue;
    pushCandidate(src, "img", { width, height });
  }
  for (const imageUrl of collectJsonLdImageUrls(html)) {
    pushCandidate(imageUrl, "json-ld:image");
  }

  return candidates;
}

function readNearbyOgDimensions(html: string, index: number) {
  const slice = html.slice(index, index + 500);
  return {
    width: parseDimension(readMetaContent(slice, /property=["']og:image:width["'][^>]+content=["'](\d+)["']/i)
      ?? readMetaContent(slice, /content=["'](\d+)["'][^>]+property=["']og:image:width["']/i)),
    height: parseDimension(readMetaContent(slice, /property=["']og:image:height["'][^>]+content=["'](\d+)["']/i)
      ?? readMetaContent(slice, /content=["'](\d+)["'][^>]+property=["']og:image:height["']/i)),
  };
}

function readMetaContent(html: string, pattern: RegExp) {
  return html.match(pattern)?.[1]?.trim() ?? null;
}

function readTagAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"));
  return match?.[1]?.trim() ?? null;
}

function pickSrcsetUrl(srcset: string | null) {
  if (!srcset) return null;
  const entries = srcset
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [url, descriptor] = entry.split(/\s+/, 2);
      const width = Number.parseInt(descriptor?.replace(/w$/i, "") ?? "", 10);
      return { url, width: Number.isFinite(width) ? width : 0 };
    })
    .sort((left, right) => right.width - left.width);
  return entries[0]?.url ?? null;
}

function collectJsonLdImageUrls(html: string) {
  const urls: string[] = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const payload = JSON.parse(match[1]) as unknown;
      urls.push(...extractJsonLdImages(payload));
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }
  return urls;
}

function extractJsonLdImages(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => extractJsonLdImages(entry));
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const direct = record.image ?? record.photo ?? record.thumbnailUrl;
  if (direct) return extractJsonLdImages(direct);
  if (typeof record.url === "string" && (record["@type"] === "ImageObject" || record.contentUrl)) {
    return [record.url];
  }
  if (typeof record.contentUrl === "string") return [record.contentUrl];
  if (record["@graph"]) return extractJsonLdImages(record["@graph"]);
  return [];
}

function isUnlikelyPhotoAsset(url: string) {
  return /\.(?:svg|ico)(?:$|[?#])/i.test(url) || url.startsWith("data:");
}

function dimensionsFromUrl(url: string): WebsiteImageDimensions {
  try {
    const parsed = new URL(url);
    const width = parseDimension(parsed.searchParams.get("w") ?? parsed.searchParams.get("width"));
    const height = parseDimension(parsed.searchParams.get("h") ?? parsed.searchParams.get("height"));
    return { width, height };
  } catch {
    return { width: null, height: null };
  }
}

function parseDimension(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeImageUrl(rawValue: string | null, websiteUrl: string) {
  if (!rawValue) return null;
  let imageUrl = rawValue.trim();
  if (!imageUrl) return null;

  if (imageUrl.startsWith("//")) {
    imageUrl = `https:${imageUrl}`;
  } else if (imageUrl.startsWith("/")) {
    imageUrl = `${new URL(websiteUrl).origin}${imageUrl}`;
  }

  if (imageUrl.startsWith("http://")) {
    imageUrl = `https://${imageUrl.slice("http://".length)}`;
  }

  if (!imageUrl.startsWith("https://")) {
    return null;
  }

  return imageUrl;
}
