# MOTKARTA Design System

> The single source of truth for MOTKARTA brand, product interface, maps, content, accessibility, motion, and merchandise.

| Field | Value |
| --- | --- |
| Status | Active, v1.0 |
| Updated | 2026-08-13 |
| Brand | MOTKARTA |
| Product descriptor | Stockholms fria matkarta |
| Primary line | Stockholm, bord för bord. |
| Applies to | Web, mobile, editorial, social, presentations, data visualisation, and merchandise |
| Brand deck | `MOTKARTA_Brand_Guide.pptx` |

## 1. How to use this document

This document is normative. If a mockup, prompt, component, campaign, or old design conflicts with it, this document wins unless a newer recorded decision explicitly replaces the relevant rule.

The keywords **must**, **should**, and **may** have specific meanings:

- **Must:** required for brand consistency, usability, or accessibility.
- **Should:** preferred default; exceptions need a clear product reason.
- **May:** optional and context-dependent.

When the system does not cover a case:

1. Reuse the closest existing pattern.
2. Preserve the design principles in section 4.
3. Test accessibility and map legibility.
4. Record the new decision in the changelog before treating it as a standard.

Do not create a parallel source of truth in Figma, code, Notion, or slide decks. Those tools implement this document; they do not supersede it.

---

## 2. Brand foundation

### 2.1 What MOTKARTA is

MOTKARTA is an independent counter-map for discovering Stockholm's food culture. It exists to reveal worthwhile places that opaque ranking systems can underexpose.

“Places” includes:

- Restaurants and neighbourhood kitchens
- Bakeries and pastry shops
- Cafés
- Specialty-coffee bars and roasters
- Food halls, kiosks, and food trucks when the data is verifiable

The interface may use a context-specific noun such as “restaurant” or “specialty coffee,” but the master product should use **place**, **food place**, or **matställe** when referring to the complete dataset.

### 2.2 Name meaning

**MOTKARTA** means “counter-map”: a map made to expose omissions, assumptions, and power structures in a dominant map.

The name is always written as **MOTKARTA** in brand contexts. In running prose, `Motkarta` is acceptable when all caps harms readability.

### 2.3 Purpose, promise, personality

| Element | Definition |
| --- | --- |
| Purpose | Give every worthwhile Stockholm food place a fair chance to be found. |
| Promise | No paid ranking. Clear inclusion logic. Evidence over hype. |
| Personality | Independent, precise, curious, useful, and quietly defiant. |
| Position | A civic tool with cultural taste. |
| Strategic stance | Not anti-Google. Pro-transparency. |

### 2.4 Brand proposition

> The places are already there. The better map is what is missing.

### 2.5 Brand lines

| Role | Swedish | English |
| --- | --- | --- |
| Primary | Stockholm, bord för bord. | Stockholm, table by table. |
| Product descriptor | Stockholms fria matkarta. | Stockholm's independent food map. |
| Transparency | Ingen betald ranking. | No paid ranking. |
| Campaign | Ät utan algoritmen. | Eat beyond the algorithm. |
| Campaign | Inte sponsrat. | Not sponsored. |
| Discovery | Hitta det som inte rankas. | Find what ranking misses. |

Do not translate the brand name.

---

## 3. Truth and fairness language

MOTKARTA must never claim to be perfectly objective or “100% unbiased.” Every dataset and model contains choices. The credible promise is that those choices are inspectable.

### 3.1 Approved claims

- Independent discovery
- No paid ranking or paid placement
- Transparent inclusion and scoring logic
- Multiple independent signals
- Last verified on [date]
- Why this place appears
- Source mix: [number] independent signals
- Popularity is one signal, not the verdict

### 3.2 Claims to avoid

- The best restaurants in Stockholm
- Completely unbiased
- Objective truth
- Hidden gem, unless the evidence and definition are shown
- Locals only
- Undiscovered, unless discovery is measured and the timeframe is stated
- Google deliberately hides this place, unless supported by a reproducible audit

### 3.3 Fact, score, and editorial opinion

The interface must visibly distinguish:

