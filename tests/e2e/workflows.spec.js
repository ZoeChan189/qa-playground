import { expect, test } from "@playwright/test";

test("performance workspace shows profiles, real telemetry and a safe probe", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Performance testing" })).toBeVisible();
  await expect(page.locator("#vu-chart polyline")).toHaveCount(1);
  await expect(page.locator("#metric-capacity")).toContainText("capacity");
  await page.getByRole("button", { name: "Spike", exact: true }).click();
  await expect(page.locator("#profile-name")).toHaveText("Spike");
  await expect(page.locator("#perf-command")).toHaveText("npm run perf:spike");
  await page.getByRole("button", { name: "Soak", exact: true }).click();
  await expect(page.locator("#profile-name")).toHaveText("Soak");
  await page.getByRole("button", { name: "Run probe" }).click();
  await expect(page.locator("#probe-result")).toContainText("HTTP 200");
});

test("k6 summary import reads flat metrics and phase comparison", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#summary-file")).toBeEnabled();
  const summary = { metrics: {
    http_req_duration: { "p(95)": 94.25 },
    http_req_failed: { value: 0.2174 },
    http_reqs: { count: 3937 },
    server_active_jobs: { max: 24 },
    server_heap_used_mb: { min: 10.3, max: 17.4 },
    phase_baseline_duration_ms: { "p(95)": 15.79 },
    phase_baseline_failed: { value: 0 },
    phase_burst_duration_ms: { "p(95)": 94.6 },
    phase_burst_failed: { value: 0.2541 },
    phase_recovery_duration_ms: { "p(95)": 15.7 },
    phase_recovery_failed: { value: 0 },
  } };
  await page.locator("#summary-file").setInputFiles({
    name: "spike-2026-09-27.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(summary)),
  });
  await expect(page.locator("#summary-requests")).toHaveText("3,937");
  await expect(page.locator("#profile-name")).toHaveText("Spike");
  await expect(page.locator("#summary-verdict")).toHaveText("LIMIT BREACHED");
  await expect(page.locator("#phase-rows tr")).toHaveCount(3);
  await expect(page.locator("#phase-rows")).toContainText("25.4%");
  await page.locator("#summary-file").setInputFiles({
    name: "bad.json", mimeType: "application/json", buffer: Buffer.from("not JSON"),
  });
  await expect(page.locator("#summary-message")).toHaveClass(/fail/);
});

test("unit and API workbenches expose pass and validation failure", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Unit", exact: true }).click();
  await page.getByRole("button", { name: "Evaluate", exact: true }).click();
  await expect(page.locator("#unit-result")).toContainText("PASS");
  await page.locator("#unit-p95").fill("500");
  await page.getByRole("button", { name: "Evaluate", exact: true }).click();
  await expect(page.locator("#unit-result")).toContainText("FAIL");
  await page.getByRole("button", { name: "API", exact: true }).click();
  await page.locator("#api-preset").selectOption("invalid");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator("#api-response-status")).toHaveText("HTTP 400");
  await expect(page.locator("#api-response")).toContainText("invalid_metrics");
});

test("review, back and save a plan through the API", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Web E2E" }).click();
  await page.locator("#plan-name").fill("x");
  await page.getByRole("button", { name: "Review plan" }).click();
  await expect(page.locator("#plan-error-name")).toContainText("3 to 40");
  await page.locator("#plan-name").fill("Checkout spike check");
  await page.getByRole("button", { name: "Review plan" }).click();
  await expect(page.getByRole("heading", { name: "Review plan" })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.locator("#plan-name")).toHaveValue("Checkout spike check");
  await page.locator("#plan-scenario").selectOption("spike");
  await page.getByRole("button", { name: "Review plan" }).click();
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page.getByRole("heading", { name: "Plan saved" })).toBeVisible();
  const id = await page.locator("#plan-saved-id").textContent();
  const saved = await request.get(`/api/plans/${id}`);
  expect(saved.ok()).toBe(true);
  expect((await saved.json()).plan.scenario).toBe("spike");
});

test("AI prompt and visual variant are usable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "AI-assisted" }).click();
  await page.getByRole("button", { name: "Build prompt" }).click();
  await expect(page.locator("#ai-output")).toHaveValue(/Do not invent observed results/);
  await page.getByRole("button", { name: "Visual", exact: true }).click();
  await page.getByRole("button", { name: "Shifted variant" }).click();
  await expect(page.locator("#visual-specimen")).toHaveClass(/shifted/);
  await page.getByRole("button", { name: "Baseline" }).click();
  await expect(page.locator("#visual-specimen")).not.toHaveClass(/shifted/);
});

test("mobile navigation, plan form and page width remain usable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile project only");
  await page.goto("/");
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
  await page.getByRole("button", { name: "Mobile web" }).click();
  await page.getByRole("button", { name: "Check layout" }).click();
  await expect(page.locator("#mobile-overflow")).toHaveText("None");
  await page.getByRole("button", { name: "Open plan flow" }).click();
  await expect(page.locator("#plan-name")).toBeVisible();
});
