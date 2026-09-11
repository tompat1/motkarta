export function isD1QuotaError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    /daily row read limit/i.test(msg) ||
    /exceeded d1's free tier/i.test(msg) ||
    /row read limit/i.test(msg)
  );
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
