export function isD1QuotaError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    /daily row read limit/i.test(msg) ||
    /exceeded d1's free tier/i.test(msg) ||
    /row read limit/i.test(msg)
  );
}

export function isD1OverloadError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    /d1 db is overloaded/i.test(msg) ||
    /too many resources consumed/i.test(msg) ||
    /10 second window/i.test(msg) ||
    /sqlite_busy/i.test(msg) ||
    /database is locked/i.test(msg)
  );
}

export async function fetchWithD1Retry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: { maxRetries?: number; retryDelayMs?: number } = {},
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 1;
  const retryDelayMs = options.retryDelayMs ?? 2200;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(input, init);
    lastResponse = response;
    if (response.status !== 503 || attempt === maxRetries) {
      return response;
    }
    const clone = response.clone();
    const body = (await clone.json().catch(() => ({}))) as { overloaded?: boolean; error?: string };
    if (!body.overloaded && !isD1OverloadError(body.error)) {
      return response;
    }
    const retryAfterSec = Number(response.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
      ? Math.min(5000, retryAfterSec * 1000)
      : retryDelayMs + attempt * 800;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  return lastResponse as Response;
}

export function getNextMidnightUtc(): number {
  const now = new Date();
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
}

/**
 * Formats a timestamp (defaulting to the next midnight UTC reset) into European 24-hour
 * time for Stockholm and Gdańsk (Europe/Stockholm / Europe/Warsaw, Central European Time: CET/CEST).
 *
 * Examples:
 * - Summer (CEST): "02:00 CEST (Stockholm/Gdańsk)" or in Swedish: "kl. 02:00 CEST (Stockholm/Gdańsk)"
 * - Winter (CET): "01:00 CET (Stockholm/Gdańsk)" or in Swedish: "kl. 01:00 CET (Stockholm/Gdańsk)"
 */
export function formatEuropeanResetTime(
  timestamp?: number | Date,
  lang: "sv" | "en" = "sv",
): string {
  const date =
    timestamp instanceof Date
      ? timestamp
      : typeof timestamp === "number"
        ? new Date(timestamp)
        : new Date(getNextMidnightUtc());

  const timeStr = date.toLocaleTimeString("sv-SE", {
    timeZone: "Europe/Stockholm",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const tzPart =
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Stockholm",
      timeZoneName: "short",
    })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")?.value || "CET";

  if (lang === "sv") {
    return `kl. ${timeStr} ${tzPart} (Stockholm/Gdańsk)`;
  }
  return `${timeStr} ${tzPart} (Stockholm/Gdańsk)`;
}

/**
 * Converts American / UTC midnight references in error strings to European 24-hour time format.
 * E.g.: "...wait until tomorrow (midnight UTC) to continue."
 *    -> "...wait until tomorrow (kl. 02:00 CEST (Stockholm/Gdańsk)) to continue."
 */
export function localizeD1QuotaMessage(
  message?: string | null,
  lang: "sv" | "en" = "sv",
  timestamp?: number | Date,
): string {
  if (!message) return "";
  const resetTime = formatEuropeanResetTime(timestamp, lang);
  return message
    .replace(/\(midnight UTC\)/gi, `(${resetTime})`)
    .replace(/midnight UTC/gi, resetTime)
    .replace(/midnatt UTC/gi, resetTime);
}
