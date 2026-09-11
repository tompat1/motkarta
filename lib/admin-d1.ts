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