| Type | Examples | Treatment |
| --- | --- | --- |
| Verified fact | Address, cuisine, opening hours, ownership, inspection record | Neutral text; source and freshness available |
| Derived signal | Visibility gap, source diversity, return interest | Label as calculated; explain methodology |
| Community evidence | Correction, nomination, field note | Identify contributor type and verification status |
| Editorial opinion | “Worth crossing town for” | Byline or MOTKARTA editorial label |

Never present a model output as a verified fact.

---

## 4. Design principles

Every design decision should reinforce these principles in order.

1. **Show the method.** Sources, dates, signals, and limitations are visible—not buried in legal copy.
2. **The city is the hero.** Use streets, shorelines, places, façades, and people at work; avoid generic food glamour.
3. **Editorial clarity over app decoration.** Strong hierarchy, flat surfaces, fine rules, and useful whitespace.
4. **One disruption per composition.** Use a signal-red crosshair, slash, or displaced dot to challenge the dominant pattern.
5. **Evidence over popularity.** Star ratings and review counts never dominate a place profile.
6. **Dense data, calm interface.** Progressive disclosure makes complexity understandable without pretending it is simple.
7. **Accessible by default.** Contrast, keyboard use, motion preferences, touch size, and non-colour cues are core brand quality.

### 4.1 The visual tension

MOTKARTA balances two qualities:

- **Civic credibility:** systematic, inspectable, calm, factual
- **Food-culture energy:** bold, urban, current, independent

Avoid both extremes: it must not look like a municipal database or a lifestyle-influencer feed.

---

## 5. Logo system

> Current status: the logo direction is approved conceptually, but final production vectors and trademark clearance are still required.

### 5.1 Logo hierarchy

1. **Primary wordmark:** condensed uppercase `MOTKARTA`
2. **Counter-pin:** an open circular map-pin interrupted by a short diagonal slash
3. **Monogram/application mark:** `M` or the counter-pin, only where the wordmark cannot fit

The wordmark leads in headers, covers, landing pages, and campaign pieces. The counter-pin travels across app icons, favicons, map markers, embroidery, avatars, and compact controls.

### 5.2 Clear space and minimum size

- Keep clear space equal to the width of the wordmark's `M` on all sides.
- Minimum printed wordmark width: **24 mm**.
- Minimum digital wordmark width: **120 px**.
- Minimum printed counter-pin size: **8 mm**.
- Minimum digital counter-pin size: **24 px**; use **32 px** or larger for interactive UI.

### 5.3 Approved colourways

- Ink wordmark on Paper
- Paper wordmark on Ink
- Paper mark on Water Blue
- Ink mark on Signal Red
- Single-colour black or white for production-constrained merch

### 5.4 Prohibited logo use

Do not:

- Stretch, skew, rotate, outline, bevel, shadow, or add gradients
- Place the logo inside an unapproved badge
- Replace letters with food icons
- Use Water Blue and Signal Red across different letters
- Place the wordmark on a visually noisy photograph without a solid field
- use the counter-pin as a generic location marker for every place
- typeset a substitute logo from a different font in production

---

## 6. Colour

### 6.1 Core palette

| Token | Hex | RGB | Role |
| --- | --- | --- | --- |
| `ink` | `#111111` | 17, 17, 17 | Primary text, dark surfaces, map roads |
| `paper` | `#F4F0E7` | 244, 240, 231 | Primary light background |
| `white` | `#FFFDF8` | 255, 253, 248 | Raised light surface; use sparingly |
| `water` | `#326BFF` | 50, 107, 255 | Verified/included, links, Stockholm water |
| `signal` | `#FF4A2F` | 255, 74, 47 | Selection, warning, disruption, primary action |
| `mist` | `#D8D4CB` | 216, 212, 203 | Rules, borders, disabled backgrounds |
| `stone` | `#77746E` | 119, 116, 110 | Secondary text on light backgrounds |
| `charcoal` | `#2B2B2B` | 43, 43, 43 | Secondary dark surface |

### 6.2 Usage ratio

- 70% Ink, Paper, White, Mist, and Stone
- 20% Water Blue
- 10% Signal Red

This is a compositional guide, not a mathematical page requirement.

### 6.3 Semantic colour rules

- **Water Blue** means included, verified, navigable, linked, or water.
- **Signal Red** means currently selected, active intervention, warning, or principal action.
- **Ink/Paper** carry ordinary content.
- Success and error states must include text/icon cues; colour alone is insufficient.
- Do not use blue and red interchangeably merely for variety.

