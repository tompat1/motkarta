import { defineConfig, devices } from "@playwright/test";

const e2ePort = process.env.MOTKARTA_E2E_PORT ?? "4173";
const e2eBaseURL = `http://localhost:${e2ePort}`;

export default defineConfig({
  testDir: "./tests_e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  timeout: 45000,
  // These projects exercise the same responsive controls at three viewports.
  // Serial execution avoids resource-contention flakes in map/list transitions.
  workers: 1,
  reporter: "html",
  use: {
    baseURL: e2eBaseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 12"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${e2ePort} --strictPort`,
    env: { MOTKARTA_E2E: "1" },
    url: e2eBaseURL,
    reuseExistingServer: false,
  },
});
