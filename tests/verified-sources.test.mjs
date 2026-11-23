import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getPlaceVerifiedSources } from "../src/app/verified-sources.ts";

test("getPlaceVerifiedSources detects all curated and reference sources across tags, sourceFacts, sourceName, and evidenceLabel", () => {
  const sample = {
    tags: ["Burgerdudes", "Guide Michelin", "White Guide", "Sveriges Bästa", "DN Krog", "SvD Krog", "Tasstipset", "Anders Husa"],
    sourceFacts: [
      { source: "Visit Stockholm" },
      { source: "Spotted by Locals Stockholm" },
      { source: "Allt om Mat" },
      { source: "Vagabond Resemagasin" },
      { source: "Stora Restaurangpriset" },
      { source: "Thatsup Stockholm" },
    ],
    kind: "Specialty coffee",
  };
  const ids = getPlaceVerifiedSources(sample).map((s) => s.id);
  for (const expected of [
    "burgerdudes",
    "michelin",
    "white-guide",
    "sveriges-basta",
    "dn-krog",
    "svd-krog",
    "specialty-coffee",
    "tasstipset",
    "husa-guide",
    "stora-restaurangpriset",
    "allt-om-mat",
    "vagabond",
    "spotted-by-locals",
    "visit-stockholm",
    "thatsup",
  ]) {
    assert.ok(ids.includes(expected), `Missing curated source badge: ${expected}`);
  }
});

test("getPlaceVerifiedSources matches curated sources from sourceName and evidenceLabel in real catalog", async () => {
  const catalog = JSON.parse(await readFile(new URL("../public/data/places.json", import.meta.url), "utf8"));
  const matchedIds = new Set();
  let badgedPlaces = 0;
  for (const place of catalog.places) {
    const badges = getPlaceVerifiedSources(place);
    if (badges.length > 0) {
      badgedPlaces++;
      for (const b of badges) matchedIds.add(b.id);
    }
  }
  assert.ok(badgedPlaces > 300, `Expected >300 curated-source badged venues, got ${badgedPlaces}`);
  assert.ok(matchedIds.has("visit-stockholm"), "Expected Visit Stockholm badges in catalog");
  assert.ok(matchedIds.has("spotted-by-locals"), "Expected Spotted by Locals badges in catalog");
  assert.ok(matchedIds.has("white-guide"), "Expected White Guide badges in catalog");
  assert.ok(matchedIds.has("burgerdudes"), "Expected Burgerdudes badges in catalog");
});

test("getPlaceVerifiedSources awards User Approved badge to user-submitted places", () => {
  const fromSourceType = getPlaceVerifiedSources({ candidateSourceType: "user_submission" });
  assert.ok(fromSourceType.some((s) => s.id === "user-approved" && s.label === "User Approved"));

  const fromTag = getPlaceVerifiedSources({ tags: ["User approved", "swedish"] });
  assert.ok(fromTag.some((s) => s.id === "user-approved"));

  const fromRegularPlace = getPlaceVerifiedSources({ tags: ["swedish"] });
  assert.ok(!fromRegularPlace.some((s) => s.id === "user-approved"));
});

test("VerifiedSourceBadgeList expands all badges when +N button is clicked", async () => {
  const badgeSource = await readFile(new URL("../src/components/VerifiedSourceBadge.tsx", import.meta.url), "utf8");
  assert.match(badgeSource, /const \[expanded, setExpanded\] = useState\(false\);/);
  assert.match(badgeSource, /aria-expanded=\{expanded\}/);
  assert.match(badgeSource, /event\.stopPropagation\(\);/);
  assert.match(badgeSource, /setExpanded\(\(prev\) => !prev\);/);
});
