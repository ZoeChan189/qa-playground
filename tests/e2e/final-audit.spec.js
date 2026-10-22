import { expect, test } from "@playwright/test";

test("E2E locks Back while saving and restores it after the read-back finishes", async ({ page }) => {
  let release;
  const ready = new Promise((resolve) => { release = resolve; });
  const plan = { id: "plan-lock", name: "Final audit", scenario: "stress", targetVus: 20, notes: "Saved values" };
  await page.route("**/api/plans", async (route) => {
    await ready;
    return route.fulfill({ status: 201, json: { plan } });
  });
  await page.route("**/api/plans/plan-lock", (route) => route.fulfill({ json: { plan } }));
  await page.goto("/#e2e");
  await page.locator("#plan-name").fill(plan.name);
  await page.locator("#plan-scenario").selectOption(plan.scenario);
  await page.locator("#plan-vus").fill(String(plan.targetVus));
  await page.locator("#plan-notes").fill(plan.notes);
  await page.getByRole("button", { name: "Review plan", exact: true }).click();
  await page.locator("#plan-save").click();
  try {
    await expect(page.locator("#plan-back")).toBeDisabled();
    await expect(page.locator("#view-e2e .evidence-panel .result-line")).toContainText("RUNNING");
  } finally { release(); }
  await expect(page.locator("#view-e2e .evidence-panel .result-line")).toContainText("PASS");
  await expect(page.locator("#plan-back")).toBeEnabled();
});

test("E2E unlocks Back after a failed save and keeps the last result FAIL", async ({ page }) => {
  await page.route("**/api/plans", (route) => route.fulfill({ status: 503, json: { error: "offline" } }));
  await page.goto("/#e2e");
  await page.locator("#plan-name").fill("Retry workflow");
  await page.locator("#plan-vus").fill("20");
  await page.getByRole("button", { name: "Review plan", exact: true }).click();
  await page.locator("#plan-save").click();
  await expect(page.locator("#view-e2e .evidence-panel .result-line")).toContainText("FAIL");
  await expect(page.locator("#plan-back")).toBeEnabled();
  await expect(page.locator("#plan-save")).toBeEnabled();
});
