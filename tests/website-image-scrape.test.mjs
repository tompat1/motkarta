import assert from "node:assert/strict";
import test from "node:test";

import { extractWebsiteImageFromHtml, isLikelyLogoBanner } from "../lib/website-image-scrape.ts";

const aperitivoHtml = `
<meta property="og:image" content="http://static1.squarespace.com/static/63f098a5a294170029eaba77/t/63fb83b1044e105d6ce56c26/1677427633220/aperitivo_black.png?format=1500w"/>
<meta property="og:image:width" content="1500"/>
<meta property="og:image:height" content="450"/>
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

test("extractWebsiteImageFromHtml skips logo banners but still returns metadata", () => {
  const result = extractWebsiteImageFromHtml(aperitivoHtml, "https://www.aperitivo-ingrosso.se");
  assert.equal(result.skippedAsLogoBanner, true);
  assert.equal(result.skipReason, "logo_banner");
  assert.match(result.imageUrl ?? "", /aperitivo_black\.png/);
  assert.equal(result.width, 1500);
  assert.equal(result.height, 450);
});

test("extractWebsiteImageFromHtml keeps normal venue photos", () => {
  const html = `<meta property="og:image" content="https://example.test/dining-room.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="900">`;
  const result = extractWebsiteImageFromHtml(html, "https://example.test");
  assert.equal(result.skippedAsLogoBanner, false);
  assert.equal(result.imageUrl, "https://example.test/dining-room.jpg");
});
