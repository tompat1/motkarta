# Admin and CMS login

The public CMS dialog uses the same server-verified authentication as the Admin
API. Choose **Logga in med Cloudflare / Sign in with Cloudflare**. This navigates
to `/api/admin/login`, a path protected by the existing Cloudflare Access
application. After Access authenticates an allowed user, the handler verifies
the signed session and returns to `/?cms_login=success`. The public page checks
`/api/admin/session` before enabling editing. The return parameter alone never
grants access.

The live custom domain is `motkarta.rynell.org`. On 2026-09-16, read-only checks
confirmed that `/admin`, `/api/admin/session` and `/api/admin/login` redirect to
`yellow-firefly-c71f.cloudflareaccess.com`, while `/` remains public. The Pages
session endpoint reports Access JWT verification and an email allowlist enabled,
with token fallback disabled. The live login page offers **Cloudflare** as its
identity provider. The existing Wrangler account is associated with
`thomasrynell@me.com`; its credentials do not grant permission to inspect the
zone-level Access policy. The allowed-email policy remains unchanged.

## Configuration

Cloudflare Access controls access to Motkarta. Its current Cloudflare identity
provider allows signing in with an existing Cloudflare account, subject to the
site's Access policy and application email allowlist. For email-code sign-in, enable Cloudflare's
[One-time PIN provider](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)
and restrict the Access policy to the intended administrator email addresses.
An existing identity provider can also be used.

Keep these Pages environment variables configured for the correct Access app:

- `MOTKARTA_ACCESS_TEAM_DOMAIN`: the Access team URL.
- `MOTKARTA_ACCESS_AUD`: the Access application's audience tag.
- `MOTKARTA_ADMIN_EMAILS`: comma-separated allowed administrator emails.

Protect `/admin`, `/admin.html` and `/api/admin/*` with the same Access app;
keep the public map available without login. If these paths use separate Access
apps, the API app audience must match the configured audience. The server
verifies signature, issuer, audience, mandatory expiration and email allowlist.
Do not enable `MOTKARTA_ACCESS_TRUSTED_HEADERS` for a publicly reachable origin
as a replacement for JWT verification. The `.pages.dev` hostname still requires
a verified server session and does not trust browser-stored flags.

For environments that intentionally use token authentication, set the secret
`MOTKARTA_ADMIN_TOKEN`. The dialog's alternative token form sends the token to
`/api/admin/session` for verification and only retains it in sessionStorage
after success. It is case-sensitive. Production currently has no token fallback
configured. There is no default password and no public account-registration flow.

## Session and editor behavior

The CMS checks the server on page load, window focus and authentication changes.
Expired/rejected sessions cannot restore edit mode from localStorage. Cloudflare
logout uses `/cdn-cgi/access/logout`; token logout removes the session token.
Old demo values such as `motkarta` and local `motkarta_cms_auth=true` flags no
longer authenticate. The previous local passcode validator has been removed.

Authentication does not change content persistence: CMS copy and merchandise
edits remain browser-local and exportable through the existing CMS controls.
They are not published to all visitors by signing in. Venue/photo Admin APIs
continue using their existing server storage and authorization.

## Verification and rollout

`tests/admin-login.test.mjs` verifies signed Access sessions, rejection of invalid
claims/signatures, fixed same-origin return URLs, and server-only client
authorization. Browser tests cover token login, rejected demo credentials,
forged browser flags, the Cloudflare button, return to editing and expired
sessions. Run the mandatory `npm run test:gate`, then deploy API and frontend
together through the normal Cloudflare Pages release workflow. No new database
migration or Access-policy change is required for this login repair.