### 6.4 Contrast

Approved high-priority pairs:

- Ink on Paper or White
- Paper or White on Ink
- Ink on Signal
- Paper or White on Water Blue for large/bold text; verify smaller text before use
- Water Blue on Ink for accents and large text

Stone is secondary text only on Paper/White and must not be used below 16 px without a contrast check.

### 6.5 CSS tokens

```css
:root {
  --color-ink: #111111;
  --color-paper: #f4f0e7;
  --color-white: #fffdf8;
  --color-water: #326bff;
  --color-signal: #ff4a2f;
  --color-mist: #d8d4cb;
  --color-stone: #77746e;
  --color-charcoal: #2b2b2b;

  --color-bg: var(--color-paper);
  --color-surface: var(--color-white);
  --color-text: var(--color-ink);
  --color-text-muted: var(--color-stone);
  --color-border: var(--color-mist);
  --color-link: var(--color-water);
  --color-action: var(--color-signal);
  --color-verified: var(--color-water);
  --color-selected: var(--color-signal);
}
```

---

## 7. Typography

### 7.1 Font families

| Role | Brand/print | Web implementation |
| --- | --- | --- |
| Display | Nimbus Sans Narrow Bold | Archivo Condensed 700 |
| Body/UI | Nimbus Sans | Inter 400–700 |
| Data/metadata | Nimbus Mono PS | IBM Plex Mono 400–600 |

Use system fallbacks only while fonts load.

```css
--font-display: "Archivo Condensed", "Arial Narrow", sans-serif;
--font-body: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
```

### 7.2 Type scale

| Token | Desktop | Mobile | Weight | Line height | Use |
| --- | ---: | ---: | ---: | ---: | --- |
| `display-xl` | 96 px | 56 px | 700 | 0.90 | Brand moments only |
| `display-lg` | 72 px | 48 px | 700 | 0.92 | Landing hero |
| `h1` | 56 px | 40 px | 700 | 1.00 | Page title |
| `h2` | 40 px | 32 px | 700 | 1.05 | Major section |
| `h3` | 28 px | 24 px | 700 | 1.15 | Component/section title |
| `body-lg` | 20 px | 19 px | 400 | 1.50 | Introductory copy |
| `body` | 16 px | 16 px | 400 | 1.55 | Default UI and editorial |
| `body-sm` | 14 px | 14 px | 400 | 1.45 | Secondary content |
| `label` | 13 px | 13 px | 600 | 1.25 | Controls and filters |
| `meta` | 12 px | 12 px | 500 | 1.35 | Sources, dates, coordinates |

### 7.3 Typesetting rules

- Display type may use uppercase and tight tracking (`-0.02em` to `-0.04em`).
- Body copy uses sentence case and normal tracking.
- Data labels and short metadata may use uppercase mono with `0.04em` tracking.
- Never set paragraphs in condensed display type.
- Never set long passages in all caps.
- Use tabular numbers for scores, dates, prices, counts, and coordinates.
- Swedish quotation marks: `”…”`; English quotation marks: `“…”`.
- Preserve Swedish letters Å, Ä, and Ö; never transliterate brand-facing Swedish copy.

---

## 8. Layout and spacing

### 8.1 Spacing scale

Use a 4 px base unit and an 8 px primary rhythm.

| Token | Value |
| --- | ---: |
| `space-1` | 4 px |
| `space-2` | 8 px |
| `space-3` | 12 px |
| `space-4` | 16 px |
| `space-5` | 24 px |
| `space-6` | 32 px |
| `space-7` | 48 px |
| `space-8` | 64 px |
| `space-9` | 96 px |
| `space-10` | 128 px |

### 8.2 Grid

| Viewport | Columns | Gutter | Outer margin |
| --- | ---: | ---: | ---: |
| Mobile, 320–767 px | 4 | 16 px | 20 px |
| Tablet, 768–1199 px | 8 | 24 px | 32 px |
| Desktop, 1200 px+ | 12 | 24 px | 48–64 px |

Maximum editorial content width: **1280 px**. Maximum reading width: **720 px** or approximately 70 characters.

### 8.3 Shape language

