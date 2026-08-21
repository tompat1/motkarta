import assert from "node:assert/strict";
import test from "node:test";

import { getAdminSession, requireAdmin } from "../lib/admin-auth.ts";

const adminToken = "review-secret";

test("admin auth is closed when no admin mechanism is configured", async () => {
  const session = await getAdminSession(new Request("https://motkarta.test/api/admin/session"), {});

  assert.equal(session.admin, false);
  assert.equal(session.status, 503);
  assert.match(session.reason, /not configured/i);
});

test("admin auth accepts the local token fallback", async () => {
  const session = await getAdminSession(
    new Request("https://motkarta.test/api/admin/session", {
      headers: { "x-motkarta-admin-token": adminToken },
    }),
    { MOTKARTA_ADMIN_TOKEN: adminToken },
  );

  assert.equal(session.admin, true);
  assert.equal(session.authMode, "token");
});

test("admin auth rejects an invalid local token", async () => {
  const response = await requireAdmin(
    new Request("https://motkarta.test/api/admin/candidates", {
      headers: { authorization: "Bearer nope" },
    }),
    { MOTKARTA_ADMIN_TOKEN: adminToken },
  );
  const payload = await response?.json();

  assert.equal(response?.status, 401);
  assert.match(payload.error, /unauthorized/i);
});

test("admin auth can accept a trusted Cloudflare Access email header when explicitly enabled", async () => {
  const session = await getAdminSession(
    new Request("https://motkarta.test/api/admin/session", {
      headers: { "cf-access-authenticated-user-email": "Admin@Motkarta.test" },
    }),
    {
      MOTKARTA_ACCESS_TRUSTED_HEADERS: "true",
      MOTKARTA_ADMIN_EMAILS: "admin@motkarta.test",
    },
  );

  assert.equal(session.admin, true);
  assert.equal(session.authMode, "access_header");
  assert.equal(session.email, "admin@motkarta.test");
});

test("admin auth rejects trusted Access email headers outside the allowlist", async () => {
  const session = await getAdminSession(
    new Request("https://motkarta.test/api/admin/session", {
      headers: { "cf-access-authenticated-user-email": "other@motkarta.test" },
    }),
    {
      MOTKARTA_ACCESS_TRUSTED_HEADERS: "true",
      MOTKARTA_ADMIN_EMAILS: "admin@motkarta.test",
    },
  );

  assert.equal(session.admin, false);
  assert.equal(session.status, 403);
});

test("admin auth reads Cloudflare Access JWT from the browser authorization cookie", async () => {
  const session = await getAdminSession(
    new Request("https://motkarta.test/api/admin/session", {
      headers: { cookie: "CF_Authorization=not-a-jwt" },
    }),
    {
      MOTKARTA_ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
      MOTKARTA_ACCESS_AUD: "audience-tag",
    },
  );

  assert.equal(session.admin, false);
  assert.equal(session.status, 401);
  assert.match(session.reason, /malformed/i);
});
