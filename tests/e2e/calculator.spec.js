import { expect, test } from "@playwright/test";

test("calculator keys, precedence, decimals, errors and previous answer work", async ({ page }) => {
  await page.goto("/calculator/index.html");
  for (const key of ["2", "add", "3", "multiply", "4"]) await page.locator(`#calc-key-${key}`).click();
  await page.locator("#calc-equals").click();
  await expect(page.locator("#calc-result")).toHaveText("14");
  await page.locator("#calc-key-add").click();
  await page.locator("#calc-key-1").click();
  await page.locator("#calc-equals").click();
  await expect(page.locator("#calc-result")).toHaveText("15");
  await page.locator("#calc-expression").fill("0.1+0.2");
  await page.locator("#calc-equals").click();
  await expect(page.locator("#calc-result")).toHaveText("0.3");
  await page.locator("#calc-expression").fill("1/0");
  await page.locator("#calc-equals").click();
  await expect(page.locator("#calc-status")).toContainText("DIVIDE_BY_ZERO");
  await page.locator("#calc-clear").click();
  await page.locator("#calc-expression").fill("123");
  await page.locator("#calc-delete").click();
  await expect(page.locator("#calc-expression")).toHaveValue("12");
});

test("shared calculator runs all expected cases and is usable inside Mobile", async ({ page }, testInfo) => {
  await page.goto("/#mobile");
  const frame = page.frameLocator("#mobile-calculator");
  await frame.locator("#calc-run-cases").click();
  await expect(frame.locator("#calc-case-verdict")).toHaveText("PASS - 14 / 14 cases matched");
  await expect(frame.locator("#calc-case-rows tr")).toHaveCount(14);
  await expect(page.locator("#mobile-apk-download")).toHaveAttribute("href", "/downloads/qa-calculator.apk");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const element = await page.locator("#mobile-calculator").elementHandle();
  const child = await element.contentFrame();
  expect(await child.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("mobile-calculator.png"), fullPage: true });
});

test("angle mode and history survive reload; invalid stored data does not crash", async ({ page }) => {
  await page.goto("/calculator/index.html");
  await page.locator("#calc-expression").fill("sin(30)");
  await page.locator("#calc-equals").click();
  await expect(page.locator("#calc-result")).toHaveText("0.5");
  await page.locator("#calc-rad").click();
  await page.locator("#calc-expression").fill("sin(pi/2)");
  await page.locator("#calc-equals").click();
  await expect(page.locator("#calc-result")).toHaveText("1");
  await page.reload();
  await expect(page.locator("#calc-rad")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#calc-history li")).toHaveCount(2);
  await page.locator("#calc-history button").last().click();
  await expect(page.locator("#calc-deg")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#calc-equals").click();
  await expect(page.locator("#calc-result")).toHaveText("0.5");
  await page.locator("#calc-clear-history").click();
  await expect(page.locator("#calc-history-empty")).toBeVisible();
  await page.evaluate(() => localStorage.setItem("qa-calculator-v1", "invalid JSON"));
  await page.reload();
  await page.locator("#calc-run-cases").click();
  await expect(page.locator("#calc-case-verdict")).toContainText("14 / 14");
});

test("calculator remains responsive at narrow portrait and landscape widths", async ({ page }) => {
  await page.goto("/calculator/index.html");
  for (const viewport of [{ width: 320, height: 700 }, { width: 740, height: 360 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const sizes = await page.locator(".main-keys button, .scientific-keys button").evaluateAll((buttons) => buttons.map((button) => { const box = button.getBoundingClientRect(); return box.width >= 44 && box.height >= 44; }));
    expect(sizes.every(Boolean)).toBe(true);
    await page.locator("#calc-expression").fill("(2+3)*4");
    await page.locator("#calc-equals").click();
    await expect(page.locator("#calc-result")).toHaveText("20");
  }
});

test("hardware keyboard still works after tapping keypad and errors do not shift the keys", async ({ page }) => {
  await page.goto("/calculator/index.html");
  await page.locator("#calc-key-2").click();
  await page.keyboard.type("+3*4");
  await page.keyboard.press("Enter");
  await expect(page.locator("#calc-result")).toHaveText("14");
  const before = await page.locator(".main-keys").boundingBox();
  await page.locator("#calc-expression").fill("sqrt(-1)");
  await page.locator("#calc-equals").click();
  await expect(page.locator("#calc-status")).toContainText("DOMAIN");
  const after = await page.locator(".main-keys").boundingBox();
  expect(after.y).toBe(before.y);
});
