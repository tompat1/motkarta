#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReviewLabelExport, extractReviewRows } from "../lib/review-labels.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

function loadEnv() {
  const envPath = resolve(rootDir, ".env");
  if (existsSync(envPath)) {
    try {
      const content = readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch {}
  }
}

loadEnv();

const adminToken = (process.env.MOTKARTA_ADMIN_TOKEN || process.env.ADMIN_TOKEN || "").trim();
const apiUrl = (process.env.MOTKARTA_API_URL || process.env.API_URL || "http://localhost:5173").replace(/\/+$/, "");
const outputPath = resolve(rootDir, process.argv[2] || "outputs/human_validation_labels.json");

async function syncViaHttp() {
  const endpoint = `${apiUrl}/api/admin/review-labels`;
  const headers = {
    "content-type": "application/json",
  };
  if (adminToken) {
    headers["x-motkarta-admin-token"] = adminToken;
    headers["authorization"] = `Bearer ${adminToken}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} from ${endpoint}: ${body}`);
  }

  return response.json();
}

async function syncViaWrangler() {
  const { execSync } = await import("node:child_process");
  const sqlFile = resolve(rootDir, "scripts/export_review_events.sql");
  const isRemote = process.argv.includes("--remote") || process.env.WRANGLER_ENV === "remote";
  const cmd = `npx wrangler d1 execute motkarta-db ${isRemote ? "--remote" : "--local"} --json --file "${sqlFile}"`;
  const stdout = execSync(cmd, { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const raw = JSON.parse(stdout);
  return buildReviewLabelExport(extractReviewRows(raw));
}

async function main() {
  console.log("🔄 Starting automated review labels sync...");
  let payload = null;

  try {
    payload = await syncViaHttp();
    console.log(`📡 Fetched latest review labels via HTTP endpoint (${apiUrl}/api/admin/review-labels).`);
  } catch (httpError) {
    console.warn(`⚠️ HTTP sync failed (${httpError instanceof Error ? httpError.message : String(httpError)}).`);
    console.log("⏳ Attempting local Wrangler D1 fallback...");
    try {
      payload = await syncViaWrangler();
      console.log("💾 Successfully extracted review labels via local Wrangler D1.");
    } catch (wranglerError) {
      if (existsSync(outputPath)) {
        console.log(`ℹ️ Preserving existing labels file at ${outputPath}.`);
        return;
      }
      payload = buildReviewLabelExport([]);
      console.warn("⚠️ Initialized empty baseline review labels payload.");
    }
  }

  const filePayload = {
    updatedAt: payload.updatedAt || new Date().toISOString(),
    policy:
      payload.policy ||
      "Human validation labels exported from admin review events. Duplicate resolutions are kept separate from hidden-gem/mainstream labels.",
    labels: payload.labels || [],
    duplicateResolutions: payload.duplicateResolutions || [],
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(filePayload, null, 2)}\n`, "utf8");

  console.log(
    `✅ Successfully synced ${filePayload.labels.length} validation labels and ${filePayload.duplicateResolutions.length} duplicate resolutions directly to:`
  );
  console.log(`   👉 ${outputPath}`);
}

main().catch((err) => {
  console.error("❌ Review labels sync failed:", err);
  process.exit(1);
});
