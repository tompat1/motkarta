import { requireAdmin, type AdminAuthEnv } from "../../lib/admin-auth.ts";

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ success?: boolean }>;
};

type D1Database = {
  prepare(query: string): D1Statement;
};

type EventContext<Env> = {
  request: Request;
  env: Env;
};

type Env = {
  DB?: unknown;
} & AdminAuthEnv;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const MAX_DATA_IMAGE_BYTES = 1_500_000;

export function isSafeCmsImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_DATA_IMAGE_BYTES) return false;
  if (/[\r\n"'`<>]/.test(trimmed)) return false;
  if (trimmed.startsWith("/")) {
    return !trimmed.startsWith("//") && !trimmed.includes("..");
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  }
  if (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return true;
  }
  return false;
}

function sanitizeCopyMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof k === "string" && k.length > 0 && k.length <= 120 && typeof v === "string" && v.length <= 20_000) {
      out[k] = v;
    }
  }
  return out;
}

function sanitizeImagesMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof k === "string" && k.length > 0 && k.length <= 120 && isSafeCmsImageUrl(v)) {
      out[k] = v.trim();
    }
  }
  return out;
}

async function ensureCmsTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS cms_content (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run();
}

async function loadCmsState(db: D1Database) {
  try {
    const { results } = await db
      .prepare("SELECT key, value_json AS valueJson, updated_at AS updatedAt FROM cms_content")
      .all<{ key: string; valueJson: string; updatedAt: string }>();

    let overrides: { sv: Record<string, string>; en: Record<string, string> } = { sv: {}, en: {} };
    let images: Record<string, string> = {};
    let merchItems: unknown[] | null = null;
    let updatedAt: string | null = null;

    for (const row of results ?? []) {
      if (row.updatedAt && (!updatedAt || row.updatedAt > updatedAt)) {
        updatedAt = row.updatedAt;
      }
      try {
        const parsed = JSON.parse(row.valueJson);
        if (row.key === "overrides" && parsed && typeof parsed === "object") {
          overrides = {
            sv: sanitizeCopyMap((parsed as Record<string, unknown>).sv),
            en: sanitizeCopyMap((parsed as Record<string, unknown>).en),
          };
        } else if (row.key === "images") {
          images = sanitizeImagesMap(parsed);
        } else if (row.key === "merch_items" && Array.isArray(parsed)) {
          merchItems = parsed;
        }
      } catch {
        // Ignore malformed JSON row
      }
    }

    return { overrides, images, merchItems, updatedAt };
  } catch {
    return { overrides: { sv: {}, en: {} }, images: {}, merchItems: null, updatedAt: null };
  }
}

async function upsertCmsKey(db: D1Database, key: string, value: unknown, updatedAt: string) {
  if (value === null) {
    await db.prepare("DELETE FROM cms_content WHERE key = ?").bind(key).run();
    return;
  }
  await db
    .prepare(
      `INSERT INTO cms_content (key, value_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`,
    )
    .bind(key, JSON.stringify(value), updatedAt)
    .run();
}

export async function onRequestGet(context: EventContext<Env>) {
  const db = context.env.DB as D1Database | undefined;
  if (!db) {
    return Response.json(
      { source: "unavailable", overrides: { sv: {}, en: {} }, images: {}, merchItems: null, updatedAt: null },
      { headers: jsonHeaders },
    );
  }
  const state = await loadCmsState(db);
  return Response.json({ source: "d1", ...state }, { headers: jsonHeaders });
}

export async function onRequestPost(context: EventContext<Env>) {
  const authError = await requireAdmin(context.request, context.env);
  if (authError) return authError;

  const db = context.env.DB as D1Database | undefined;
  if (!db) {
    return Response.json(
      { error: "No production D1 dataset is bound." },
      { status: 503, headers: jsonHeaders },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON payload." }, { status: 400, headers: jsonHeaders });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid CMS payload." }, { status: 400, headers: jsonHeaders });
  }

  await ensureCmsTable(db);
  const updatedAt = new Date().toISOString();

  if (Object.prototype.hasOwnProperty.call(body, "overrides")) {
    const raw = body.overrides as Record<string, unknown> | null;
    const overrides = {
      sv: sanitizeCopyMap(raw?.sv),
      en: sanitizeCopyMap(raw?.en),
    };
    await upsertCmsKey(db, "overrides", overrides, updatedAt);
  }

  if (Object.prototype.hasOwnProperty.call(body, "images")) {
    const rawImages = body.images;
    if (rawImages && typeof rawImages === "object" && !Array.isArray(rawImages)) {
      for (const [key, val] of Object.entries(rawImages as Record<string, unknown>)) {
        if (val !== "" && val !== null && !isSafeCmsImageUrl(val)) {
          return Response.json(
            { error: `Invalid or unsafe image URL for key '${key}'.` },
            { status: 400, headers: jsonHeaders },
          );
        }
      }
      await upsertCmsKey(db, "images", sanitizeImagesMap(rawImages), updatedAt);
    } else if (rawImages === null) {
      await upsertCmsKey(db, "images", {}, updatedAt);
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "merchItems")) {
    const rawMerch = body.merchItems;
    if (rawMerch === null) {
      await upsertCmsKey(db, "merch_items", null, updatedAt);
    } else if (Array.isArray(rawMerch)) {
      for (const item of rawMerch) {
        if (item && typeof item === "object" && "image" in item && !isSafeCmsImageUrl((item as { image?: unknown }).image)) {
          return Response.json(
            { error: "Invalid or unsafe merch item image URL." },
            { status: 400, headers: jsonHeaders },
          );
        }
      }
      await upsertCmsKey(db, "merch_items", rawMerch, updatedAt);
    } else {
      return Response.json({ error: "merchItems must be an array or null." }, { status: 400, headers: jsonHeaders });
    }
  }

  const state = await loadCmsState(db);
  return Response.json({ success: true, source: "d1", ...state }, { headers: jsonHeaders });
}