- Default corner radius: **0 px**.
- Controls may use **2 px** where needed for rendering.
- Use **8 px** only for functional overlays such as mobile sheets or device-native dialogs.
- Cards are not the default composition. Prefer sections separated by space and 1 px rules.
- Shadows are reserved for floating map controls, dialogs, and mobile sheets.

### 8.4 Borders and rules

- Standard divider: 1 px Mist on light surfaces; `#444444` on Ink.
- Emphasis rule: 2 px Ink.
- Brand accent rule: 6–8 px Water or Signal.

---

## 9. Iconography and graphic devices

### 9.1 Icons

- **Icon Library:** Use **Phosphor Icons** (`@phosphor-icons/react`).
- Use simple monoline geometric icons.
- Default stroke: 1.5 px at 24 px; 2 px at 32 px.
- Ends and joins should be square or minimally rounded.
- Icons must work in one colour.
- Key Phosphor Icon set used across MOTKARTA:
  - **Navigation & Map:** `MapPin`, `MapTrifold`, `Compass`, `Crosshair`, `ArrowsOut`, `ArrowsIn`
  - **Search & Filters:** `MagnifyingGlass`, `Sliders`, `Shuffle`, `PlusCircle`
  - **Establishment Categories:** `ForkKnife` (Restaurant), `Bread` (Bakery), `Coffee` (Café & Specialty coffee)
  - **Verification & Signals:** `ShieldCheck`, `Certificate`, `CheckCircle`, `Scales`, `Sparkle`
  - **Actions & External:** `ArrowRight`, `ArrowSquareOut`, `Globe`, `Check`, `CircleNotch`
- Never invent decorative food icons when a text label is clearer.

### 9.2 Evidence marks

Approved graphic devices:

- Blue evidence dot
- Red selection crosshair
- Counter-pin slash
- Street-grid fragment
- Coordinate or timestamp label
- Fine horizontal rule

Use one primary disruptive device per composition. A field of blue evidence dots may support it.

### 9.3 Pattern

The map-grid pattern may appear on campaign graphics and merch. It must be abstract enough not to imply a false geographic location unless based on real map data.

---

## 10. Map design

The map is the primary product surface and must feel unmistakably MOTKARTA without compromising navigation.

### 10.1 Light map

| Feature | Treatment |
| --- | --- |
| Land | Paper |
| Water | Pale Water Blue or `#BFD2FF` |
| Buildings | White or very light Mist |
| Minor roads | `#D1CDC4`, 0.5–1 px |
| Major roads | `#A9A59D`, 1–1.5 px |
| District labels | Ink, condensed uppercase |
| Ordinary verified place | Water Blue dot |
| Selected place | Signal crosshair plus outline/label |

### 10.2 Dark map

| Feature | Treatment |
| --- | --- |
| Land | Ink |
| Water | `#071019` |
| Buildings | `#242424` |
| Minor roads | `#414141` |
| Major roads | `#66635E` |
| Labels | Paper |
| Ordinary verified place | Water Blue dot |
| Selected place | Signal crosshair plus outline/label |

### 10.3 Place markers

- Default dot: 8 px desktop, 10 px mobile.
- Hover/focus target: minimum 24 px visual halo and 44 × 44 px interactive hit area.
- Selected marker: 12 px core plus crosshair/halo; it must differ by shape and not only colour.
- Clusters show a count in mono type and expand progressively.
- Do not use the logo counter-pin for every ordinary venue.
- Marker size must not encode popularity by default. If a data layer uses size, show a legend and explain the metric.

### 10.4 Category differentiation

Do not assign a rainbow of category colours. Use shape or small glyph differences while retaining Water Blue:

| Category | Marker variation |
| --- | --- |
| Restaurant | Circle |
| Bakery | Square |
| Café | Diamond |
| Specialty coffee / roaster | Ring with centre dot |
| Food truck / temporary | Triangle |

Every category filter must include a text label.

### 10.5 Map controls

- Controls sit on solid Ink or Paper surfaces, not translucent glass.
- Desktop controls: 40–44 px high.
- Mobile controls: 48 px minimum.
- Provide visible focus, tooltip/label, and keyboard access.
- The map must offer a synchronized list view.
- Preserve the user's map position when switching between map and list.

### 10.6 Attribution

