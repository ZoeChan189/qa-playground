import { expect, test } from "@playwright/test";

test("task board visual baseline", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop screenshot baseline only");
  await page.goto("/");
  await page.getByRole("button", { name: "Fill demo account" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#task-rows tr")).toHaveCount(3);
  await expect(page.locator("#view-tasks")).toHaveScreenshot("task-board.png", {
    animations: "disabled",
    mask: [page.locator("#response-time")],
    maxDiffPixelRatio: 0.02,
  });
});

test("@demo-fail visual test detects a shifted task board", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop visual demonstration only");
  await page.goto("/");
  await page.getByRole("button", { name: "Fill demo account" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Fault Lab" }).click();
  await page.getByRole("checkbox", { name: /Visual shift/ }).check();
  await page.getByRole("button", { name: "Tasks" }).click();
  await expect(page.locator("#task-rows tr")).toHaveCount(3);
  await expect(page.locator("#view-tasks")).toHaveScreenshot("task-board.png", {
    animations: "disabled",
    mask: [page.locator("#response-time")],
    maxDiffPixelRatio: 0.001,
  });
});
