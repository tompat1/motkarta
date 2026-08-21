import assert from "node:assert/strict";
import test from "node:test";

import { onRequest as serveAdminRoute } from "../functions/admin/[[catchall]].ts";

test("admin route serves the SPA entry asset", async () => {
  let assetUrl = "";
  const response = await serveAdminRoute({
    request: new Request("https://motkarta.test/admin"),
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
  assert.equal(new URL(assetUrl).pathname, "/index.html");
});

test("admin route rejects non-page methods", async () => {
  const response = await serveAdminRoute({
    request: new Request("https://motkarta.test/admin", { method: "POST" }),
    env: { ASSETS: { async fetch() { return new Response("unused"); } } },
  });

  assert.equal(response.status, 405);
});
