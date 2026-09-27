import { expect, test } from "@playwright/test";

test("@demo-fail validation test detects a bypass", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Run one API demonstration");
  await page.goto("/");
  await page.getByRole("button", { name: "Fill demo account" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Fault Lab" }).click();
  await page.getByRole("checkbox", { name: /Validation bypass/ }).check();
  const status = await page.evaluate(async () => {
    const token = sessionStorage.getItem("qa-token");
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Demo-Faults": "validation-bypass",
      },
      body: JSON.stringify({ title: "x" }),
    });
    return response.status;
  });
  expect(status).toBe(400);
});

test("@demo-fail mobile test detects viewport overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile failure demonstration only");
  await page.goto("/");
  await page.getByRole("button", { name: "Fill demo account" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Fault Lab" }).click();
  await page.getByRole("checkbox", { name: /Mobile overflow/ }).check();
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
});
