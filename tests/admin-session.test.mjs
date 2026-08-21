import assert from "node:assert/strict";
import test from "node:test";

import { onRequestGet as getAdminSession } from "../functions/api/admin/session.ts";

const adminToken = "review-secret";

test("admin session endpoint reports the token fallback session", async () => {
  const response = await getAdminSession({
    request: new Request("https://motkarta.test/api/admin/session", {
      headers: { "x-motkarta-admin-token": adminToken },
    }),
    env: { MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.admin, true);
  assert.equal(payload.authMode, "token");
});

test("admin session endpoint reports closed admin access", async () => {
  const response = await getAdminSession({
    request: new Request("https://motkarta.test/api/admin/session"),
    env: {},
  });
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.admin, false);
  assert.match(payload.reason, /not configured/i);
});
