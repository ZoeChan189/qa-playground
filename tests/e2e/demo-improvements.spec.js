import { expect, test } from "@playwright/test";

test("API key cases check calculations, equality and malformed JSON against the real backend", async ({ page }) => {
  await page.goto("/#api");
  const panel = page.locator("#view-api .evidence-panel");
  for (const name of ["health", "metrics", "evaluate", "boundary", "breach", "invalid", "malformed", "missing"]) {
    await page.locator("#api-preset").selectOption(name);
    await page.locator("#send-api").click();
    await expect(panel.locator(".result-line")).toContainText("PASS");
    if (["boundary", "breach"].includes(name)) {
      const outcome = panel.locator("tr").filter({ hasText: "Evaluation outcome" });
      await expect(outcome.locator("td").nth(1)).toHaveText("FAIL");
      await expect(outcome.locator("td").nth(2)).toHaveText("FAIL");
      await expect(outcome.locator("td").last()).toHaveText("PASS");
    }
  }
});

test("API fails a wrongly calculated boolean even when HTTP and JSON types look correct", async ({ page }) => {
  await page.route("**/api/evaluate", (route) => route.fulfill({ json: {
    valid: true, passed: false, checks: { latencyPassed: true, errorsPassed: true },
    values: { p95Ms: 280, errorRate: 0.005, p95LimitMs: 500, errorLimit: 0.01 },
  } }));
  await page.goto("/#api");
  await page.locator("#api-preset").selectOption("evaluate");
  await page.locator("#send-api").click();
  const panel = page.locator("#view-api .evidence-panel");
  await expect(panel.locator(".result-line")).toContainText("FAIL");
  await expect(panel.locator("tr").filter({ hasText: "Evaluation outcome" }).locator("td").last()).toHaveText("FAIL");
});

test("Copy result uses only current evidence and is cleared when request input changes", async ({ page }) => {
  await page.addInitScript(() => {
    window.copiedText = "";
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text) => { window.copiedText = text; } } });
  });
  await page.goto("/#api");
  await page.locator("#api-preset").selectOption("evaluate");
  await page.locator("#send-api").click();
  const copy = page.getByRole("button", { name: "Copy API result", exact: true });
  await copy.click();
  await expect.poll(() => page.evaluate(() => window.copiedText)).toContain("Evaluation outcome | PASS | PASS | PASS");
  await page.locator("#api-body").fill("{broken");
  await expect(copy).toBeDisabled();
  await page.locator("#send-api").click();
  await copy.click();
  await expect.poll(() => page.evaluate(() => window.copiedText)).toContain("200 | 400 | FAIL");
});

test("incomplete imported evidence cannot produce an overall pass or an invented VU count", async ({ page }) => {
  await page.goto("/#performance/load");
  await page.locator("#summary-file").setInputFiles({
    name: "load-old.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ metrics: {
      http_reqs: { count: 100 }, http_req_duration: { "p(95)": 8 }, http_req_failed: { value: 0 },
    } })),
  });
  await expect(page.locator("#perf-outcome-title")).toContainText("NOT VERIFIED");
  await expect(page.locator("#summary-verdict")).toHaveText("INCOMPLETE EVIDENCE");
  await expect(page.locator("#detail-rows tr").filter({ hasText: "Configured peak" })).toContainText("Not recorded");
});

