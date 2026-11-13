---
name: vp0-designs
description: Search and pull mobile UI design starters and screen patterns from vp0.com using the VP0 MCP server (search_vp0_designs, get_vp0_design). Use when looking for mobile UI references, screen layouts, cards, bottom sheets, or navigation patterns.
---

# VP0 Design Library (`vp0.com`)

Use the **VP0 MCP server** (`vp0`) to search and retrieve mobile UI design references and layouts from [vp0.com](https://vp0.com).

## Available MCP Tools
1. **`search_vp0_designs(query)`**:
   - Search the VP0 library by UI pattern, component, or screen type (e.g., `"map"`, `"bottom sheet"`, `"place card"`, `"search filter"`, `"onboarding"`, `"profile"`).
2. **`get_vp0_design(slug)`**:
   - Fetch the full AI-readable layout, spacing, typography, color hierarchy, and component structure for a specific VP0 design slug returned by `search_vp0_designs`.

## Workflow for Motkarta Mobile UI
1. Call `search_vp0_designs` with a focused query matching the mobile surface you are designing or auditing.
2. Call `get_vp0_design` for the best-matching slug(s) to inspect spacing, hierarchy, and interaction details.
3. Adapt the structural patterns to Motkarta's React + CSS design system (`src/styles.css`, `src/components/`) while preserving Motkarta's editorial palette and typography.

