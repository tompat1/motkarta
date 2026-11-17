import assert from "node:assert/strict";
import test from "node:test";

import { getAreaAliases, isBroadStockholmArea, resolveStockholmRegion } from "../lib/stockholm-regions.ts";

test("keeps already specific Stockholm regions", () => {
  assert.equal(resolveStockholmRegion({ name: "Existing", area: "Vasastan" }), "Vasastan");
  assert.equal(resolveStockholmRegion({ name: "Existing", area: "Mariatorget" }), "Mariatorget");
});

test("resolves known broad-bucket places to useful regions", () => {
  assert.equal(
    resolveStockholmRegion({
      name: "Blå Porten",
      area: "Central Stockholm",
      latitude: 59.3252831,
      longitude: 18.0966567,
    }),
    "Djurgården",
  );

  assert.equal(
    resolveStockholmRegion({
      name: "Blå Dörren",
      area: "Central Stockholm",
      latitude: 59.320241,
      longitude: 18.0701466,
    }),
    "Södermalm",
  );
});

test("uses coordinates for broad Stockholm buckets", () => {
  assert.equal(
    resolveStockholmRegion({
      name: "Mälarpaviljongen",
      area: "Central Stockholm",
      latitude: 59.3275701,
      longitude: 18.0341686,
    }),
    "Kungsholmen",
  );

  assert.equal(
    resolveStockholmRegion({
      name: "Sturehof",
      area: "Central Stockholm",
      latitude: 59.3358585,
      longitude: 18.073306,
    }),
    "Östermalm",
  );
});

test("uses outer Stockholm regions for broad buckets outside the inner city", () => {
  assert.equal(
    resolveStockholmRegion({
      name: "A.B.Café",
      area: "Stockholm",
      latitude: 59.2995931,
      longitude: 17.998632,
    }),
    "Söderort",
  );

  assert.equal(
    resolveStockholmRegion({
      name: "Bromma test place",
      area: "Stockholm",
      latitude: 59.3547464,
      longitude: 17.956683,
    }),
    "Västerort",
  );

  assert.equal(
    resolveStockholmRegion({
      name: "North test place",
      area: "Stockholm",
      latitude: 59.382,
      longitude: 18.07,
    }),
    "Norrort",
  );
});

test("detects broad Stockholm area labels", () => {
  assert.equal(isBroadStockholmArea("Central Stockholm"), true);
  assert.equal(isBroadStockholmArea("South Stockholm"), true);
  assert.equal(isBroadStockholmArea("Södermalm"), false);
  assert.equal(isBroadStockholmArea("Gärdet"), false);
  assert.equal(isBroadStockholmArea("Kransen"), false);
  assert.equal(isBroadStockholmArea("Skeppsholmen"), false);
  assert.equal(isBroadStockholmArea("Riddarholmen"), false);
});

test("resolves Gärdet and Kransen by aliases and coordinates", () => {
  assert.equal(
    resolveStockholmRegion({
      name: "Gärdets Pizzeria",
      area: "Stockholm",
      address: "Erik Dahlbergsgatan 41, Gärdet",
    }),
    "Gärdet",
  );

  assert.equal(
    resolveStockholmRegion({
      name: "Restaurant Kransen",
      area: "Stockholm",
      address: "Svandammsplan 2, Kransen",
    }),
    "Kransen",
  );

  assert.equal(
    resolveStockholmRegion({
      name: "Svenska Sushiköket",
      area: "Stockholm",
      address: "Tellusborgsvägen 76, Södermalm",
      latitude: 59.3003552,
      longitude: 18.0040262,
    }),
    "Kransen",
  );

  assert.equal(
    resolveStockholmRegion({
      name: "Tessin Café",
      area: "Stockholm",
      latitude: 59.345,
      longitude: 18.098,
    }),
    "Gärdet",
  );

  assert.equal(
    resolveStockholmRegion({
      name: "Kransen Spot",
      area: "Stockholm",
      latitude: 59.302,
      longitude: 18.012,
    }),
    "Kransen",
  );
});

