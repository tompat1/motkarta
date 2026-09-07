type EventContext<Env> = {
  request: Request;
  env: Env;
};

type Env = {
  DB?: {
    prepare: (query: string) => {
      bind: (...args: unknown[]) => {
        first: <T>() => Promise<T | null>;
        run: () => Promise<unknown>;
      };
    };
  };
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-cache",
};

// In-memory fallback store for development mode when D1 is unavailable
const devSyncStore = new Map<string, { savedPlaceIds: number[]; updatedAt: string }>();

function generateSyncCode(): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "MOT-";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function onRequestGet(context: EventContext<Env>) {
  try {
    const url = new URL(context.request.url);
    const rawCode = (url.searchParams.get("code") || "").trim().toUpperCase();
    const cleanCode = rawCode.startsWith("MOT-") ? rawCode : `MOT-${rawCode}`;

    if (!rawCode || cleanCode.length < 5) {
      return new Response(JSON.stringify({ error: "Invalid sync code parameter" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const db = context.env.DB;
    if (db) {
      try {
        const row = await db
          .prepare("SELECT saved_ids, updated_at FROM sync_codes WHERE code = ?")
          .bind(cleanCode)
          .first<{ saved_ids: string; updated_at: string }>();

        if (row && row.saved_ids) {
          const savedPlaceIds: number[] = JSON.parse(row.saved_ids);
          return new Response(
            JSON.stringify({ syncCode: cleanCode, savedPlaceIds, updatedAt: row.updated_at }),
            { headers: jsonHeaders },
          );
        }
      } catch {
        // Fall back to dev store if table query fails
      }
    }

    const devData = devSyncStore.get(cleanCode);
    if (devData) {
      return new Response(
        JSON.stringify({ syncCode: cleanCode, savedPlaceIds: devData.savedPlaceIds, updatedAt: devData.updatedAt }),
        { headers: jsonHeaders },
      );
    }

    return new Response(JSON.stringify({ error: "Sync code not found or expired" }), {
      status: 404,
      headers: jsonHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: jsonHeaders });
  }
}

export async function onRequestPost(context: EventContext<Env>) {
  try {
    const body = (await context.request.json()) as { savedPlaceIds?: number[]; existingCode?: string };
    const savedPlaceIds = Array.isArray(body?.savedPlaceIds) ? body.savedPlaceIds.filter((x) => typeof x === "number") : [];
    const rawExisting = (body?.existingCode || "").trim().toUpperCase();
    const existingCode = rawExisting ? (rawExisting.startsWith("MOT-") ? rawExisting : `MOT-${rawExisting}`) : null;

    const syncCode = existingCode || generateSyncCode();
    const updatedAt = new Date().toISOString();
    const savedIdsJson = JSON.stringify(savedPlaceIds);

    const db = context.env.DB;
    if (db) {
      try {
        await db
          .prepare(
            "INSERT INTO sync_codes (code, saved_ids, updated_at) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET saved_ids=excluded.saved_ids, updated_at=excluded.updated_at",
          )
          .bind(syncCode, savedIdsJson, updatedAt)
          .run();
      } catch {
        // Fall back to dev store if table insert fails
      }
    }

    devSyncStore.set(syncCode, { savedPlaceIds, updatedAt });

    return new Response(
      JSON.stringify({
        success: true,
        syncCode,
        savedPlaceIds,
        updatedAt,
      }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: jsonHeaders });
  }
}
