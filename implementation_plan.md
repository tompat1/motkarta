# D1 Rows-Read Limit Mitigation Plan

## Context

Cloudflare D1 is returning rows-read limit errors for the production account until
2026-09-05 00:00:00 UTC. The public app currently tries `/api/places` before the
static dataset. `/api/places` loads all establishments, evidence rows and tags
from D1, and joins the latest rating and engagement snapshots through correlated
subqueries.

Cloudflare began enforcing free-tier daily D1 read/write limits on 2026-09-01.
Once the daily row-read limit is hit, D1 binding and REST API queries fail until
midnight UTC reset.

## Proposed Hotfix

1. Make the public client load `public/data/places.json` first.
2. Use `/api/places` only as an optional fallback when static data is missing.
3. Keep admin/editorial routes D1-backed, since those workflows need live review
   state.
4. Add tests for static-first behavior so future changes do not accidentally put
   public traffic back on D1.

This preserves the full 3,961-place public dataset and stops normal page loads
from spending D1 rows-read.

## Durable D1 Optimization

1. Add composite indexes for latest snapshot lookups:
   - `rating_snapshots(establishment_id, captured_at DESC, id DESC)`
   - `engagement_snapshots(establishment_id, window_ended_at DESC, id DESC)`
2. Consider a materialized public-place export or versioned snapshot table for
   `/api/places` if live D1 data must remain public.
3. Review admin dashboard queries separately, especially candidate duplicate
   checks and full candidate aggregation.
4. Increase `/api/places` cache duration if it remains enabled for public traffic.

## Verification

Run:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

No production migration or Cloudflare deployment should be run without explicit
approval.