test("resolves Skeppsholmen places and removes them from Gamla Stan", () => {
  assert.equal(
    resolveStockholmRegion({
      name: "Café Skeppsholmen",
      area: "Gamla Stan",
      latitude: 59.3252445,
      longitude: 18.0811992,
    }),
    "Skeppsholmen",
  );

  assert.equal(
    resolveStockholmRegion({
      name: "Harö Krog",
      area: "Gamla Stan",
      latitude: 59.3282692,
      longitude: 18.0795023,
    }),
    "Skeppsholmen",
  );

  assert.equal(
    resolveStockholmRegion({
      name: "Skeppsholmen Generic Spot",
      area: "Stockholm",
      latitude: 59.325,
      longitude: 18.082,
    }),
    "Skeppsholmen",
  );
});

test("resolves Riddarholmen places correctly", () => {
  assert.equal(
    resolveStockholmRegion({
      name: "Riddaren Mat & Catering",
      area: "Stockholm",
      address: "Birger Jarls Torg 16",
      latitude: 59.32525,
      longitude: 18.06425,
    }),
    "Riddarholmen",
  );

  assert.equal(
    resolveStockholmRegion({
      name: "Brasserie Hutton",
      area: "Gamla Stan",
      address: "Riddarholmskajen 4",
      latitude: 59.3240043,
      longitude: 18.0625793,
    }),
    "Riddarholmen",
  );

  assert.equal(
    resolveStockholmRegion({
      name: "Lilla Gästabud",
      area: "Gamla Stan",
      address: "Lilla Nygatan 16",
    }),
    "Riddarholmen",
  );

  assert.equal(
    resolveStockholmRegion({
      name: "Gamla Riksarkivet",
      area: "Stockholm",
      address: "Birger Jarls Torg 2a",
      latitude: 59.3256377,
      longitude: 18.0640641,
    }),
    "Riddarholmen",
  );

  assert.equal(
    resolveStockholmRegion({
      name: "Riddarholmen Spot",
      area: "Stockholm",
      latitude: 59.325,
      longitude: 18.064,
    }),
    "Riddarholmen",
  );
});

