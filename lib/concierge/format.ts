import type { Locale } from './contracts.ts';

export function formatChatTimestamp(timestamp?: number | string, lang: Locale = 'sv'): string | null {
  if (!timestamp) return null;
  const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
  if (isNaN(date.getTime())) {
    return typeof timestamp === 'string' ? timestamp : null;
  }
  return date.toLocaleTimeString(lang === 'sv' ? 'sv-SE' : 'en-GB', {
    timeZone: 'Europe/Stockholm',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatChatTimestampTooltip(timestamp?: number | string, lang: Locale = 'sv'): string | undefined {
  if (!timestamp) return undefined;
  const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
  if (isNaN(date.getTime())) return undefined;
  return date.toLocaleString(lang === 'sv' ? 'sv-SE' : 'en-GB', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
