export type AdminNotifyEnv = {
  MOTKARTA_CLOUDFLARE_ACCOUNT_ID?: string;
  MOTKARTA_CLOUDFLARE_EMAIL_API_TOKEN?: string;
  MOTKARTA_DIGEST_FROM_EMAIL?: string;
  MOTKARTA_DIGEST_FROM_NAME?: string;
  MOTKARTA_ADMIN_DIGEST_WEBHOOK?: string;
};

export type AdminEmailPayload = {
  to: string[];
  subject: string;
  text: string;
};

type CloudflareEmailResponse = {
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: {
    delivered?: string[];
    queued?: string[];
    permanent_bounces?: string[];
    suppressed_recipients?: string[];
  } | null;
};

export async function sendAdminNotificationEmail(
  env: AdminNotifyEnv,
  payload: AdminEmailPayload,
): Promise<{ delivered: number; errors: string[] }> {
  const recipients = [...new Set(payload.to.map((email) => email.trim()).filter(Boolean))];
  if (!recipients.length) {
    return { delivered: 0, errors: ["No notification recipients configured."] };
  }

  const accountId = env.MOTKARTA_CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = env.MOTKARTA_CLOUDFLARE_EMAIL_API_TOKEN?.trim();
  if (!accountId || !apiToken) {
    return {
      delivered: 0,
      errors: [
        "Cloudflare Email Service is not configured (MOTKARTA_CLOUDFLARE_ACCOUNT_ID and MOTKARTA_CLOUDFLARE_EMAIL_API_TOKEN are required).",
      ],
    };
  }

  const fromEmail = (env.MOTKARTA_DIGEST_FROM_EMAIL ?? "notifications@motkarta.rynell.org").trim();
  const fromName = (env.MOTKARTA_DIGEST_FROM_NAME ?? "Motkarta Admin").trim();
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/email/sending/send`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          to: recipients,
          from: { address: fromEmail, name: fromName },
          subject: payload.subject,
          text: payload.text,
        }),
      },
    );
    const body = await response.json().catch(() => null) as CloudflareEmailResponse | null;
    if (!response.ok || !body?.success) {
      const details = body?.errors
        ?.map((error) => [error.code, error.message].filter((part) => part != null && part !== "").join(": "))
        .filter(Boolean)
        .join("; ");
      return {
        delivered: 0,
        errors: [`Cloudflare Email Service: HTTP ${response.status}${details ? ` — ${details}` : ""}`],
      };
    }

    const delivered = new Set([...(body.result?.delivered ?? []), ...(body.result?.queued ?? [])]).size;
    const errors = [
      ...(body.result?.permanent_bounces ?? []).map((email) => `Permanent bounce: ${email}`),
      ...(body.result?.suppressed_recipients ?? []).map((email) => `Suppressed recipient: ${email}`),
    ];
    if (delivered === 0) {
      errors.unshift("Cloudflare Email Service accepted no recipients.");
    }
    return { delivered, errors };
  } catch (error) {
    return {
      delivered: 0,
      errors: [`Cloudflare Email Service: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

export async function postAdminDigestWebhook(
  env: AdminNotifyEnv,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const url = env.MOTKARTA_ADMIN_DIGEST_WEBHOOK?.trim();
  if (!url) {
    return { ok: false, error: "Webhook not configured." };
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return { ok: false, error: `Webhook HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
