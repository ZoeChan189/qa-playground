import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("@real-k6 real button runs load, stress, spike and soak with fresh on-page results", async ({ page }, testInfo) => {
  test.skip(process.env.QA_REAL_K6_TEST !== "1" || testInfo.project.name !== "desktop-chromium", "Explicit local k6 verification only");
  test.setTimeout(300_000);
  await mkdir("test-results/real-k6-evidence", { recursive: true });
  await page.goto("/#performance/load");
  let previousId = null;
  for (const [scenario, vus, expected] of [["load", 5, "PASS"], ["stress", 200, "FAIL"], ["spike", 120, "FAIL"], ["soak", 10, "PASS"]]) {
    await page.locator(`[data-scenario="${scenario}"]`).click();
    await page.locator("#perf-vus").fill(String(vus));
    await expect(page.locator("#run-k6")).toBeEnabled();
    await page.locator("#run-k6").click();
    await expect(page.locator("#summary-result")).toBeHidden();
    await expect(page.locator("#run-state-title")).toHaveText("Latest test completed", { timeout: 150_000 });
    await expect(page.locator("#summary-profile")).toHaveText(scenario[0].toUpperCase() + scenario.slice(1));
    await expect(page.locator("#perf-outcome-title")).toContainText(expected);
    const run = (await (await page.request.get("/api/perf/runs/latest")).json()).run;
    expect(run.status).toBe("complete");
    expect(run.source).toBe("browser");
    expect(run.id).not.toBe(previousId);
    previousId = run.id;
    expect(run.summary.metrics.http_reqs.count).toBeGreaterThan(0);
    expect(run.exitCode).toBe(expected === "PASS" ? 0 : 99);
    console.log(JSON.stringify({ scenario, vus, requests: run.summary.metrics.http_reqs.count, p95: run.summary.metrics.http_req_duration["p(95)"], errorRate: run.summary.metrics.http_req_failed.value, exitCode: run.exitCode }));
    await page.locator("#summary-result").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/real-k6-evidence/${scenario}.png`, fullPage: true });
  }
});

test("@real-k6 long soak honors minute units, phase windows and a duration above 180 seconds", async ({ page }, testInfo) => {
  test.skip(process.env.QA_REAL_SOAK_TEST !== "1" || testInfo.project.name !== "desktop-chromium", "Explicit long local Soak verification only");
  test.setTimeout(270_000);
  await page.goto("/#performance/soak");
  await expect(page.locator("#chart-duration")).toHaveText("190 seconds");
  await expect(page.locator("#run-k6")).toBeEnabled();
  await page.locator("#run-k6").click();
  await expect(page.locator("#run-state-title")).toHaveText("Latest test completed", { timeout: 230_000 });
  await expect(page.locator("#perf-outcome-title")).toContainText("PASS");
  const run = (await (await page.request.get("/api/perf/runs/latest")).json()).run;
  const metrics = run.summary.metrics;
  expect(run.exitCode).toBe(0);
  for (const phase of ["early", "late"]) {
    const ratio = metrics[`phase_${phase}_requests`].count / metrics.http_reqs.count;
    expect(ratio).toBeGreaterThan(0.15);
    expect(ratio).toBeLessThan(0.35);
  }
  console.log(JSON.stringify({ scenario: "soak-3m", requests: metrics.http_reqs.count, p95: metrics.http_req_duration["p(95)"], errorRate: metrics.http_req_failed.value, early: metrics.phase_early_requests.count, late: metrics.phase_late_requests.count, exitCode: run.exitCode }));
  await page.screenshot({ path: testInfo.outputPath("soak-3m.png"), fullPage: true });
});