OpenStreetMap attribution must remain legible and accessible. Never crop, hide, recolour below legibility, or place controls over required attribution.

---

## 11. Core product components

### 11.1 Global header

Desktop:

- Left: wordmark
- Centre/right: `KARTA`, `METOD`, `OM`
- Optional: language and saved places
- 64–72 px high, Paper or Ink background, 1 px lower rule

Mobile:

- Counter-pin or compact wordmark
- Page title where useful
- Search/menu controls
- 56–64 px high

### 11.2 Search

- Prompt: `Vad vill du äta?` or `Sök plats, kök eller område`
- Search may match venue, category, cuisine, neighbourhood, dish, accessibility, or evidence signal.
- Show recent searches and clear history control.
- Group results by type rather than presenting one opaque ranked stream.
- Sponsored results are not permitted.

### 11.3 Filters

Recommended first-level filters:

- Near me
- Open now
- Type: restaurant, bakery, café, specialty coffee
- Cuisine
- Price
- Accessibility
- Independent ownership
- Recently verified
- Visibility gap

Active filters use Ink or Signal treatment plus a check/icon. Do not rely on a coloured pill alone.

### 11.4 Place preview

The map preview should include only:

- Name
- Type/cuisine and district
- Open/closed status with next transition
- Price range when verified
- One transparent discovery signal
- `Why it appears` link

Do not lead with stars, review count, or a generated superlative.

### 11.5 Place detail

Recommended order:

1. Name, type, district, and verified operational status
2. Essential actions: directions, website, call, save, share
3. `Why this place appears`
4. Evidence and source freshness
5. Practical details: hours, price, accessibility, dietary support
6. Editorial note or community field notes
7. Corrections and ownership response

### 11.6 “Why this place appears” module

This is a signature MOTKARTA component. It must show 2–5 plain-language signals such as:

- Locally or independently owned
- Strong source diversity
- Repeat local interest
- Specialty-coffee verification
- Low mainstream visibility relative to evidence
- Recently verified in person
- No paid placement

Each signal links to its definition. Unknown information must say `Not yet verified`, never imply a negative.

### 11.7 Popularity and significance

Popularity may influence discovery but must never become a single master score.

Display a signal profile rather than a star rating:

| Signal | Meaning |
| --- | --- |
| Local return | Repeat interest from nearby users or reliable local sources |
| Source diversity | Independent sources agreeing, without duplicate syndication |
| Freshness | How recently essential facts were verified |
| Visibility gap | Evidence strength relative to mainstream exposure |
| Distinctiveness | Rare cuisine, technique, offer, or cultural relevance |
| Community confidence | Verified corrections and sustained nominations |

If a composite score is used internally, the public interface must expose its inputs and must not imply universal quality.

### 11.8 Buttons

| Variant | Style | Use |
| --- | --- | --- |
| Primary | Signal background, Ink text | One principal action per view |
| Secondary | Ink background, Paper text | Strong secondary action |
| Tertiary | Transparent, Ink text, underline or arrow | Inline navigation |
| Verified/link | Transparent, Water text | Evidence and source links |
| Destructive | Ink or Paper surface, Signal text/border | Remove/report actions |

Buttons must be at least 44 px tall and use verb-led labels.

### 11.9 Form fields

- Visible label above field; placeholders do not replace labels.
- 48 px minimum height.
- 1 px Ink/Mist border; 2 px Water focus outline with 2 px offset.
- Error text explains resolution and is associated programmatically.
- Optional fields are marked `Optional`; do not mark every required field with an asterisk.

### 11.10 Empty, loading, and error states

- Loading: show a restrained skeleton or progress message; do not animate the entire map.
- No result: explain active filters and offer `Clear filters` or expand radius.
- Missing data: use `Not yet verified` plus correction action.
- Stale data: show last verified date and a warning label.
- Offline: retain saved places and last available map where licensing permits.

---

## 12. Responsive behaviour

### Desktop

- Map may occupy 60–70% of the viewport.
- Search/results panel occupies 30–40% and may collapse.
- Keep the map visible while examining a place when space permits.

### Tablet

- Use a 45/55 panel split or full map plus side sheet.
- Avoid narrow two-column reading layouts.

### Mobile

