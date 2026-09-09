import { DurableObject } from 'cloudflare:workers';
import { nextDailyBudget, parseAiGateRequest } from '../lib/concierge/rate-gate.ts';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(body, status = 200) {
  return Response.json(body, { status, headers: JSON_HEADERS });
}

export class ConciergeDailyBudget extends DurableObject {
  async consume(units) {
    const today = new Date().toISOString().slice(0, 10);
    const configuredLimit = Number(this.env.CONCIERGE_DAILY_AI_UNIT_LIMIT);
    const dailyLimit = Number.isInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 200;
    return this.ctx.storage.transaction(async (txn) => {
      const storedDay = await txn.get('day');
      const storedUsed = await txn.get('used');
      const decision = nextDailyBudget(storedDay, storedUsed, today, units, dailyLimit);
      if (storedDay !== decision.day) await txn.put('day', decision.day);
      if (decision.allowed || storedDay !== decision.day) await txn.put('used', decision.used);
      return decision;
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'motkarta-concierge-ai-gate' });
    }
    if (request.method !== 'POST' || url.pathname !== '/limit') return json({ success: false, reason: 'not_found' }, 404);

    let input;
    try { input = parseAiGateRequest(await request.json()); }
    catch { return json({ success: false, reason: 'invalid_request' }, 400); }

    let clientDecision;
    try { clientDecision = await env.CONCIERGE_CLIENT_LIMITER.limit({ key: input.key }); }
    catch { return json({ success: false, reason: 'client_limiter_unavailable' }, 503); }
    if (!clientDecision.success) return json({ success: false, reason: 'client_rate_limit' }, 429);

    try {
      const id = env.CONCIERGE_DAILY_BUDGET.idFromName('global-v1');
      const budget = await env.CONCIERGE_DAILY_BUDGET.get(id).consume(input.units);
      return json({ success: budget.allowed, reason: budget.allowed ? 'allowed' : 'daily_budget_exhausted', remaining: budget.remaining }, budget.allowed ? 200 : 429);
    } catch {
      return json({ success: false, reason: 'daily_budget_unavailable' }, 503);
    }
  },
};
