---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/admin/AdminReviewPanel.tsx","src/styles.css"]
---

# Admin data management dashboard

- Scope: `/admin` and its venue review work surface.
- Mode: Operate.
- Audience: Motkarta administrators now; editors once the server exposes and enforces an editor role.
- Job: Scan the catalog, isolate risk, compare evidence, resolve conflicts, and record a defensible publication decision.
- Constraints: Preserve every existing admin workflow and the active `DESIGN.md`; do not imply permissions or data guarantees the backend does not provide.

## Direction contract

**THESIS:** The venue table is the admin product, not a report buried beneath panels. A fixed column rhythm lets operators compare venues in one gaze, while urgent rows change state without breaking the grid. It refuses the generic dashboard pattern of equal cards followed by an oversized feed.

**OWN-WORLD:** Motkarta Paper and White form the work surface, Ink holds navigation and table structure, Water marks verified evidence and links, and Signal marks the intervention that needs judgment. Flat rules, square controls, condensed headings, mono measurements, and blue evidence dots carry the existing brand without costume.

**STORY:** The operator sees what needs attention, narrows the dataset, sorts by a meaningful field, understands provenance and freshness, opens the record, and either resolves the conflict or records the next review state. Coverage, sources, ML, map, and runbook tools remain available but no longer compete with venue work.

**FIRST VIEWPORT:** A compact Ink navigation rail sits left. The main column opens with the Data Management Dashboard heading and one Signal primary action, followed by a ruled operating strip and advanced filters. The sortable venue table fills the remaining viewport. The memorable interaction is a calm row-to-review transition: selecting a risk row reveals the existing detailed review layer without losing table position.

**FORM:** Concourse Table, sixth in the ordered structural list and the dealt lead selected by the user. `seed:9e73af57b4832d27`.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved decisions

- The current API authorizes administrators only. Editor-specific permissions remain a backend contract decision and must not be simulated in client code.
