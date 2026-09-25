const LOGO_ASSET_PATTERN =
  /(?:^|[\W_])(logos?|loggo|favicon|icons?|pixel|placeholder|tracking|wordmark|brandmark|social[-_]?share)(?:$|[\W_])/i;

const MONOCHROME_NAME_PATTERN = /(?:^|[\W_])(black|white|invert|mono)(?:$|[\W_])/i;

type WebsiteImageDimensions = {
  width?: number | null;
  height?: number | null;
};

export type WebsiteImageScrapeResult = {
  imageUrl: string | null;
  width: number | null;
  height: number | null;
  skippedAsLogoBanner: boolean;
  skipReason: string | null;
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

export function extractWebsiteImageFromHtml(html: string, websiteUrl: string): WebsiteImageScrapeResult {
  const metaContent = (pattern: RegExp) => {
    const match = html.match(pattern);
    return match?.[1]?.trim() ?? null;
  };

  const rawImageUrl =
    metaContent(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ??
    metaContent(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i) ??
    metaContent(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i) ??
    metaContent(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i) ??
    metaContent(/<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i) ??
    metaContent(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);

  const width = parseDimension(
    metaContent(/<meta[^>]+property=["']og:image:width["'][^>]+content=["'](\d+)["']/i) ??
      metaContent(/<meta[^>]+content=["'](\d+)["'][^>]+property=["']og:image:width["']/i),
  );
  const height = parseDimension(
    metaContent(/<meta[^>]+property=["']og:image:height["'][^>]+content=["'](\d+)["']/i) ??
      metaContent(/<meta[^>]+content=["'](\d+)["'][^>]+property=["']og:image:height["']/i),
  );

  const imageUrl = normalizeImageUrl(rawImageUrl, websiteUrl);
  if (!imageUrl) {
    return { imageUrl: null, width, height, skippedAsLogoBanner: false, skipReason: null };
  }

  if (isLikelyLogoBanner(imageUrl, { width, height })) {
    return {
      imageUrl,
      width,
      height,
      skippedAsLogoBanner: true,
      skipReason: "logo_banner",
    };
  }

  return { imageUrl, width, height, skippedAsLogoBanner: false, skipReason: null };
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
