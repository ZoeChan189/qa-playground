import { expect, test } from "@playwright/test";

test("performance workspace shows profiles, real telemetry and a safe probe", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Performance testing" })).toBeVisible();
  await expect(page.locator("#vu-chart polyline")).toHaveCount(1);
  await expect(page.locator("#metric-capacity")).toContainText("capacity");
  await page.getByRole("button", { name: "Spike", exact: true }).click();
  await expect(page.locator("#profile-name")).toHaveText("Spike");
  await expect(page.locator("#perf-command")).toHaveText("npm run perf:spike");
  await page.locator("#perf-vus").fill("120");
  await expect(page.locator("#perf-command")).toHaveText("npm run perf:spike -- --vus 120");
  await expect(page.locator("#profile-vus")).toHaveText("120 VUs");
  await page.locator("#perf-vus").fill("201");
  await expect(page.locator("#copy-perf-command")).toBeDisabled();
  await page.getByRole("button", { name: "Soak", exact: true }).click();
  await expect(page.locator("#profile-name")).toHaveText("Soak");
  await page.getByRole("button", { name: "Run probe" }).click();
  await expect(page.locator("#probe-result")).toContainText("HTTP 200");
});

test("k6 summary import reads flat metrics and phase comparison", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#summary-file")).toBeEnabled();
  const summary = { metrics: {
    configured_peak_vus: { value: 120 },
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
  await expect(page.locator("#profile-vus")).toHaveText("120 VUs");
  await expect(page.locator("#perf-command")).toHaveText("npm run perf:spike -- --vus 120");
  await expect(page.locator("#summary-verdict")).toHaveText("LIMIT BREACHED");
  await expect(page.locator("#perf-outcome-title")).toContainText("FAIL");
  await expect(page.locator("#perf-outcome-detail")).toContainText("3,937 requests");
  await expect(page.locator("#summary-message")).toContainText("p95 PASS");
  await expect(page.locator("#summary-message")).toContainText("Errors FAIL");
  await expect(page.locator("#phase-rows tr")).toHaveCount(3);
  await expect(page.locator("#phase-rows")).toContainText("25.410%");
  await page.locator("#summary-file").setInputFiles({
    name: "bad.json", mimeType: "application/json", buffer: Buffer.from("not JSON"),
  });
  await expect(page.locator("#summary-message")).toHaveClass(/fail/);
});

test("local k6 replaces stale details after each completed run", async ({ page }) => {
  const summary = (count) => ({ metrics: {
    configured_peak_vus: { value: 5 },
    http_reqs: { count, rate: count / 17 },
    http_req_duration: { min: 1, avg: 8, med: 7, "p(90)": 14, "p(95)": 16, max: 30 },
    http_req_failed: { value: 0, passes: 0 },
    http_status_200: { count }, http_status_503: { count: 0 }, http_status_other: { count: 0 },
    phase_baseline_requests: { count }, phase_baseline_duration_ms: { "p(95)": 16 },
    phase_baseline_failed: { value: 0 },
  } });
  let run = { id: "old", status: "complete", scenario: "load", peakVus: 5, finishedAt: "2026-09-30T10:00:00Z", summary: summary(12) };
  let next = 1;
  await page.route("**/api/perf/runs/latest", (route) => route.fulfill({ json: { canRun: true, reason: null, run } }));
  await page.route("**/api/perf/runs", (route) => {
    run = { id: `new-${next++}`, status: "running", scenario: "load", peakVus: 5, startedAt: new Date().toISOString() };
    return route.fulfill({ status: 202, json: { run } });
  });
  await page.goto("/#performance/load");
  await expect(page.locator("#summary-requests")).toHaveText("12");
  await page.locator("#run-k6").click();
  await expect(page.locator("#summary-result")).toBeHidden();
  await expect(page.locator("#perf-outcome-title")).toContainText("running");
  await expect(page.locator("#run-state-title")).toHaveText("LOAD test running");
  run = { ...run, status: "complete", finishedAt: new Date().toISOString(), summary: summary(37) };
  await expect(page.locator("#summary-requests")).toHaveText("37");
  await expect(page.locator("#detail-rows")).toContainText("HTTP 200");
  await expect(page.locator("#detail-rows tr").filter({ hasText: "HTTP 503" }).locator("td").nth(1)).toHaveText("0");
  await expect(page.locator("#phase-rows")).toContainText("37");
  await page.locator("#run-k6").click();
  await expect(page.locator("#summary-result")).toBeHidden();
  run = { ...run, status: "complete", finishedAt: new Date().toISOString(), summary: summary(58) };
  await expect(page.locator("#summary-requests")).toHaveText("58");
  await expect(page.locator("#perf-outcome-detail")).toContainText("58 requests");
  await expect(page.locator("#summary-source")).toContainText("Latest local k6 run");
});

test("hosted view does not offer a load-generating button", async ({ page }) => {
  await page.route("**/api/perf/runs/latest", (route) => route.fulfill({ json: { canRun: false, reason: "hosted", run: null } }));
  await page.goto("/");
  await expect(page.locator("#run-k6")).toBeDisabled();
  await expect(page.locator("#run-availability")).toContainText("Hosted view");
  await expect(page.locator("#summary-file")).toBeEnabled();
});

test("unit and API workbenches expose pass and validation failure", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Unit", exact: true }).click();
  await page.getByRole("button", { name: "Evaluate", exact: true }).click();
  await expect(page.locator("#unit-result")).toContainText("PASS");
  await expect(page.locator("#view-unit .evidence-panel")).toContainText("2 / 2");
  await page.locator("#unit-p95").fill("500");
  await page.getByRole("button", { name: "Evaluate", exact: true }).click();
  await expect(page.locator("#unit-result")).toContainText("FAIL");
  await expect(page.locator("#view-unit .evidence-panel")).toContainText("1 / 2");
  await page.getByRole("button", { name: "API", exact: true }).click();
  await page.locator("#api-preset").selectOption("invalid");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator("#api-response-status")).toHaveText("HTTP 400");
  await expect(page.locator("#api-response")).toContainText("invalid_metrics");
  await expect(page.locator("#view-api .evidence-panel")).toContainText("PASS");
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
  await expect(page.locator("#view-e2e .evidence-panel")).toContainText("Matched ID + fields");
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
  await expect(page.locator("#view-visual .evidence-panel")).toContainText("28 px");
  await page.getByRole("button", { name: "Baseline" }).click();
  await expect(page.locator("#visual-specimen")).not.toHaveClass(/shifted/);
  await expect(page.locator("#view-visual .evidence-panel")).toContainText("0 px");
});

