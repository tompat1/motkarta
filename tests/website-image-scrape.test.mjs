import assert from "node:assert/strict";
import test from "node:test";

import {
  collectWebsiteImageCandidates,
  extractWebsiteImageFromHtml,
  isLikelyLogoBanner,
} from "../lib/website-image-scrape.ts";

const aperitivoHtml = `
<meta property="og:image" content="http://static1.squarespace.com/static/63f098a5a294170029eaba77/t/63fb83b1044e105d6ce56c26/1677427633220/aperitivo_black.png?format=1500w"/>
<meta property="og:image:width" content="1500"/>
<meta property="og:image:height" content="450"/>
<img src="https://images.squarespace-cdn.com/content/v1/63f098a5a294170029eaba77/hero-dining-room.jpg?format=1500w" width="1500" height="1000" alt="Dining room"/>
`;

test("isLikelyLogoBanner detects wide social/logo banners", () => {
  assert.equal(
    isLikelyLogoBanner(
      "http://static1.squarespace.com/static/aperitivo_black.png?format=1500w",
      { width: 1500, height: 450 },
    ),
    true,
  );
  assert.equal(isLikelyLogoBanner("https://example.test/interior-dining-room.jpg", { width: 1200, height: 900 }), false);
});

test("extractWebsiteImageFromHtml skips logo banners but still returns metadata when no fallback exists", () => {
  const html = `
<meta property="og:image" content="http://static1.squarespace.com/static/aperitivo_black.png?format=1500w"/>
<meta property="og:image:width" content="1500"/>
<meta property="og:image:height" content="450"/>
`;
  const result = extractWebsiteImageFromHtml(html, "https://www.aperitivo-ingrosso.se");
  assert.equal(result.skippedAsLogoBanner, true);
  assert.equal(result.skipReason, "logo_banner");
  assert.match(result.imageUrl ?? "", /aperitivo_black\.png/);
  assert.equal(result.width, 1500);
  assert.equal(result.height, 450);
  assert.equal(result.skippedLogoUrls.length, 1);
});

test("extractWebsiteImageFromHtml uses the next candidate after skipping a logo banner", () => {
  const result = extractWebsiteImageFromHtml(aperitivoHtml, "https://www.aperitivo-ingrosso.se");
  assert.equal(result.skippedAsLogoBanner, false);
  assert.equal(result.imageUrl, "https://images.squarespace-cdn.com/content/v1/63f098a5a294170029eaba77/hero-dining-room.jpg?format=1500w");
  assert.equal(result.skippedLogoUrls.length, 1);
  assert.match(result.skippedLogoUrls[0], /aperitivo_black\.png/);
});

test("extractWebsiteImageFromHtml keeps normal venue photos", () => {
  const html = `<meta property="og:image" content="https://example.test/dining-room.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="900">`;
  const result = extractWebsiteImageFromHtml(html, "https://example.test");
  assert.equal(result.skippedAsLogoBanner, false);
  assert.equal(result.imageUrl, "https://example.test/dining-room.jpg");
});

test("collectWebsiteImageCandidates gathers meta, img, and json-ld images in order", () => {
  const html = `
<meta property="og:image" content="https://example.test/logo.png">
<meta property="og:image:width" content="1500">
<meta property="og:image:height" content="450">
<meta name="twitter:image" content="https://example.test/twitter.jpg">
<img src="https://example.test/gallery.jpg" width="900" height="600">
<script type="application/ld+json">{"image":"https://example.test/schema.jpg"}</script>
`;
  const candidates = collectWebsiteImageCandidates(html, "https://example.test");
  assert.deepEqual(candidates.map((candidate) => candidate.url), [
    "https://example.test/logo.png",
    "https://example.test/twitter.jpg",
    "https://example.test/gallery.jpg",
    "https://example.test/schema.jpg",
  ]);
});
