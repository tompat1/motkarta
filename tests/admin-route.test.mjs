import assert from "node:assert/strict";
import test from "node:test";

import { onRequest as serveAdminApiAppRoute } from "../functions/api/admin/app.ts";
import { onRequest as serveAdminBaseRoute } from "../functions/admin.ts";
import { onRequest as serveAdminNestedRoute } from "../functions/admin/[[catchall]].ts";

const adminRoutes = [
  { label: "base admin route", handler: serveAdminBaseRoute, url: "https://motkarta.test/admin" },
  { label: "nested admin route", handler: serveAdminNestedRoute, url: "https://motkarta.test/admin/review" },
  { label: "protected API admin app route", handler: serveAdminApiAppRoute, url: "https://motkarta.test/api/admin/app" },
];

for (const route of adminRoutes) {
  test(`${route.label} serves the SPA entry asset`, async () => {
    let assetUrl = "";
    const response = await route.handler({
      request: new Request(route.url),
      env: {
        ASSETS: {
          async fetch(input) {
            assetUrl = input instanceof Request ? input.url : String(input);
            return new Response("<html>admin</html>", {
              headers: { "content-type": "text/html" },
            });
          },
        },
      },
    });

    assert.equal(response.status, 200);
    assert.equal(new URL(assetUrl).pathname, "/");
  });

  test(`${route.label} rejects non-page methods`, async () => {
    const response = await route.handler({
      request: new Request(route.url, { method: "POST" }),
      env: { ASSETS: { async fetch() { return new Response("unused"); } } },
    });

    assert.equal(response.status, 405);
  });
}