test("AI page sends a protected request and displays the draft as text", async ({ page }) => {
  let sent;
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: { available: true, requiresCode: true, model: "gemini-3.5-flash-lite" } }));
  await page.route("**/api/ai/generate", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ json: { text: "AI01: <img src=x onerror=alert(1)> Check boundary", model: "gemini-3.5-flash-lite" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "AI-assisted" }).click();
  await expect(page.locator("#ai-access-wrap")).toBeVisible();
  await page.locator("#ai-access-code").fill("group-code");
  await page.getByRole("button", { name: "Generate test cases" }).click();
  await expect(page.locator("#ai-result")).toContainText("Check boundary");
  await expect(page.locator("#ai-result img")).toHaveCount(0);
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
  expect(sent).toMatchObject({ topic: "performance", accessCode: "group-code" });
  await expect(page.locator("#view-ai .evidence-panel")).toContainText("Draft generated");
});

test("personal Gemini key mode loads models without saving the key", async ({ page }) => {
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: { available: false, requiresCode: false, reason: "missing_key" } }));
  await page.route("**/api/ai/models", (route) => route.fulfill({ json: { models: [{ id: "gemini-2.5-flash", label: "Gemini Flash" }] } }));
  let sent;
  await page.route("**/api/ai/generate", (route) => { sent = route.request().postDataJSON(); return route.fulfill({ json: { text: "Draft", model: "gemini-2.5-flash" } }); });
  await page.goto("/#ai");
  await page.getByRole("button", { name: "My API key" }).click();
  await page.locator("#ai-personal-key").fill("personal-test-key-long-enough");
  await page.getByRole("button", { name: "Load models" }).click();
  await expect(page.locator("#ai-model")).toHaveValue("gemini-2.5-flash");
  await page.getByRole("button", { name: "Generate test cases" }).click();
  await expect(page.locator("#ai-result")).toHaveText("Draft");
  expect(sent).toMatchObject({ mode: "personal", model: "gemini-2.5-flash", apiKey: "personal-test-key-long-enough" });
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test("mobile navigation, plan form and page width remain usable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile project only");
  await page.goto("/");
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
  await page.getByRole("button", { name: "Mobile web" }).click();
  await page.getByRole("button", { name: "Check layout" }).click();
  await expect(page.locator("#mobile-overflow")).toHaveText("None");
  await expect(page.locator("#view-mobile .evidence-panel")).toContainText("PASS");
  await page.getByRole("button", { name: "Open plan flow" }).click();
  await expect(page.locator("#plan-name")).toBeVisible();
});
