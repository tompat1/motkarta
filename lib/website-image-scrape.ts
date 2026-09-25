const OG_IMAGE_PATTERNS = [
  /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
  /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
  /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i,
  /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
];

export function extractWebsiteImageUrl(html: string, websiteUrl: string) {
  for (const pattern of OG_IMAGE_PATTERNS) {
    const match = html.match(pattern);
    const candidate = normalizeImageUrl(match?.[1] ?? "", websiteUrl);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

export function normalizeImageUrl(rawUrl: string, websiteUrl: string) {
  let imgUrl = rawUrl.trim();
  if (!imgUrl) {
    return null;
  }

  if (imgUrl.startsWith("//")) {
    imgUrl = `https:${imgUrl}`;
  } else if (imgUrl.startsWith("/")) {
    const parsed = new URL(websiteUrl);
    imgUrl = `${parsed.origin}${imgUrl}`;
  }

  if (imgUrl.startsWith("http://")) {
    imgUrl = `https://${imgUrl.slice("http://".length)}`;
  }

  if (!imgUrl.startsWith("https://")) {
    return null;
  }

  return imgUrl;
}

export async function fetchWebsiteImageUrl(websiteUrl: string) {
  try {
    const response = await fetch(websiteUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "Mozilla/5.0 (compatible; MotkartaBot/1.0; +https://motkarta.rynell.org/bot)",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return { imageUrl: null, fetchStatus: response.status };
    }

    const html = await response.text();
    return {
      imageUrl: extractWebsiteImageUrl(html, websiteUrl),
      fetchStatus: response.status,
    };
  } catch (error) {
    return {
      imageUrl: null,
      fetchStatus: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
