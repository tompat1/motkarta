# App.tsx decomposition plan

Status: approved and first decomposition pass implemented.

## Goal

Reduce `src/App.tsx` from a 6,991-line monolithic root into smaller, named modules without changing ranking, recommendation-event collection, admin review behavior, map behavior, or visible UI.

## Initial findings

- `src/App.tsx` currently owns public app layout, admin layout, Leaflet map code, admin review and ML dashboard UI, concierge answer UI, media drawers/lightbox, curated source UI, translations, ranking/filter helpers, recommendation telemetry helpers, and place sanitization.
- `src/components/MobilePlaceCardList.tsx` and `src/components/PlaceDetailSheet.tsx` import utility functions back from `../App`, which makes `App.tsx` a dependency hub.
- `lib/mobile-filters.ts` already contains `formatDistance` and `distanceFromPoint`, duplicating exports from `App.tsx`.
- ML/recommendation instrumentation is documented as living in `src/App.tsx`; moving it requires keeping the documented privacy and shadow-mode boundaries explicit.

## Proposed module split

1. Move pure app constants, language types, translations, and labels into:
   - `src/app/config.ts`
   - `src/app/i18n.ts`
   - `src/app/place-formatting.ts`

2. Move public filtering/ranking helpers into:
   - `src/app/place-ranking.ts`
   - `src/app/place-sanitization.ts`

3. Move recommendation-event UI instrumentation into:
   - `src/app/recommendation-events.ts`
   - Keep event shape, idempotency, rotation, batching, result positions, and `RECOMMENDATION_SCORER_VERSION` unchanged.
   - Update ML docs that currently point only to `src/App.tsx`.

4. Move large public UI sections into focused components:
   - `src/components/ConciergeAnswerView.tsx`
   - `src/components/ConciergeSuperpowerModal.tsx`
   - `src/components/CuratedSourcesPanel.tsx`
   - `src/components/LazyPlaceMediaDrawer.tsx`
   - `src/components/ImageLightboxModal.tsx`
   - `src/components/FoodMap.tsx`
   - `src/components/SelectedPlaceMapCard.tsx`
   - `src/components/PublicTopbar.tsx`
   - `src/components/SearchAndFilterControls.tsx`
   - `src/components/ResultsPanel.tsx`
   - `src/components/ConciergeSection.tsx`
   - `src/components/MethodSection.tsx`

5. Move admin UI into:
   - `src/admin/types.ts`
   - `src/admin/admin-formatting.tsx`
   - `src/admin/AdminApp.tsx`
   - `src/admin/AdminReviewPanel.tsx`
   - `src/admin/AdminCoveragePanel.tsx`
   - `src/admin/AdminMlDashboard.tsx`

6. Keep `src/App.tsx` as orchestration only:
   - top-level state
   - data loading
   - event wiring
   - public/admin route switch
   - component composition

## Compatibility notes

- Update components currently importing from `../App` to import `Language` and distance helpers from stable modules.
- Preserve existing exports that tests or server functions use, or provide temporary re-exports from `src/App.tsx` for a low-risk first pass.
- Do not change scoring formulas, hidden-gem gates, candidate review actions, event payloads, idempotency keys, privacy versions, or batch limits.

## Verification

Run:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

If ML/recommendation event files move, also verify the affected ML docs still identify the implementation location and unchanged shadow-mode boundaries.

## Risks

- Circular imports are likely if shared types stay in `App.tsx`; shared exports should move before UI components.
- Leaflet map code uses browser globals and should remain client-only.
- Recommendation event instrumentation has privacy and data-contract constraints; this must be a pure relocation unless separately approved.
- Admin review and ML dashboard code contains hidden-gem/evidence-gate language; moving it should not alter lifecycle decisions or labels.

## Requested approval

Approved by Thomas. The first implementation pass prioritized behavior-preserving extraction and left deeper state-management changes for a separate follow-up.

## First pass result

- `src/App.tsx` was reduced from 6,991 lines to roughly 2,250 lines.
- Public UI sections moved into focused components for Concierge answers, Concierge superpower forms, curated sources, external map links, media drawers, verification details and Leaflet map rendering.
- Admin review, admin coverage and admin ML dashboard surfaces moved into `src/admin/`.
- Frontend recommendation telemetry helpers moved into `src/ml/recommendationInstrumentation.ts`.
- Place sanitization, specialty-coffee promotion/exclusion rules, translations, filters, labels and ranking helpers moved into `src/app/`.
- Existing imports from `App.tsx` were redirected to stable shared modules.
