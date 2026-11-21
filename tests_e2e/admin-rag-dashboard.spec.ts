import { expect, test } from "@playwright/test";

import { RAG_QUALITY_SNAPSHOT } from "../lib/admin-rag-quality";

test("RAG menu shows measured comparison, complete gate results, and explicit evidence gaps", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem("motkarta_preloader_seen", "true");
    localStorage.setItem("motkarta_onboarded", "true");
    sessionStorage.clear();
  });

  await page.route("**/api/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/session")) return route.fulfill({ json: { admin: true, authMode: "token" } });
    if (path.endsWith("/schema")) return route.fulfill({ json: { ready: true, baseSchemaReady: true, missing: [] } });
    if (path.endsWith("/ml-status")) {
      return route.fulfill({ json: { source: "test", timestamp: "2026-11-21T12:00:00Z", models: [], ragEvaluation: RAG_QUALITY_SNAPSHOT } });
    }
    if (path.endsWith("/candidates")) return route.fulfill({ json: { candidates: [] } });
    return route.fulfill({ json: {} });
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: /ML & utvärdering|ML & evaluation/ }).click();
  await page.getByRole("button", { name: "2. RAG" }).click();

  await expect(page.getByRole("heading", { name: /RAG-kvalitet, säkerhet och kapacitet|RAG quality, safety & capacity/ })).toBeVisible();
  await expect(page.locator(".admin-rag-chart-row")).toHaveCount(5);
  await expect(page.locator(".admin-rag-test-ledger li")).toHaveCount(6);
  await expect(page.getByText(/Inte mätt — providerfångst krävs|Not measured — provider capture required/).first()).toBeVisible();
  await expect(page.getByText("95.2%", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/841/).first()).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("rag-quality-dashboard.png"), fullPage: true });
});