test("recent runs retain five distinct results and performance copy tracks the latest run", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.copiedText = "";
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text) => { window.copiedText = text; } } });
  });
  let number = 1;
  await page.route("**/api/perf/runs/latest", (route) => route.fulfill({ json: { canRun: true, run: {
    id: `run-${number}`, status: "complete", scenario: "load", peakVus: 5, exitCode: 0,
    finishedAt: new Date(2026, 9, 11, 12, number).toISOString(),
    summary: { metrics: {
      http_reqs: { count: 100 + number }, http_req_duration: { "p(95)": 8 + number },
      http_req_failed: { value: 0 }, invalid_success_responses: { count: 0 },
    } },
  } } }));
  await page.goto("/#performance/load");
  for (let next = 1; next <= 6; next += 1) {
    number = next;
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.locator("#summary-requests")).toHaveText(String(100 + number));
  }
  await expect(page.locator("#recent-run-rows tr")).toHaveCount(5);
  await expect(page.locator("#recent-run-rows tr").first()).toContainText("106");
  await expect(page.locator("#recent-run-rows")).not.toContainText("101");
  await page.locator("#copy-perf-result").click();
  await expect.poll(() => page.evaluate(() => window.copiedText)).toContain("Run ID: run-6");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.locator("#recent-runs").screenshot({ path: testInfo.outputPath("recent-runs.png") });
  await page.locator("#clear-recent-runs").click();
  await expect(page.locator("#recent-runs")).toBeHidden();
  await expect(page.locator("#summary-requests")).toHaveText("106");
});

test("hosted connection uses the local Soak duration and preserves selected VUs", async ({ page, baseURL }) => {
  const origin = "https://qa-lab.example";
  const localProfiles = (await (await page.request.get(`${baseURL}/api/perf/scenarios`)).json()).scenarios;
  localProfiles.soak.stages[1].seconds = 180;
  await page.route(`${origin}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/perf/runs/latest") return route.fulfill({ json: { canRun: false, reason: "hosted", run: null } });
    const response = await page.request.get(`${baseURL}${url.pathname}${url.search}`);
    return route.fulfill({ response });
  });
  await page.route("http://127.0.0.1:4173/local-bridge/**", async (route) => {
    const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "X-QA-Bridge-Code", "Access-Control-Allow-Private-Network": "true" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const endpoint = new URL(route.request().url()).pathname.split("/").at(-1);
    return route.fulfill({ headers, json: endpoint === "scenarios" ? { scenarios: localProfiles }
      : endpoint === "metrics" ? { active: 0, completed: 0, rejected: 0, capacity: 24, p95Ms: null, heapUsedMb: 10 }
        : { canRun: true, run: null } });
  });
  await page.goto(`${origin}/#performance/soak`);
  await expect(page.locator("#chart-duration")).toHaveText("100 seconds");
  await page.locator("#perf-vus").fill("15");
  await page.locator("#manual-pairing summary").click();
  await page.locator("#bridge-code").fill("test-code");
  await page.locator("#bridge-connect").click();
  await expect(page.locator("#bridge-status")).toContainText("Connected.");
  await expect(page.locator("#chart-duration")).toHaveText("190 seconds");
  await expect(page.locator("#perf-vus")).toHaveValue("15");
  await expect(page.locator("#run-k6")).toBeEnabled();
});

test("a completed active run replaces a file imported while it was running", async ({ page }) => {
  const summary = (count) => ({ metrics: {
    configured_peak_vus: { value: 5 }, invalid_success_responses: { count: 0 },
    http_reqs: { count }, http_req_duration: { "p(95)": 10 }, http_req_failed: { value: 0 },
  } });
  let run = { id: "active-run", scenario: "load", peakVus: 5, status: "running" };
  await page.route("**/api/perf/runs/latest", (route) => route.fulfill({ json: { canRun: true, run } }));
  await page.goto("/#performance/load");
  await expect(page.locator("#run-state-title")).toHaveText("LOAD test running");
  await page.locator("#summary-file").setInputFiles({ name: "load-old.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(summary(11))) });
  await expect(page.locator("#summary-requests")).toHaveText("11");
  run = { ...run, status: "complete", exitCode: 0, summary: summary(222) };
  await expect(page.locator("#summary-requests")).toHaveText("222");
  await expect(page.locator("#perf-outcome-title")).toHaveText("LATEST RUN · PASS");
  run = null;
  await expect(page.locator("#summary-result")).toBeHidden();
  await expect(page.locator("#run-state-title")).toHaveText("No result on this runner");
});
