export type AdminNotifyEnv = {
  MOTKARTA_DIGEST_FROM_EMAIL?: string;
  MOTKARTA_DIGEST_FROM_NAME?: string;
  MOTKARTA_ADMIN_DIGEST_WEBHOOK?: string;
};

export type AdminEmailPayload = {
  to: string[];
  subject: string;
  text: string;
};

export async function sendAdminNotificationEmail(
  env: AdminNotifyEnv,
  payload: AdminEmailPayload,
): Promise<{ delivered: number; errors: string[] }> {
  const recipients = payload.to.filter(Boolean);
  if (!recipients.length) {
    return { delivered: 0, errors: ["No notification recipients configured."] };
  }

  const fromEmail = (env.MOTKARTA_DIGEST_FROM_EMAIL ?? "notifications@motkarta.rynell.org").trim();
  const fromName = (env.MOTKARTA_DIGEST_FROM_NAME ?? "Motkarta Admin").trim();
  const errors: string[] = [];
  let delivered = 0;

  for (const email of recipients) {
    try {
      const response = await fetch("https://api.mailchannels.net/tx/v1/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email }] }],
          from: { email: fromEmail, name: fromName },
          subject: payload.subject,
          content: [{ type: "text/plain", value: payload.text }],
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        errors.push(`Mailchannels ${email}: HTTP ${response.status} ${body.slice(0, 200)}`);
        continue;
      }
      delivered += 1;
    } catch (error) {
      errors.push(`Mailchannels ${email}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { delivered, errors };
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