- Map is full viewport behind a solid bottom sheet.
- Sheet stops: peek, half, full.
- Search and core filters remain reachable with one hand.
- Place detail becomes a full page or full-height sheet.
- Safe-area insets are mandatory.
- Never trap the user in a map without a list alternative.

---

## 13. Photography and illustration

### 13.1 Preferred photography

- Real façades and street context
- Menus, counters, ovens, espresso bars, grinders, and hands at work
- Daylight, practical light, weather, imperfect streets, and honest material texture
- Owners and staff only with permission and meaningful context
- Images that help identify or understand the place

### 13.2 Avoid

- Generic plated-food stock
- Artificial steam, impossible abundance, or hyper-saturated “food porn”
- Empty luxury dining rooms unrelated to the place
- Influencer poses and exaggerated reactions
- Images that conceal access barriers or materially misrepresent current conditions

### 13.3 Image treatment

- Natural colour or restrained documentary monochrome
- Moderate grain is allowed in editorial campaigns, not required in product UI
- No heavy presets that make food or interiors inaccurate
- Use 3:2 and 4:3 for place documentation; 16:9 for editorial hero images; 4:5 for social and merch
- Always provide meaningful alt text when the image conveys information

### 13.4 Generated imagery

AI-generated imagery may be used for concept development, campaigns, and clearly fictional brand worlds. It must not be presented as evidence of a real venue, dish, person, or accessibility condition.

---

## 14. Data visualisation

- Start with the question and takeaway, not the chart type.
- Use Ink for baseline context, Water for verified/included data, and Signal for the selected comparison or problem.
- Never use Signal to decorate all bars or points.
- Axes, units, timeframe, sample, and source must be visible.
- Provide a data table or accessible text summary for meaningful charts.
- Avoid 3D, gauges, decorative maps, and truncated axes that distort conclusions.
- Distinguish missing, zero, suppressed, and not applicable values.
- A “visibility gap” visual must define both visibility and evidence strength.

---

## 15. Motion

Motion explains change and location; it does not add personality for its own sake.

| Token | Duration | Use |
| --- | ---: | --- |
| `motion-fast` | 120 ms | Hover/focus feedback |
| `motion-base` | 180 ms | Controls, simple state changes |
| `motion-slow` | 280 ms | Sheets, panels, map/list transitions |

Default easing: `cubic-bezier(0.2, 0, 0, 1)`.

- Marker selection may use one short halo expansion; no endless pulsing.
- Map movement should respect direct manipulation and never fly across the city unexpectedly.
- Preserve spatial context when opening a result.
- Respect `prefers-reduced-motion`; remove non-essential movement and use instant or crossfade state changes.

---

## 16. Accessibility

Target **WCAG 2.2 AA** as the minimum.

### Required

- Text contrast: 4.5:1 for normal text; 3:1 for large text and meaningful UI graphics
- Keyboard access for every control and map alternative
- Persistent visible focus; do not remove browser focus without replacement
- 44 × 44 px minimum touch targets
- Logical heading structure and landmarks
- Form labels, instructions, errors, and status announcements
- Screen-reader names for icon-only controls
- Captions/transcripts for meaningful audio/video
- Reduced-motion support
- Zoom to 200% without loss of content or function
- Map/list equivalence for place discovery
- Colour-independent markers and status communication

### Accessibility content

Place profiles should support verified fields for:

- Step-free entrance
- Accessible toilet
- Door width or known constraints
- Seating and service notes
- Noise/lighting notes when reliably sourced
- Assistance animals

Never infer accessibility from imagery or reviews. Mark data freshness and source.

---

## 17. Content design

### 17.1 Voice

Direct, observant, transparent, and useful. More city desk than influencer feed.

### 17.2 Writing rules

- Lead with practical meaning.
- Use short sentences and concrete nouns.
- Explain methodology in plain language before technical detail.
- Name uncertainty: `Likely`, `Reported`, `Not yet verified`, `Last checked`.
- Use `you` sparingly and naturally.
- Avoid hype, moral judgement, and snark toward users or businesses.
- Never make a small independent place responsible for the platform's anti-ranking message.

### 17.3 UI terminology

