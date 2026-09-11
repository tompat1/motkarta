import assert from "node:assert/strict";
import test from "node:test";

import { isBroadStockholmArea, resolveStockholmRegion } from "../lib/stockholm-regions.ts";

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
