export type VenueOperationalStatus =
  | "open"
  | "temporarily_closed"
  | "permanently_closed"
  | "website_down"
  | "unknown";

export type VenueStatusSignal = {
  source: "website" | "osm" | "google_places";
  status: VenueOperationalStatus;
  detail: string;
};

export type VenueStatusCheckResult = {
  id: number;
  status: VenueOperationalStatus;
  checkedAt: string;
  summary: string;
  signals: VenueStatusSignal[];
};

const PERMANENT_CLOSURE_PATTERNS: Array<{ phrase: string; regex: RegExp }> = [
  { phrase: "vi har stängt för gott", regex: /\b(vi\s+har|har\s+vi)\s+stängt\s+för\s+gott\b/i },
  { phrase: "permanent stängt", regex: /\bpermanent\s+stäng[td]\b/i },
  { phrase: "har nu stängt", regex: /\bhar\s+nu\s+stängt\b/i },
  { phrase: "vi har tyvärr stängt", regex: /\bvi\s+har\s+tyvärr\s+stängt\b/i },
  { phrase: "tack för dessa år", regex: /\btack\s+för\s+(dessa|alla)\s+år\b/i },
  { phrase: "permanently closed", regex: /\bpermanently\s+closed\b/i },
  { phrase: "closed our doors", regex: /\bclosed\s+our\s+doors\b/i },
  { phrase: "nu stänger vi för gott", regex: /\bnu\s+stänger\s+vi\s+för\s+gott\b/i },
];

const TEMPORARY_CLOSURE_PATTERNS: Array<{ phrase: string; regex: RegExp }> = [
  { phrase: "tillfälligt stängt", regex: /\btillfälligt\s+stäng[td]\b/i },
  { phrase: "temporarily closed", regex: /\btemporarily\s+closed\b/i },
  { phrase: "stängt för renovering", regex: /\bstäng[td]\s+för\s+renovering\b/i },
  { phrase: "closed for renovation", regex: /\bclosed\s+for\s+renovation\b/i },
  { phrase: "semesterstängt", regex: /\bsemesterstäng[td]\b/i },
];

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectClosureTextInHtml(html: string): {
  status: "permanently_closed" | "temporarily_closed" | null;
  matchedPhrase: string | null;
} {
  const text = stripHtmlToText(html);
  if (!text) return { status: null, matchedPhrase: null };

  for (const { phrase, regex } of PERMANENT_CLOSURE_PATTERNS) {
    if (regex.test(text)) {
      return { status: "permanently_closed", matchedPhrase: phrase };
    }
  }
  for (const { phrase, regex } of TEMPORARY_CLOSURE_PATTERNS) {
    if (regex.test(text)) {
      return { status: "temporarily_closed", matchedPhrase: phrase };
    }
  }
  return { status: null, matchedPhrase: null };
}

export function isSafePublicHttpUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.|\[::1\]|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function interpretOsmTags(
  tags: Record<string, string> | null | undefined,
  found: boolean,
): VenueStatusSignal {
  if (!found) {
    return {
      source: "osm",
      status: "unknown",
      detail: "OSM element not found (may have been removed or replaced)",
    };
  }
  const safeTags = tags ?? {};
  const closedKey = Object.keys(safeTags).find((key) =>
    /^(disused|was|closed|abandoned):(amenity|shop|craft|tourism)$/i.test(key),
  );
  if (closedKey) {
    return {
      source: "osm",
      status: "permanently_closed",
      detail: `OSM tagged ${closedKey}=${safeTags[closedKey]}`,
    };
  }
  if (safeTags.amenity || safeTags.shop || safeTags.craft || safeTags.name) {
    return {
      source: "osm",
      status: "open",
      detail: `OSM active (${safeTags.amenity || safeTags.shop || safeTags.craft || "listed"})`,
    };
  }
  return {
    source: "osm",
    status: "unknown",
    detail: "OSM element has no active venue tags",
  };
}

export function interpretGoogleBusinessStatus(
  businessStatus: string | null | undefined,
): VenueStatusSignal | null {
  if (!businessStatus) return null;
  if (businessStatus === "OPERATIONAL") {
    return { source: "google_places", status: "open", detail: "Google Places: OPERATIONAL" };
  }
  if (businessStatus === "CLOSED_TEMPORARILY") {
    return { source: "google_places", status: "temporarily_closed", detail: "Google Places: CLOSED_TEMPORARILY" };
  }
  if (businessStatus === "CLOSED_PERMANENTLY") {
    return { source: "google_places", status: "permanently_closed", detail: "Google Places: CLOSED_PERMANENTLY" };
  }
  return null;
}

export function combineVenueStatusSignals(signals: VenueStatusSignal[]): {
  status: VenueOperationalStatus;
  summary: string;
} {
  if (signals.length === 0) {
    return { status: "unknown", summary: "No live signals available (missing website and OSM ID)" };
  }

  const summary = signals.map((s) => s.detail).join(" · ");

  if (signals.some((s) => s.status === "permanently_closed")) {
    return { status: "permanently_closed", summary };
  }
  if (signals.some((s) => s.status === "temporarily_closed")) {
    return { status: "temporarily_closed", summary };
  }
  if (signals.some((s) => s.status === "open")) {
    return { status: "open", summary };
  }
  if (signals.some((s) => s.status === "website_down")) {
    return { status: "website_down", summary };
  }
  return { status: "unknown", summary };
}
