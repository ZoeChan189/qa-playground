import { expect, test } from "@playwright/test";

test("unit key cases show each expected and observed function outcome", async ({ page }) => {
  await page.goto("/#unit");
  await page.locator("#unit-key-cases").click();
  const panel = page.locator("#view-unit .evidence-panel");
  await expect(panel).toContainText("12 / 12");
  await expect(panel.locator("tbody tr")).toHaveCount(12);
  await expect(panel.locator("tr").filter({ hasText: "Latency equals limit" })).toContainText("FAIL");
  await expect(panel.locator("tr").filter({ hasText: "Latency equals limit" }).locator("td").last()).toHaveText("PASS");
});

test("old k6 results do not overwrite a newly selected scenario or VU input", async ({ page }) => {
  await page.route("**/api/perf/runs/latest", (route) => route.fulfill({ json: { canRun: true, run: { id: "old-stress", status: "complete", scenario: "stress", peakVus: 40, summary: { metrics: { configured_peak_vus: { value: 40 }, http_reqs: { count: 100 }, http_req_duration: { "p(95)": 20, thresholds: { "p(95)<900": false } }, http_req_failed: { value: 0, thresholds: { "rate<0.15": false } } } }, exitCode: 0 } } }));
  await page.goto("/#performance/load");
  await expect(page.locator("#summary-profile")).toHaveText("Stress");
  await expect(page.locator("#profile-name")).toHaveText("Load");
  await expect(page.locator("#perf-vus")).toHaveValue("5");
  await expect(page.locator("#perf-outcome-title")).toContainText("PASS");
  await page.locator("#perf-vus").fill("12");
  await expect(page.locator("#profile-name")).toHaveText("Load");
  await expect(page.locator("#perf-vus")).toHaveValue("12");
});

test("API shows exactly which contract fields and status decide the test", async ({ page }) => {
  await page.goto("/#api");
  await page.locator("#api-preset").selectOption("invalid");
  await page.locator("#send-api").click();
  const panel = page.locator("#view-api .evidence-panel");
  await expect(panel).toContainText("fields.p95Ms contains a validation message");
  await expect(panel.locator("tr").filter({ hasText: "HTTP status" }).locator("td").last()).toHaveText("PASS");
  await page.locator("#api-body").fill('{"p95Ms":280,"errorRate":0,"p95LimitMs":500,"errorLimit":0.01}');
  await page.locator("#send-api").click();
  await expect(panel.locator("tr").filter({ hasText: "HTTP status" }).locator("td").last()).toHaveText("FAIL");
});

test("visual compares real browser image pixels for matching and shifted variants", async ({ page }) => {
  await page.goto("/#visual");
  const panel = page.locator("#view-visual .evidence-panel");
  await expect(panel.locator(".result-line")).toContainText("PASS", { timeout: 15_000 });
  await expect(panel).toContainText("0.000%");
  await page.getByRole("button", { name: "Shifted variant" }).click();
  await expect(panel.locator(".result-line")).toContainText("FAIL", { timeout: 15_000 });
  await expect(panel).toContainText("28 px");
  await page.getByRole("button", { name: "Baseline", exact: true }).click();
  await expect(panel.locator(".result-line")).toContainText("PASS", { timeout: 15_000 });
});

test("E2E fails when a saved plan returns the wrong ID or notes", async ({ page }) => {
  await page.route("**/api/plans", (route) => route.fulfill({ status: 201, json: { plan: { id: "saved-id", name: "Example plan", scenario: "stress", targetVus: 40, notes: "Note" } } }));
  await page.route("**/api/plans/saved-id", (route) => route.fulfill({ json: { plan: { id: "wrong-id", name: "Example plan", scenario: "stress", targetVus: 40, notes: "Lost note" } } }));
  await page.goto("/#e2e");
  await page.locator("#plan-name").fill("Example plan");
  await page.locator("#plan-notes").fill("Note");
  await page.getByRole("button", { name: "Review plan", exact: true }).click();
  await page.locator("#plan-save").click();
  const panel = page.locator("#view-e2e .evidence-panel");
  await expect(panel.locator(".result-line")).toContainText("FAIL");
  await expect(panel.locator("tr").filter({ hasText: "Retrieved id" }).locator("td").last()).toHaveText("FAIL");
  await expect(panel.locator("tr").filter({ hasText: "Retrieved notes" }).locator("td").last()).toHaveText("FAIL");
});

test("CI shows failed jobs and individual test steps directly on the page", async ({ page }) => {
  await page.route("https://api.github.com/repos/ZoeChan189/qa-playground/actions/runs?per_page=1", (route) => route.fulfill({ json: { workflow_runs: [{ id: 123, run_number: 12, name: "Test QA Playground", head_sha: "abcdef1234", head_branch: "main", status: "completed", conclusion: "failure", updated_at: "2026-10-08T01:00:00Z" }] } }));
  await page.route("https://api.github.com/repos/ZoeChan189/qa-playground/actions/runs/123/jobs?per_page=100", (route) => route.fulfill({ json: { total_count: 1, jobs: [{ name: "test", status: "completed", conclusion: "failure", steps: [{ name: "npm test", conclusion: "success" }, { name: "npm run test:e2e", conclusion: "failure" }] }] } }));
  await page.goto("/#ci");
  const panel = page.locator("#view-ci .evidence-panel");
  await expect(panel.locator(".result-line")).toContainText("FAIL");
  await expect(panel.locator("tr").filter({ hasText: "npm run test:e2e" }).locator("td").last()).toHaveText("FAIL");
});

test("a new failed AI request replaces the old draft and resets self-reported review", async ({ page }) => {
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: { available: true, requiresCode: false, model: "gemini-2.5-flash" } }));
  let success = true;
  await page.route("**/api/ai/generate", (route) => route.fulfill(success ? { json: { text: "Test draft", model: "gemini-2.5-flash" } } : { status: 429, json: { message: "Rate limit" } }));
  await page.goto("/#ai");
  await page.locator("#ai-generate").click();
  await expect(page.locator("#ai-result")).toHaveText("Test draft");
  await page.locator(".checklist input").first().check();
  success = false;
  await page.locator("#ai-generate").click();
  await expect(page.locator("#view-ai .evidence-panel .result-line")).toContainText("FAIL");
  await expect(page.locator("#view-ai .evidence-panel")).toContainText("429");
  await expect(page.locator("#ai-result-wrap")).toBeHidden();
  await expect(page.locator(".checklist input").first()).not.toBeChecked();
});
