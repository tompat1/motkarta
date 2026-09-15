# MOTKARTA Mobile View Architecture & Layout Guidelines

> Canonical reference for mobile viewport UX, controls layout, search responsiveness, and filter architecture across screen sizes (320px – 768px).

---

## 1. Overview & Screen Real Estate Philosophy

On mobile devices, vertical screen real estate is the most constrained resource. In MOTKARTA's map-first experience, the map canvas and exploration space must dominate the viewport, while critical discovery tools (search, AI Concierge, filters, device sync) remain reachable with one thumb.

### Key Breakpoints
- **Mobile compact:** 320px – 380px (iPhone SE, small Androids)
- **Mobile standard:** 381px – 430px (iPhone 12/13/14/15/16, Pixel, Samsung Galaxy S series)
- **Mobile wide / Phablet:** 431px – 768px (iPhone Plus/Max, mini tablets)
- **Desktop breakpoint:** > 768px

---

## 2. Top Controls & Filter Carousel Architecture

### Single-Row Consolidated Bar (`.mobile-controls-scroll`)
Prior to consolidation, the top mobile bar occupied ~160px of vertical space due to multi-row wrapping of action buttons and filter pills. It is now consolidated into a **single 48px sticky row**:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [ FILTER (2) ]  [ 📱 SYNKA ]  │  (Alla ställen)  (★ Sparade)  (⚡ Senast)  (Kafé) │ ──> (scroll)
└──────────────────────────────────────────────────────────────────────────────────┘
```

#### Layout Hierarchy
1. **Action Group (`.mobile-filter-actions`)**:
   - `[ FILTER ]` (`.quick-filter-pill`): Opens the comprehensive bottom sheet filter modal. Displays a circular badge with active filter count when filters are applied.
   - `[ SYNKA ENHETER ]` (`.quick-filter-pill`): Opens zero-login QR code sync modal.
2. **Divider (`.mobile-controls-divider`)**:
   - Subtle vertical divider (1px, `var(--color-stone)`) separating modal triggers from quick filter toggles.
3. **Establishment Quick-Filter Pills (`.mobile-type-filters`)**:
   - Horizontally scrollable carousel of the 7 core establishment types:
     1. `All places` (`Alla ställen`)
     2. `Saved ★` (`Sparade ★`)
     3. `⚡ Latest added` (`⚡ Senast tillagda`)
     4. `Restaurant` (`Restaurang`)
     5. `Bakery` (`Bageri`)
     6. `Café` (`Kafé`)
     7. `Specialty coffee` (`Specialkaffe`)
   - Highlights active selection with solid Ink fill and Paper text.

#### CSS Specifications
- Container: `.mobile-controls-scroll` with `overflow-x: auto`, `overflow-y: hidden`, `white-space: nowrap`, and `-webkit-overflow-scrolling: touch`.
- Scrollbars: Hidden via `scrollbar-width: none` and `::-webkit-scrollbar { display: none }`.
- Height: Fixed to 48px to guarantee predictable map and list viewport heights.

---

## 3. Comprehensive Mobile Filter Bottom Sheet (`MobileFilterBottomSheet.tsx`)

While the quick carousel provides rapid access to primary establishment filters, the full filter sheet accommodates deep discovery:

### Sheet Structure
- **Handle & Header**: Drag handle indicator, title (`Filter`), active count readout, and dismiss button (`✕`).
- **Section 1: Establishment Types (`.filter-sheet-type-grid`)**:
   - 2-column grid of all 7 establishment options with icons (Phosphor icons matching desktop) and selection checkmarks.
   - State is 100% bidirectional with the top carousel pills.
- **Section 2: Cuisines (`.filter-sheet-grid.cuisine-grid`)**:
   - Full catalog of curated cuisines with multi-select support.
- **Sticky Footer Action Bar (`.filter-sheet-actions`)**:
   - `Clear all` (`Rensa alla`) secondary button.
   - `Show [N] places` (`Visa [N] ställen`) primary submit button.

---

## 4. Search Input Layout & Mobile Width Rules

### The CSS Grid Max-Content Pitfall
In CSS Grid, child tracks with implicit or `auto` widths default to `min-content` or `max-content`. When an input container (`.search-container-relative`) uses `display: grid;` without an explicit track definition:
- The `<input>` element has an intrinsic browser width (~191px from default `size="20"`).
- The `.unified-search-ai-btn` has fixed text and padding (~157px).
- Summing icons, gaps, and borders pushed the container to **408px**, overflowing standard 390px viewports (e.g. iPhone 12 Pro) by over 40px and clipping the right border and button.

### Mandatory CSS Sizing Rules for Search Elements
To prevent viewport overflow across all mobile screens:

```css
/* 1. Force the grid track to respect container boundaries */
.search-container-relative {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

/* 2. Constrain the input wrapper to border-box within the track */
.countermap-concierge-panel .unified-search-input-wrapper {
  border: 2px solid var(--color-ink);
  min-height: 48px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 6px 8px 6px 12px;
  gap: 8px;
}

/* 3. Allow input flex item to shrink below intrinsic placeholder size */
.countermap-concierge-panel .unified-search-input-wrapper input {
  min-width: 0;
  width: 100%;
  flex: 1 1 0%;
  font-size: 16px; /* Prevents iOS Safari auto-zoom on focus */
}

/* 4. Compact button padding on mobile to preserve input typing room */
.countermap-concierge-panel .unified-search-ai-btn {
  padding-inline: 10px;
  font-size: 11px;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}

/* 5. Ultra-compact screens (<= 380px, e.g. iPhone SE) */
@media (max-width: 380px) {
  .countermap-concierge-panel .unified-search-ai-btn {
    flex: 0 0 44px;
    width: 44px;
    padding: 0;
    justify-content: center;
  }
  .countermap-concierge-panel .unified-search-ai-btn span {
    display: none; /* Icon-only Sparkle button */
  }
}
```

---

## 5. Viewport Verification & Testing

Every change touching mobile viewports must be verified against the following test suites:

1. **E2E Mobile Full Flows**:
   ```bash
   npx playwright test tests_e2e/mobile-full-flows.spec.ts --project=mobile-chrome --project=mobile-safari
   ```
   Validates search input typing, clearing, bottom sheet toggle, quick filters, and QR sync modal.

2. **E2E Mobile Controls & Sheet**:
   ```bash
   npx playwright test tests_e2e/mobile-controls.spec.ts
   ```
   Validates result counter bar, `[ VISA ]` sheet, `[ SORTERA ]` sheet, and map/list view toggle.

3. **Combined Test Gate**:
   ```bash
   npm run test:gate
   ```
   Ensures typechecking, unit tests, Python models, and all desktop/mobile Playwright projects pass with zero regressions.
