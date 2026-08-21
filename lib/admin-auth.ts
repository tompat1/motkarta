export type AdminAuthEnv = {
  MOTKARTA_ADMIN_TOKEN?: string;
  MOTKARTA_ADMIN_EMAILS?: string;
  MOTKARTA_ACCESS_AUD?: string;
  MOTKARTA_ACCESS_TEAM_DOMAIN?: string;
  MOTKARTA_ACCESS_TRUSTED_HEADERS?: string;
};

export type AdminAuthMode = "access_jwt" | "access_header" | "token";

export type AdminSession = {
  admin: boolean;
  authMode?: AdminAuthMode;
  email?: string;
  reason?: string;
  status?: number;
  configured: {
    token: boolean;
    accessJwt: boolean;
    trustedHeaders: boolean;
    emailAllowlist: boolean;
  };
};

type AccessJwtHeader = {
  alg?: string;
  kid?: string;
};

type AccessJwtPayload = {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iss?: string;
  nbf?: number;
  sub?: string;
};

type AccessJsonWebKey = JsonWebKey & {
  kid?: string;
};

type AccessJwks = {
  keys?: AccessJsonWebKey[];
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-cache",
};

const jwksCache = new Map<string, { expiresAt: number; keys: AccessJsonWebKey[] }>();

export async function requireAdmin(request: Request, env: AdminAuthEnv) {
  const session = await getAdminSession(request, env);
  if (session.admin) {
    return null;
  }

  return Response.json(
    { error: session.reason ?? "Unauthorized admin request.", admin: false },
    { headers: jsonHeaders, status: session.status ?? 401 },
  );
}

export async function getAdminSession(request: Request, env: AdminAuthEnv): Promise<AdminSession> {
  const configured = adminAuthConfigured(env);
  const token = suppliedAdminToken(request);
  const configuredToken = env.MOTKARTA_ADMIN_TOKEN?.trim() ?? "";
  const tokenWasSupplied = Boolean(token);

  if (configuredToken && token && constantTimeEqual(token, configuredToken)) {
    return {
      admin: true,
      authMode: "token",
      configured,
    };
  }

  const accessJwt =
    request.headers.get("cf-access-jwt-assertion")?.trim() ||
    cookieValue(request.headers.get("cookie"), "CF_Authorization");
  if (configured.accessJwt) {
    if (accessJwt) {
      try {
        const payload = await verifyAccessJwt(accessJwt, env);
        const email = payload.email ?? payload.sub;
        const allowlist = adminEmailAllowlist(env);
        if (allowlist.size > 0 && (!email || !allowlist.has(email.toLowerCase()))) {
          return closedSession(configured, "Admin account is not allowed for this app.", 403);
        }

        return {
          admin: true,
          authMode: "access_jwt",
          email,
          configured,
        };
      } catch (error) {
        return closedSession(
          configured,
          error instanceof Error ? error.message : "Cloudflare Access session could not be verified.",
          401,
        );
      }
    }

    if (!tokenWasSupplied) {
      return closedSession(configured, "Cloudflare Access session is required.", 401);
    }
  }

  if (configured.trustedHeaders) {
    const email = request.headers.get("cf-access-authenticated-user-email")?.trim().toLowerCase();
    const allowlist = adminEmailAllowlist(env);
    if (email && allowlist.size > 0 && !allowlist.has(email)) {
      return closedSession(configured, "Admin account is not allowed for this app.", 403);
    }
    if (email && (allowlist.size === 0 || allowlist.has(email))) {
      return {
        admin: true,
        authMode: "access_header",
        email,
        configured,
      };
    }
  }

  if (tokenWasSupplied && configuredToken) {
    return closedSession(configured, "Unauthorized admin request.", 401);
  }

  if (!configured.token && !configured.accessJwt && !configured.trustedHeaders) {
    return closedSession(configured, "Admin access is not configured.", 503);
  }

  return closedSession(configured, "Admin account is required.", 401);
}

