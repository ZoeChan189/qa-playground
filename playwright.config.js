import { defineConfig, devices } from "@playwright/test";

const port = process.env.QA_TEST_PORT || "4173";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 20_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node src/server.js",
    url: `${baseURL}/api/health`,
    env: { PORT: port, HOST: "127.0.0.1", NODE_ENV: "test" },
    reuseExistingServer: !process.env.CI && !process.env.QA_TEST_PORT,
    timeout: 30_000,
  },
});