| Use | Avoid |
| --- | --- |
| Why this place appears | Why we ranked it |
| Evidence | Proof, when evidence is incomplete |
| Visibility gap | Hidden gem score |
| Last verified | Up to date |
| Source | Authority |
| Correct this information | Report wrong business |
| Independent | Authentic, unless defined |

### 17.4 Dates, time, and price

- Swedish UI date: `13 aug. 2026`; numeric data contexts may use ISO `2026-08-13`.
- Use 24-hour time: `17.30` in Swedish prose or `17:30` in technical UI, consistently within a surface.
- Currency: `145 kr`; do not use `SEK` in consumer-facing Swedish UI unless needed for international clarity.
- Coordinates use mono type and up to 4 decimal places in ordinary UI.

---

## 18. Merchandise

Merch turns the method into a visible cultural position. It should feel wearable first and promotional second.

### 18.1 Capsule 01

- Heavyweight black T-shirt
- Natural unbleached canvas tote
- Cobalt/Water Blue cap
- Folded Stockholm map/poster
- Sticker set

### 18.2 Approved treatments

- Large Paper wordmark on Ink tee
- Small Signal line: `INGEN BETALD RANKING`
- Black street-grid graphic with Water dot and Signal crosshair on natural canvas
- Small one-colour embroidered counter-pin on cap
- Paper map with Ink linework, Water evidence dots, and one Signal intervention

### 18.3 Production rules

- Prefer screen print, embroidery, risograph, offset, and uncoated paper.
- Use one- to three-colour production where possible.
- Preserve real transparency in exported PNGs; never use a checkerboard background.
- Supply vector artwork for logos, type, markers, and map linework.
- Minimum embroidery stroke: confirm with supplier; default to 1.5 mm.
- Do not print illustrative venue maps without valid data attribution and licensing review.

---

## 19. Social, editorial, and presentation templates

### Social

- Primary ratios: 4:5 feed, 9:16 story/reel cover, 1:1 utility post.
- One claim per asset.
- Wordmark in a stable corner with full clear space.
- Use real map/data evidence where the post makes a factual claim.

### Editorial article

- Narrow reading column, strong condensed headline, mono metadata.
- Opening visual should show the city, method, or documented place.
- Evidence and sources belong near claims, not only in a footer.

### Presentations

- 16:9 canvas.
- Minimum 35 pt slide title and 18 pt body in standard rooms.
- One narrative point per slide.
- Use Paper/Ink as the base; section breaks may use Water or Signal.
- Include sources in speaker notes and beside material claims when the audience needs them.

---

## 20. Design tokens

```json
{
  "color": {
    "ink": "#111111",
    "paper": "#F4F0E7",
    "white": "#FFFDF8",
    "water": "#326BFF",
    "signal": "#FF4A2F",
    "mist": "#D8D4CB",
    "stone": "#77746E",
    "charcoal": "#2B2B2B"
  },
  "font": {
    "display": "Archivo Condensed",
    "body": "Inter",
    "mono": "IBM Plex Mono"
  },
  "space": {
    "1": "4px",
    "2": "8px",
    "3": "12px",
    "4": "16px",
    "5": "24px",
    "6": "32px",
    "7": "48px",
    "8": "64px",
    "9": "96px",
    "10": "128px"
  },
  "radius": {
    "none": "0px",
    "control": "2px",
    "overlay": "8px",
    "round": "999px"
  },
  "border": {
    "thin": "1px",
    "focus": "2px",
    "accent": "8px"
  },
  "motion": {
    "fast": "120ms",
    "base": "180ms",
    "slow": "280ms",
    "ease": "cubic-bezier(0.2, 0, 0, 1)"
  },
  "breakpoint": {
    "mobile": "320px",
    "tablet": "768px",
    "desktop": "1200px"
  }
}
```

---

## 21. AI design and code instructions

Use this section verbatim or by reference in AI design/coding tasks.

### Must do

- Read this entire file before proposing or implementing visual changes.
- Reuse the exact tokens and component rules.
- Make the city/map the dominant visual surface.
- Use flat editorial layouts, fine rules, condensed headings, and mono metadata.
- Include restaurants, bakeries, cafés, and specialty coffee in representative product content.
- Show why a place appears and how recently it was verified.
- Produce responsive and accessible states, including keyboard focus, errors, empty results, and list alternatives to maps.
- Label generated or illustrative data as such.

