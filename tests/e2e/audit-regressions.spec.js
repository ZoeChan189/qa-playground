import { expect, test } from "@playwright/test";

async function aiPage(page) {
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: { available: true, requiresCode: false, model: "gemini-test" } }));
  await page.goto("/#ai");
}

test("AI displays provider HTTP separately from QA Lab HTTP and suggests a fix", async ({ page }) => {
  await page.route("**/api/ai/generate", (route) => route.fulfill({ status: 502, json: { error: "ai_model_unavailable", message: "Model unavailable.", diagnostic: { source: "Gemini API", providerStatus: 404, providerCode: "NOT_FOUND", action: "Click Load models and select another model." } } }));
  await aiPage(page);
  await page.locator("#ai-generate").click();
  const panel = page.locator("#view-ai .evidence-panel");
  await expect(panel).toContainText("502");
  await expect(panel).toContainText("404");
  await expect(panel).toContainText("NOT_FOUND");
  await expect(panel).toContainText("Click Load models");
  await expect(panel.locator(".result-line")).toContainText("FAIL");
});

test("AI clears a prior draft when requirement changes and locks controls during requests", async ({ page }) => {
  let release;
  await page.route("**/api/ai/generate", async (route) => {
    await new Promise((resolve) => { release = resolve; });
    await route.fulfill({ json: { text: "Latest test draft", model: "gemini-test" } });
  });
  await aiPage(page);
  await page.locator("#ai-generate").click();
  await expect(page.locator("#ai-mode-personal")).toBeDisabled();
  await expect(page.locator("#ai-requirement")).toBeDisabled();
  await expect.poll(() => typeof release).toBe("function");
  release();
  await expect(page.locator("#ai-result-wrap")).toBeVisible();
  await page.locator("#ai-requirement").fill("A different requirement for testing");
  await expect(page.locator("#ai-result-wrap")).toBeHidden();
  await expect(page.locator("#view-ai .evidence-panel")).toContainText("Not called");
});

test("API body edits invalidate the previous measured verdict", async ({ page }) => {
  await page.goto("/#api");
  await page.locator("#api-preset").selectOption("evaluate");
  await page.locator("#send-api").click();
  const result = page.locator("#view-api .evidence-panel .result-line");
  await expect(result).toContainText("PASS");
  await page.locator("#api-body").fill("{broken");
  await expect(result).toContainText("NOT RUN");
  await page.locator("#send-api").click();
  await expect(result).toContainText("FAIL");
});

test("probe prevents overlapping requests and does not imply a full k6 verdict", async ({ page }) => {
  let release;
  await page.route("**/api/perf/work?*", async (route) => {
    await new Promise((resolve) => { release = resolve; });
    await route.fulfill({ json: { serviceMs: 9, iterations: 60_000 } });
  });
  await page.goto("/#performance/stress");
  await page.locator("#run-probe").click();
  await expect(page.locator("#run-probe")).toBeDisabled();
  await expect.poll(() => typeof release).toBe("function");
  release();
  await expect(page.locator("#probe-result")).toContainText("work 60");
  await expect(page.locator("#probe-result")).toContainText("not a k6 verdict");
  await expect(page.locator("#run-probe")).toBeEnabled();
});

test("CI never claims an overall pass when job data is unavailable or contradictory", async ({ page }) => {
  await page.route("**/actions/runs?per_page=1", (route) => route.fulfill({ json: { workflow_runs: [{ id: 123, run_number: 12, name: "CI", head_sha: "abcdef1234", head_branch: "main", status: "completed", conclusion: "success" }] } }));
  let detailsAvailable = false;
  await page.route("**/actions/runs/123/jobs?per_page=100", (route) => route.fulfill(detailsAvailable
    ? { json: { total_count: 1, jobs: [{ name: "tests", status: "completed", conclusion: "failure", steps: [] }] } }
    : { status: 403, json: { message: "Rate limited" } }));
  await page.goto("/#ci");
  const result = page.locator("#view-ci .evidence-panel .result-line");
  await expect(result).toContainText("INCOMPLETE");
  detailsAvailable = true;
  await page.locator("#ci-refresh").click();
  await expect(result).toContainText("FAIL");
  await page.route("**/actions/runs/123/jobs?per_page=100", (route) => route.fulfill({ json: { jobs: [] } }));
  await page.locator("#ci-refresh").click();
  await expect(result).toContainText("invalid job listing");
  await expect(result).not.toContainText("PASS");
});

test("mobile detects actual overflow and small controls instead of always passing", async ({ page }) => {
  await page.goto("/#mobile");
  await page.evaluate(() => {
    document.querySelector("#mobile-check").style.cssText = "width:10px;height:10px;min-height:0;padding:0";
    const overflow = document.createElement("div");
    overflow.style.cssText = "width:3000px;height:1px";
    document.body.append(overflow);
  });
  await page.evaluate(() => document.querySelector("#mobile-check").click());
  await expect(page.locator("#view-mobile .evidence-panel .result-line")).toContainText("FAIL");
  await expect(page.locator("#mobile-overflow")).toHaveText("Detected");
});

test("all topics remain usable without page-level overflow at narrow width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  for (const topic of ["performance/stress", "unit", "api", "e2e", "mobile", "visual", "ai", "ci"]) {
    await page.evaluate((topic) => { location.hash = topic; }, topic);
    await expect(page.locator(".view.active")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test("topic evidence screenshots show current results at desktop and mobile viewports", async ({ page }, testInfo) => {
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: { available: true, model: "gemini-test" } }));
  await page.route("**/api/ai/generate", (route) => route.fulfill({ status: 502, json: { error: "ai_model_unavailable", message: "Model unavailable.", diagnostic: { source: "Gemini API", providerStatus: 404, providerCode: "NOT_FOUND", action: "Click Load models and choose an available model." } } }));
  await page.goto("/");
  for (const topic of ["performance", "unit", "api", "e2e", "mobile", "visual", "ai", "ci"]) {
    await page.locator(`[data-view="${topic}"]`).click();
    await expect(page.locator(`#view-${topic}`)).toBeVisible();
    if (topic === "unit") await page.locator("#unit-key-cases").click();
    if (topic === "api") { await page.locator("#send-api").click(); await expect(page.locator("#view-api .evidence-panel .result-line")).toContainText("PASS"); }
    if (topic === "e2e") {
      await page.locator("#plan-name").fill("Audit example plan");
      await page.getByRole("button", { name: "Review plan", exact: true }).click();
      await page.locator("#plan-save").click();
      await expect(page.locator("#view-e2e .evidence-panel .result-line")).toContainText("PASS");
    }
    if (topic === "visual") await expect(page.locator("#view-visual .evidence-panel .result-line")).toContainText("PASS");
    if (topic === "ai") { await page.locator("#ai-generate").click(); await expect(page.locator("#view-ai .evidence-panel")).toContainText("NOT_FOUND"); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${topic}.png`), fullPage: true });
  }
});
