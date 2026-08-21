import assert from "node:assert/strict";
import test from "node:test";

import { onRequestGet as serveRoot } from "../functions/index.ts";

test("public root serves the static app without an Access session", async () => {
  let assetUrl = "";
  const response = await serveRoot({
    request: new Request("https://motkarta.test/"),
    env: {
      ASSETS: {
        async fetch(input) {
          assetUrl = input instanceof Request ? input.url : String(input);
          return new Response("<html>public</html>", {
            headers: { "content-type": "text/html" },
          });
        },
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(new URL(assetUrl).pathname, "/");
});

test("public root redirects Access-authenticated admins back to /admin", async () => {
  const response = await serveRoot({
    request: new Request("https://motkarta.test/", {
      headers: { cookie: "CF_Authorization=signed-access-jwt; other=value" },
    }),
    env: { ASSETS: { async fetch() { return new Response("unused"); } } },
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://motkarta.test/admin");
});

test("root ignores transient Access app session cookies", async () => {
  let assetFetched = false;
  const response = await serveRoot({
    request: new Request("https://motkarta.test/", {
      headers: { cookie: "CF_AppSession=transient-login-state" },
    }),
    env: {
      ASSETS: {
        async fetch() {
          assetFetched = true;
          return new Response("<html>public</html>");
        },
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(assetFetched, true);
});
