/** Display-only venue pricing. Never feeds quality or ranking scores. */
export function priceDisplay(value?: string): { symbol: string; amount?: string } | null {
  const raw = value?.trim() ?? '';
  if (/^\${1,4}$/.test(raw)) return { symbol: raw };
  const match = raw.match(/^(\d{2,4})(?:\s*[-–]\s*(\d{2,4}))?(?:\s*(?:SEK|kr))?$/i);
  if (!match) return null;
  const low = Number(match[1]), high = Number(match[2] ?? match[1]);
  if (low <= 0 || high < low) return null;
  const average = (low + high) / 2;
  const tier = average < 150 ? 1 : average <= 350 ? 2 : average <= 750 ? 3 : 4;
  return { symbol: '$'.repeat(tier), amount: `${raw.replace(/\s*(?:SEK|kr)$/i, '')} SEK` };
}