### Must not do

- Introduce gradients, glassmorphism, neon glows, rounded card grids, or generic startup illustrations.
- Add a rainbow category palette.
- Lead with five-star ratings or review counts.
- Claim objective/unbiased ranking.
- Use Google-derived visuals or data as the master source.
- Generate fake restaurant photography as product evidence.
- Alter brand colours or fonts without updating this document.

### Default visual prompt

> Design a production-ready MOTKARTA interface using bold Scandinavian editorial minimalism. Use Ink `#111111`, Paper `#F4F0E7`, Water Blue `#326BFF`, and Signal Red `#FF4A2F`; Archivo Condensed for headlines, Inter for body/UI, and IBM Plex Mono for sources and timestamps. The city map is the hero. Use flat surfaces, square geometry, fine rules, generous whitespace, blue evidence dots, and one red disruptive crosshair. Show transparent discovery signals and verification dates. Avoid star-led ratings, gradients, glass effects, bubbly cards, and generic food photography. Meet WCAG 2.2 AA and provide a list alternative to the map.

---

## 22. QA checklist

Before approving any design or release, confirm:

### Brand

- [ ] MOTKARTA is spelled and capitalised correctly.
- [ ] Logo clear space and minimum size are respected.
- [ ] Colour semantics are consistent.
- [ ] The work feels civic and culturally alive—not bureaucratic or influencer-led.

### Product

- [ ] The map/list relationship is clear.
- [ ] Place types include more than restaurants where relevant.
- [ ] The reason a place appears is accessible.
- [ ] Paid placement cannot affect the order or visual prominence.
- [ ] Facts, derived signals, community evidence, and editorial opinion are distinguishable.
- [ ] Missing and stale data are communicated honestly.

### Accessibility

- [ ] Contrast passes WCAG 2.2 AA.
- [ ] Keyboard and focus behaviour work.
- [ ] Touch targets are at least 44 × 44 px.
- [ ] Colour is not the sole distinction.
- [ ] Reduced motion is supported.
- [ ] Map content has an equivalent list/table route.
- [ ] Images, icons, errors, and live states have accessible names or announcements.

### Content and evidence

- [ ] No unsupported superlatives or “unbiased” claims.
- [ ] Sources and verification dates are present where needed.
- [ ] Illustrative/generated data is labelled.
- [ ] Swedish terminology, dates, time, and currency are consistent.

### Production

- [ ] Responsive states have been tested at 320, 768, 1200, and wide desktop widths.
- [ ] Logo and merch production files are vector where required.
- [ ] PNG transparency is real, with no checkerboard baked into artwork.
- [ ] OSM and other required attribution remains visible.

---

## 23. Governance and changelog

### Ownership

The project owner/design lead approves changes to brand foundations, logo, colour, typography, map semantics, and public scoring language. Component-level refinements may be made through normal product review when they remain within this specification.

### Updating this file

Every material update must include:

1. The changed rule
2. Why it changed
3. Affected products/assets
4. Migration work, if any
5. Date and decision owner

### Decision hierarchy

1. Legal, safety, licensing, and accessibility requirements
2. This `design.md`
3. Approved design tokens/components in code
4. Current Figma libraries and mockups
5. Brand deck and campaign references
6. Older screenshots and explorations

### Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1.0 | 2026-08-13 | Created the unified MOTKARTA design source of truth from the brand guide; explicitly expanded the product taxonomy to restaurants, bakeries, cafés, and specialty coffee. |

---

## 24. Reference sources

- Stockholm Open Data: <https://start.stockholm/om-stockholms-stad/utredningar-statistik-och-fakta/oppna-data/>
- Stockholm Livsmedelskollen: <https://start.stockholm/kontakta-oss/livsmedelskollen/>
- OpenStreetMap/Overpass manual: <https://dev.overpass-api.de/overpass-doc/en/>
- OpenStreetMap legal FAQ and ODbL: <https://wiki.openstreetmap.org/wiki/Legal_FAQ>
- SCB open APIs: <https://www.scb.se/vara-tjanster/oppna-data/>
- Swedish SNI classification: <https://www.scb.se/dokumentation/klassifikationer-och-standarder/standard-for-svensk-naringsgrensindelning-sni/>