test("reclassifies southern suburbs (Farsta, Sköndal, Fagersjö) to Söderort away from Södermalm", () => {
  // Farsta strandpunkten
  assert.equal(
    resolveStockholmRegion({
      name: "Farsta strandpunkten",
      area: "Södermalm",
      address: "East Stockholm, Stockholm",
      latitude: 59.2355021,
      longitude: 18.1019577,
    }),
    "Söderort",
  );

  // Sköndals Konditori
  assert.equal(
    resolveStockholmRegion({
      name: "Sköndals Konditori",
      area: "Södermalm",
      address: "Spritsvägen 7, Södermalm",
      latitude: 59.2564482,
      longitude: 18.106531,
    }),
    "Söderort",
  );

  // Fagersjö Pizza & Grill
  assert.equal(
    resolveStockholmRegion({
      name: "Fagersjö Pizza & Grill",
      area: "Södermalm",
      address: "South Stockholm, Stockholm",
      latitude: 59.2464731,
      longitude: 18.0623183,
    }),
    "Söderort",
  );

  // Kinahörnet at Farsta Torg without coordinates
  assert.equal(
    resolveStockholmRegion({
      name: "Kinahörnet",
      area: "Södermalm",
      address: "Farsta Torg 25, Södermalm",
    }),
    "Söderort",
  );

  // Farsta Värdshus
  assert.equal(
    resolveStockholmRegion({
      name: "Farsta Värdshus",
      area: "Södermalm",
      address: "Farstaängsvägen 22, Södermalm",
      latitude: 59.2389154,
      longitude: 18.0825664,
    }),
    "Söderort",
  );

  // Genuine Södermalm place remains Södermalm
  assert.equal(
    resolveStockholmRegion({
      name: "Kafé 44",
      area: "Södermalm",
      address: "Tjärhovsgatan 44, Södermalm",
      latitude: 59.3155,
      longitude: 18.0821,
    }),
    "Södermalm",
  );

  // Hagsätra
  assert.equal(
    resolveStockholmRegion({
      name: "Pizza 9",
      area: "Södermalm",
      address: "Hagsätra torg 6, Södermalm",
      latitude: 59.2629063,
      longitude: 18.0135766,
    }),
    "Söderort",
  );

  // Rågsved
  assert.equal(
    resolveStockholmRegion({
      name: "Dimas",
      area: "Södermalm",
      address: "Rågsvedstorget 2, Södermalm",
      latitude: 59.2568369,
      longitude: 18.0270893,
    }),
    "Söderort",
  );

  // Högdalen
  assert.equal(
    resolveStockholmRegion({
      name: "Högdalens grill",
      area: "Södermalm",
      address: "Högdalsgången 9, Södermalm",
      latitude: 59.2632282,
      longitude: 18.0429248,
    }),
    "Söderort",
  );

  // Örby
  assert.equal(
    resolveStockholmRegion({
      name: "Örby Pizzeria",
      area: "Södermalm",
      address: "Turingevägen 46, Södermalm",
      latitude: 59.2728857,
      longitude: 18.0195573,
    }),
    "Söderort",
  );

  // Hammarby Sjöstad
  assert.equal(
    resolveStockholmRegion({
      name: "Nya Carnegiebryggeriet",
      area: "Södermalm",
      address: "Ljusslingan 17, Södermalm",
      latitude: 59.3054102,
      longitude: 18.0985902,
    }),
    "Söderort",
  );

  // Liljeholmen
  assert.equal(
    resolveStockholmRegion({
      name: "Bastard Burgers",
      area: "Södermalm",
      address: "Liljeholmstorget 5, Södermalm",
      latitude: 59.309643,
      longitude: 18.0224993,
    }),
    "Söderort",
  );

  // Legitimate Södermalm waterfront places remain Södermalm
  assert.equal(
    resolveStockholmRegion({
      name: "Thaiboat",
      area: "Södermalm",
      address: "Östgötagatan 100, 116 64 Stockholm",
      latitude: 59.3043767,
      longitude: 18.0818893,
    }),
    "Södermalm",
  );
  assert.equal(
    resolveStockholmRegion({
      name: "YUC TANTO",
      area: "Södermalm",
      address: "Hornstulls Strand 17, Södermalm",
      latitude: 59.3139475,
      longitude: 18.0345157,
    }),
    "Södermalm",
  );
});

test("getAreaAliases returns sub-district aliases for search expansion", () => {
  const vasastanAliases = getAreaAliases("Vasastan");
  assert.ok(vasastanAliases.includes("birkastan"), "Vasastan should include birkastan alias");
  assert.ok(vasastanAliases.includes("odenplan"), "Vasastan should include odenplan alias");
  assert.ok(vasastanAliases.includes("rörstrandsgatan"), "Vasastan should include rörstrandsgatan alias");

  const soderortAliases = getAreaAliases("Söderort");
  assert.ok(soderortAliases.includes("farsta"), "Söderort should include farsta alias");
  assert.ok(soderortAliases.includes("sköndal"), "Söderort should include sköndal alias");
  assert.ok(soderortAliases.includes("fagersjö"), "Söderort should include fagersjö alias");
  assert.ok(soderortAliases.includes("hagsätra"), "Söderort should include hagsätra alias");
  assert.ok(soderortAliases.includes("rågsved"), "Söderort should include rågsved alias");
  assert.ok(soderortAliases.includes("högdalen"), "Söderort should include högdalen alias");
  assert.ok(soderortAliases.includes("örby"), "Söderort should include örby alias");
  assert.ok(soderortAliases.includes("gröndal"), "Söderort should include gröndal alias");
  assert.ok(soderortAliases.includes("västberga"), "Söderort should include västberga alias");
  assert.ok(soderortAliases.includes("vårberg"), "Söderort should include vårberg alias");
  assert.ok(soderortAliases.includes("enskededalen"), "Söderort should include enskededalen alias");
  assert.ok(soderortAliases.includes("herrängen"), "Söderort should include herrängen alias");

  const soderAliases = getAreaAliases("Södermalm");
  assert.ok(soderAliases.includes("sofo"), "Södermalm should include sofo alias");
  assert.ok(soderAliases.includes("hornstull"), "Södermalm should include hornstull alias");
});