function adminAuthConfigured(env: AdminAuthEnv): AdminSession["configured"] {
  return {
    token: Boolean(env.MOTKARTA_ADMIN_TOKEN?.trim()),
    accessJwt: Boolean(env.MOTKARTA_ACCESS_TEAM_DOMAIN?.trim() && env.MOTKARTA_ACCESS_AUD?.trim()),
    trustedHeaders: env.MOTKARTA_ACCESS_TRUSTED_HEADERS?.trim().toLowerCase() === "true",
    emailAllowlist: adminEmailAllowlist(env).size > 0,
  };
}

function closedSession(
  configured: AdminSession["configured"],
  reason: string,
  status: number,
): AdminSession {
  return {
    admin: false,
    reason,
    status,
    configured,
  };
}

function suppliedAdminToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  return (
    request.headers.get("x-motkarta-admin-token")?.trim() ??
    authHeader.replace(/^Bearer\s+/i, "").trim()
  );
}

function adminEmailAllowlist(env: AdminAuthEnv) {
  return new Set(
    String(env.MOTKARTA_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function cookieValue(cookieHeader: string | null, name: string) {
  const prefix = `${name}=`;
  for (const cookie of String(cookieHeader ?? "").split(";")) {
    const trimmed = cookie.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return "";
}

function constantTimeEqual(left: string, right: string) {
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}

async function verifyAccessJwt(token: string, env: AdminAuthEnv): Promise<AccessJwtPayload> {
  const [headerPart, payloadPart, signaturePart] = token.split(".");
  if (!headerPart || !payloadPart || !signaturePart) {
    throw new Error("Cloudflare Access session is malformed.");
  }

  const header = parseJwtPart<AccessJwtHeader>(headerPart);
  const payload = parseJwtPart<AccessJwtPayload>(payloadPart);
  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Cloudflare Access session uses an unsupported signature.");
  }

  const teamDomain = normalizeTeamDomain(env.MOTKARTA_ACCESS_TEAM_DOMAIN);
  const expectedAudience = env.MOTKARTA_ACCESS_AUD?.trim();
  if (!teamDomain || !expectedAudience) {
    throw new Error("Cloudflare Access verification is not configured.");
  }

  if (payload.iss && normalizeTeamDomain(payload.iss) !== teamDomain) {
    throw new Error("Cloudflare Access session issuer does not match this app.");
  }

  if (!audienceMatches(payload.aud, expectedAudience)) {
    throw new Error("Cloudflare Access session audience does not match this app.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp <= now) {
    throw new Error("Cloudflare Access session has expired.");
  }
  if (typeof payload.nbf === "number" && payload.nbf > now + 30) {
    throw new Error("Cloudflare Access session is not active yet.");
  }

  const keys = await loadAccessKeys(teamDomain);
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    throw new Error("Cloudflare Access signing key was not found.");
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signedData = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
  const signature = base64UrlDecodeBytes(signaturePart);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signedData);
  if (!valid) {
    throw new Error("Cloudflare Access session signature is invalid.");
  }

  return payload;
}

async function loadAccessKeys(teamDomain: string) {
  const cached = jwksCache.get(teamDomain);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.keys;
  }

  const response = await fetch(`${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) {
    throw new Error("Cloudflare Access signing keys could not be loaded.");
  }

  const jwks = (await response.json()) as AccessJwks;
  const keys = (jwks.keys ?? []).filter((key) => key.kty === "RSA");
  if (keys.length === 0) {
    throw new Error("Cloudflare Access signing keys are empty.");
  }

  jwksCache.set(teamDomain, {
    expiresAt: Date.now() + 5 * 60 * 1000,
    keys,
  });
  return keys;
}

function parseJwtPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecodeBytes(value))) as T;
}

function base64UrlDecodeBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function normalizeTeamDomain(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function audienceMatches(audience: string | string[] | undefined, expectedAudience: string) {
  if (Array.isArray(audience)) {
    return audience.includes(expectedAudience);
  }
  return audience === expectedAudience;
}
