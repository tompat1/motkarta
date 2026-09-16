type EventContext<Env> = {
  request: Request;
  env: Env;
};

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};

type D1Database = {
  prepare(query: string): D1Statement;
};

type Env = {
  DB?: unknown;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const allowedTypes = new Set(["Restaurant", "Bakery", "Café", "Specialty coffee"]);

export async function onRequestPost(context: EventContext<Env>) {
  const db = context.env.DB as D1Database | undefined;
  if (!db) {
    return Response.json(
      { error: "Place submissions are temporarily unavailable." },
      { headers: jsonHeaders, status: 503 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { headers: jsonHeaders, status: 400 });
  }

  const name = text(payload.name);
  const area = text(payload.area) || "Stockholm";
  if (!name) {
    return Response.json({ error: "Name is required." }, { headers: jsonHeaders, status: 400 });
  }

  const kind = text(payload.kind);
  const type = allowedTypes.has(kind) ? kind : "Restaurant";
  const address = text(payload.address) || `${area}, Stockholm`;
  const website = normalizeWebsite(payload.website);
  const description = text(payload.note) || `Oberoende ${type.toLowerCase()} i ${area}.`;
  const cuisine = text(payload.cuisine);
  const now = new Date().toISOString();
  const sourceId = `user:${crypto.randomUUID()}`;
  const newId = Date.now() * 1000 + Math.floor(Math.random() * 1000);

  const duplicate = await db
    .prepare(
      `SELECT id, name
       FROM establishments
       WHERE LOWER(name) = LOWER(?) AND LOWER(COALESCE(district, '')) = LOWER(?)
       LIMIT 1`,
    )
    .bind(name, area)
    .all<{ id: number; name: string }>();

  if (duplicate.results?.[0]) {
    return Response.json(
      { success: true, duplicate: true, id: duplicate.results[0].id, name: duplicate.results[0].name },
      { headers: jsonHeaders },
    );
  }

  await db
    .prepare(
      `INSERT INTO establishments (
        id, name, type, district, address, website, description, latitude, longitude,
        lifecycle_state, validation_label, validation_notes, candidate_source_type, candidate_source_id,
        candidate_review_status, candidate_allowed_use, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'candidate', 'not_enough_evidence', ?, 'user_submission', ?, 'needs_review', 'Candidate evidence only.', ?, ?)`,
    )
    .bind(
      newId,
      name,
      type,
      area,
      address,
      website,
      description,
      numberOrNull(payload.latitude),
      numberOrNull(payload.longitude),
      "Submitted by a user and awaiting editorial verification.",
      sourceId,
      now,
      now,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO evidence_sources (establishment_id, source_type, source_name, confidence, captured_at, summary)
       VALUES (?, 'curated_submission', 'Community submission', 0.25, ?, ?)`,
    )
    .bind(newId, now, description)
    .run()
    .catch(() => {});

  if (cuisine) {
    await db
      .prepare("INSERT INTO establishment_tags (establishment_id, tag) VALUES (?, ?)")
      .bind(newId, cuisine)
      .run()
      .catch(() => {});
  }

  return Response.json(
    { success: true, candidate: { id: newId, name, area, lifecycleState: "candidate", candidateSourceType: "user_submission" } },
    { headers: jsonHeaders, status: 201 },
  );
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeWebsite(value: unknown) {
  const website = text(value);
  if (!website) return null;
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}
