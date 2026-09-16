import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const catalog = JSON.parse(readFileSync("public/data/places.json", "utf8")).places;
const belgo = catalog.find((p: { name: string }) => p.name === "Belgobarens bakficka");
const arirang = catalog.find((p: { name: string }) => p.name === "Arirang");

test("admin can cancel, remove, find and restore a venue without deleting its record", async ({ page }, testInfo) => {
  let removed = false;
  let writes = 0;
  const candidate = () => ({
    ...belgo, id: 42, lifecycleState: removed ? "candidate" : "baseline",
    validationLabel: removed ? "closed_wrong_category" : null,
    validationNotes: null, evidenceCount: 0, evidenceSourceTypes: [],
    possibleDuplicates: [], possibleDuplicateCount: 0,
    evidenceGate: { independentEvidenceCount: 0, independentEvidenceTypes: [], canPromoteHiddenGem: false, sourceGaps: [] },
  });
  await page.addInitScript(() => {
    localStorage.setItem("motkarta_preloader_seen", "true");
    localStorage.setItem("motkarta_onboarded", "true");
    sessionStorage.clear();
  });
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/session")) return route.fulfill({ json: { admin: true, authMode: "token" } });
    if (url.pathname.endsWith("/schema")) return route.fulfill({ json: { ready: true, baseSchemaReady: true, missing: [] } });
    if (url.pathname.endsWith("/candidates")) {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        expect(body.id).toBe(42);
        removed = body.validationLabel === "closed_wrong_category";
        writes++;
        return route.fulfill({ json: { success: true, reviewedAt: new Date().toISOString() } });
      }
      return route.fulfill({ json: { candidates: url.searchParams.get("state") === "removed" && !removed ? [] : [candidate()] } });
    }
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/place-visibility", (route) => route.fulfill({ json: {
    blocked: removed ? [{ id: 42, idNamespace: "d1", osmIdentity: belgo.osmIdentity }] : [],
  } }));
  await page.route("**/data/places.json", (route) => route.fulfill({ json: { source: "osm", places: [arirang, belgo] } }));

  await page.goto("/admin");
  const remove = page.getByRole("button", { name: /Ta bort från kartan|Remove from map/, exact: true });
  await expect(remove).toBeVisible();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain(belgo.name);
    await dialog.dismiss();
  });
  await remove.click();
  expect(writes).toBe(0);
  page.once("dialog", (dialog) => dialog.accept());
  await remove.click();
  await expect(page.getByRole("button", { name: /Återställ|Restore/, exact: true })).toBeVisible();
  expect(writes).toBe(1);
  await page.getByRole("button", { name: /Borttagna|Removed/, exact: true }).click();
  await expect(page.locator(".admin-candidate-row")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("admin-removed.png"), fullPage: true });

  await page.goto("/");
  await expect(page.locator(".status-dot-osm").first()).toBeAttached();
  await expect(page.getByRole("button", { name: belgo.name, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: arirang.name, exact: true })).toHaveCount(0);

  await page.goto("/admin");
  await page.getByRole("button", { name: /Borttagna|Removed/, exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /Återställ|Restore/, exact: true }).click();
  await expect(page.locator(".admin-candidate-row")).toHaveCount(0);
  expect(writes).toBe(2);
  await page.getByRole("button", { name: /Alla|All/, exact: true }).click();
  await expect(remove).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("button", { name: belgo.name, exact: true }).first()).toBeAttached();
  await expect(page.getByRole("button", { name: arirang.name, exact: true })).toHaveCount(0);
});
