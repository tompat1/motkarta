# Product

<!-- impeccable:product-schema 1 -->

> Product facts below are inferred from the repository, the active design system,
> and the 2026-11-19 admin-dashboard brief. They should be revisited if Motkarta's
> internal operating model or team roles change.

## Platform

web

## Users

- Motkarta editors who research, verify, correct, and approve Stockholm food-place records during focused review sessions.
- Motkarta administrators who maintain the data model, resolve duplicate and source conflicts, monitor pipelines, and control higher-risk operations.
- The public consumer audience remains downstream of this internal work: operators are protecting the accuracy, freshness, fairness, and explainability of the public map.

## Product Purpose

Motkarta is Stockholm's independent food map. It gives worthwhile food places a fair chance to be found through inspectable evidence rather than paid placement or an opaque popularity ranking.

The internal Data Management Dashboard turns incoming place records, source evidence, corrections, and operational signals into a trustworthy public catalog. Success means an operator can find the riskiest records, understand why they need attention, take a safe action, and see that the decision was recorded.

## Positioning

Motkarta combines a consumer counter-map with an inspectable editorial data operation: sources, freshness, uncertainty, conflicting facts, duplicate decisions, and derived signals remain visible instead of being flattened into a single unquestioned score.

## Operating Context

- Editors work in a review queue containing candidates, baseline records, verified places, featured places, removed places, and records with missing inputs or unresolved districts.
- Operators compare venue identity, lifecycle state, provenance, source diversity, freshness, missing fields, possible duplicates, and community nominations.
- Review decisions, duplicate resolutions, region corrections, place edits, photo work, label exports, and pipeline checkpoints are persisted through protected admin APIs.
- Administrators also inspect catalog coverage, enrichment failures, recommendation-system health, source guides, and operational runbooks.
- The interface is bilingual in Swedish and English and is used on desktop first, with a responsive narrow-screen fallback.

## Capabilities and Constraints

- Preserve the existing React, TypeScript, Vite, Cloudflare Pages, D1, and Phosphor Icons stack.
- Preserve existing candidate review, evidence gates, duplicate merge/keep-separate decisions, map inspection, place editing, district management, photo management, coverage reporting, label export, pipeline sync, and ML status capabilities.
- The admin surface is protected by a verified server session. Local token authentication is a development fallback.
- Data confidence must be explained through observable evidence inputs; it must not be presented as objective truth or a universal quality score.
- Missing, stale, conflicting, suppressed, and not-applicable data must remain distinguishable.
- Destructive or publication-changing actions require clear labels, permission checks, and recoverable feedback.
- Role language distinguishes editors from administrators, but the current server contract authorizes the administrator role only. Do not imply editor permissions exist until the backend exposes and enforces them.

## Brand Commitments

- The name is MOTKARTA. The product voice is independent, precise, curious, useful, and quietly defiant.
- Preserve the active `DESIGN.md` system: Ink, Paper, White, Mist, Water Blue, and Signal Red; Archivo Condensed, Inter, and IBM Plex Mono; flat surfaces; fine rules; square geometry; evidence dots; and one disruptive red intervention.
- Present factual data, derived signals, community evidence, and editorial opinion as distinct information types.
- Avoid generic SaaS dashboard styling, rounded card grids, gradients, glass effects, rainbow status palettes, star-led ranking, and unsupported claims of objectivity.

## Evidence on Hand

- Brand and product design authority: `DESIGN.md`.
- Admin UI and workflows: `src/App.tsx`, `src/admin/`, `src/styles.css`.
- Authentication and API contracts: `lib/admin-auth.ts`, `functions/api/admin/`.
- Data schema and lifecycle history: `db/schema.ts`, `drizzle/`.
- Operational and recommendation-system documentation: `docs/`, `directives/`, and `docs/ml/`.
- Automated coverage: `tests/admin-*.test.mjs`, `tests_e2e/`, and the repository-wide `npm run test:gate`.
- No external customer testimonials, invented team-size claims, or fabricated production benchmarks are approved evidence.

## Product Principles

1. Put the next defensible action first.
2. Show the evidence, freshness, and uncertainty behind every decision.
3. Make dense comparison fast without hiding important nuance.
4. Keep publication and destructive changes explicit, permission-aware, and auditable.
5. Let the internal data operation strengthen the public product's credibility.

## Accessibility & Inclusion

- Meet WCAG 2.2 AA as the minimum target defined in `DESIGN.md`.
- Every control must work by keyboard, expose a visible focus state, and communicate status without relying on color alone.
- The venue table may scroll locally on narrow screens, but the page must not lose content or function at 200% zoom or 320 CSS px.
- Bilingual labels, long venue names, Swedish diacritics, loading states, errors, empty queues, stale records, and permission-limited states are first-class cases.
