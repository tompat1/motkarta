import assert from "node:assert/strict";
import test from "node:test";

import { onRequestPost } from "../functions/api/admin/scrape-photo.ts";

const token = "review-secret";

test("admin scrape-photo returns the next website image candidate", async () => {
  const html = `
<meta property="og:image" content="https://venue.test/logo.png">
<meta property="og:image:width" content="1500">
<meta property="og:image:height" content="450">
<img src="https://venue.test/room-a.jpg" width="1200" height="900">
<img src="https://venue.test/room-b.jpg" width="1200" height="900">
`;
  const fetchImpl = async (url) => {
    assert.equal(url, "https://venue.test");
    return new Response(html, { status: 200 });
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;

  try {
    const response = await onRequestPost({
      request: new Request("https://motkarta.test/api/admin/scrape-photo", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-motkarta-admin-token": token,
        },
        body: JSON.stringify({
          placeId: 42,
          website: "https://venue.test",
          currentUrl: "https://venue.test/room-a.jpg",
        }),
      }),
      env: { MOTKARTA_ADMIN_TOKEN: token },
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.photoUrl, "https://venue.test/room-b.jpg");
    assert.equal(payload.candidateIndex, 1);
    assert.equal(payload.hasMore, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
