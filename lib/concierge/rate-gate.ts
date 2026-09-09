export type AiGateRequest = { key: string; units: number };

export function parseAiGateRequest(value: unknown): AiGateRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_gate_request');
  const input = value as Record<string, unknown>;
  const key = typeof input.key === 'string' ? input.key.trim() : '';
  const units = Number(input.units);
  if (!key || key.length > 160 || !Number.isInteger(units) || units < 1 || units > 2) throw new Error('invalid_gate_request');
  return { key, units };
}

export function nextDailyBudget(
  storedDay: unknown,
  storedUsed: unknown,
  today: string,
  requestedUnits: number,
  dailyLimit: number,
) {
  const used = storedDay === today && Number.isInteger(storedUsed) && Number(storedUsed) >= 0 ? Number(storedUsed) : 0;
  const allowed = requestedUnits > 0 && used + requestedUnits <= dailyLimit;
  const nextUsed = allowed ? used + requestedUnits : used;
  return { allowed, day: today, used: nextUsed, remaining: Math.max(0, dailyLimit - nextUsed) };
}
