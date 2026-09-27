import assert from "node:assert/strict";
import test from "node:test";

import { formatCatalogDebugChip, formatCatalogDebugTitle } from "../lib/catalog-debug.ts";

test("catalog debug chip labels distinguish static json from d1 overlay", () => {
  const staticFailed = {
    catalogMode: "static",
    placeCount: 2945,
    liveApi: "failed",
  };
  assert.match(formatCatalogDebugChip(staticFailed, "en"), /JSON.*D1✗/);
  assert.match(formatCatalogDebugTitle(staticFailed, "en"), /failed or timed out/i);

  const overlay = {
    catalogMode: "d1_overlay",
    placeCount: 2945,
    liveApi: "ok",
  };
  assert.match(formatCatalogDebugChip(overlay, "sv"), /JSON\+D1.*D1✓/);
  assert.match(formatCatalogDebugTitle(overlay, "sv"), /D1-överlagring/);
});
