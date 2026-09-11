import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

function viteSyncDevPlugin(): Plugin {
  const storePath = path.resolve(process.cwd(), ".tmp/dev_sync_store.json");

  function getStore(): Record<string, { savedPlaceIds: number[]; updatedAt: string }> {
    try {
      if (fs.existsSync(storePath)) {
        return JSON.parse(fs.readFileSync(storePath, "utf-8"));
      }
    } catch {
      // ignore
    }
    return {};
  }

  function saveStore(data: Record<string, { savedPlaceIds: number[]; updatedAt: string }>) {
    try {
      const dir = path.dirname(storePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(storePath, JSON.stringify(data, null, 2), "utf-8");
    } catch {
      // ignore
    }
  }

  return {
    name: "vite-plugin-sync-dev-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/sync")) {
          return next();
        }

        const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

        if (req.method === "GET") {
          const rawCode = (url.searchParams.get("code") || "").trim().toUpperCase();
          const cleanCode = rawCode.startsWith("MOT-") ? rawCode : `MOT-${rawCode}`;

          if (!rawCode || cleanCode.length < 5) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ error: "Invalid sync code parameter" }));
          }

          const store = getStore();
          const item = store[cleanCode];

          if (item) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            return res.end(
              JSON.stringify({
                syncCode: cleanCode,
                savedPlaceIds: item.savedPlaceIds,
                updatedAt: item.updatedAt,
              }),
            );
          }

          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({ error: "Sync code not found or expired" }));
        }

        if (req.method === "POST") {
          let bodyStr = "";
          req.on("data", (chunk) => {
            bodyStr += chunk;
          });
          req.on("end", () => {
            try {
              const body = JSON.parse(bodyStr || "{}");
              const savedPlaceIds = Array.isArray(body?.savedPlaceIds)
                ? body.savedPlaceIds.filter((x: any) => typeof x === "number")
                : [];
              const rawExisting = (body?.existingCode || "").trim().toUpperCase();
              const existingCode = rawExisting
                ? rawExisting.startsWith("MOT-")
                  ? rawExisting
                  : `MOT-${rawExisting}`
                : null;

              let syncCode = existingCode;
              if (!syncCode) {
                const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
                syncCode = "MOT-";
                for (let i = 0; i < 4; i++) {
                  syncCode += chars.charAt(Math.floor(Math.random() * chars.length));
                }
              }

              const updatedAt = new Date().toISOString();
              const store = getStore();
              store[syncCode] = { savedPlaceIds, updatedAt };
              saveStore(store);

              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              return res.end(
                JSON.stringify({
                  success: true,
                  syncCode,
                  savedPlaceIds,
                  updatedAt,
                }),
              );
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              return res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

function viteAdminDevPlugin(): Plugin {
  return {
    name: "vite-plugin-admin-dev-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/admin")) {
          return next();
        }

        const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
        const pathname = url.pathname;
        res.setHeader("Content-Type", "application/json");

        if (pathname === "/api/admin/session") {
          res.statusCode = 200;
          return res.end(
            JSON.stringify({
              admin: true,
              authMode: "dev",
              email: "admin@motkarta.local",
              configured: {
                token: true,
                accessJwt: false,
                trustedHeaders: false,
                emailAllowlist: false,
              },
            }),
          );
        }

        if (pathname === "/api/admin/schema") {
          res.statusCode = 200;
          return res.end(
            JSON.stringify({
              source: "dev",
              ready: true,
              success: true,
              baseSchemaReady: true,
              missing: [],
              checkedAt: new Date().toISOString(),
            }),
          );
        }

        if (pathname === "/api/admin/review-dashboard") {
          res.statusCode = 200;
          return res.end(
            JSON.stringify({
              source: "dev",
              generatedAt: new Date().toISOString(),
              nextStep: "caught_up",
              actions: {
                harvestNeeded: false,
                reviewNeeded: false,
                exportNeeded: false,
              },
              counts: {
                candidateCount: 0,
                newCandidateCount: 0,
                hiddenGemReadyCount: 0,
                needsEvidenceCount: 0,
                possibleDuplicateCount: 0,
                reviewEventCount: 0,
                unexportedReviewCount: 0,
              },
              latestReviewAt: null,
              lastExportedAt: null,
              exportLogAvailable: false,
            }),
          );
        }

        if (pathname === "/api/admin/candidates") {
          res.statusCode = 200;
          return res.end(
            JSON.stringify({
              candidates: [],
              total: 0,
            }),
          );
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), viteSyncDevPlugin(), viteAdminDevPlugin()],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    ...(isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : {}),
  },
});

