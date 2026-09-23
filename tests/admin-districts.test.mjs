import assert from "node:assert/strict";
import test from "node:test";

import { onRequestGet as getAdminDistricts, onRequestPost as postAdminDistricts } from "../functions/api/admin/districts.ts";
import { mergeDistrictNames } from "../lib/admin-districts.ts";

const adminToken = "review-secret";

test("mergeDistrictNames combines canonical and database districts", () => {
  const merged = mergeDistrictNames(["Södermalm", "Vasastan"], ["Kista", "Södermalm"]);
  assert.deepEqual(merged, ["Kista", "Södermalm", "Vasastan"]);
});

test("admin districts endpoint lists merged district catalog", async () => {
  const db = {
    prepare(query) {
      return {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async all() {
          if (query.includes("GROUP BY district")) {
            return {
              results: [
                { district: "Södermalm", placeCount: 12 },
                { district: "Custom Quarter", placeCount: 2 },
              ],
            };
          }
          return { results: [] };
        },
      };
    },
  };

  const response = await getAdminDistricts({
    request: new Request("https://motkarta.test/api/admin/districts", {
      headers: { "x-motkarta-admin-token": adminToken },
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.ok(payload.districts.some((row) => row.name === "Södermalm" && row.placeCount === 12));
  assert.ok(payload.districts.some((row) => row.name === "Custom Quarter" && row.placeCount === 2));
});

test("admin districts rename updates all matching rows", async () => {
  const rows = [
    { id: 1, district: "Old Quarter" },
    { id: 2, district: "old quarter" },
    { id: 3, district: "Södermalm" },
  ];
  const db = {
    rows,
    prepare(query) {
      return {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async run() {
          if (query.includes("UPDATE establishments SET district = ?")) {
            const [to, , from] = this.values;
            let changes = 0;
            for (const row of db.rows) {
              if (row.district.toLowerCase() === String(from).toLowerCase()) {
                row.district = to;
                changes += 1;
              }
            }
            return { success: true, meta: { changes } };
          }
          return { success: true, meta: { changes: 0 } };
        },
      };
    },
  };

  const response = await postAdminDistricts({
    request: new Request("https://motkarta.test/api/admin/districts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-motkarta-admin-token": adminToken,
      },
      body: JSON.stringify({ action: "rename", from: "Old Quarter", to: "New Quarter" }),
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.updatedCount, 2);
  assert.equal(db.rows[0].district, "New Quarter");
  assert.equal(db.rows[2].district, "Södermalm");
});
