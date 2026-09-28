import { expect, test } from "@playwright/test";

test("visual specimen matches the baseline", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop baseline only");
  await page.goto("/#visual");
  await expect(page.getByRole("heading", { name: "Visual regression" })).toBeVisible();
  await expect(page.locator("#visual-specimen")).toHaveScreenshot("visual-specimen.png", { maxDiffPixelRatio: 0.005 });
});

test("@demo-fail shifted specimen is caught by screenshot comparison", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop failure demonstration only");
  await page.goto("/#visual");
  await page.getByRole("button", { name: "Shifted variant" }).click();
  await expect(page.locator("#visual-specimen")).toHaveScreenshot("visual-specimen.png", { maxDiffPixelRatio: 0.001 });
});
