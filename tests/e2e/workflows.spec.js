import { expect, test } from "@playwright/test";

async function signIn(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Fill demo account" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Task operations" })).toBeVisible();
}

test("sign-in accepts the demo account and rejects a locked account", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Use locked account" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("locked");
  await page.getByRole("button", { name: "Fill demo account" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Task operations" })).toBeVisible();
});

test("task form validates input and supports create, filter and edit", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Title", { exact: true }).fill("x");
  await page.getByLabel("Owner email").fill("invalid");
  await page.getByLabel("Due date", { exact: true }).fill("2026-10-10");
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByText("Title must contain 3 to 80 characters.")).toBeVisible();
  await expect(page.getByText("Owner email must be valid.")).toBeVisible();

  await page.getByLabel("Title", { exact: true }).fill("Review checkout flow");
  await page.getByLabel("Owner email").fill("student@example.com");
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByText("Review checkout flow")).toBeVisible();

  await page.getByPlaceholder("Search title or owner").fill("checkout");
  await expect(page.locator("#task-rows tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Edit task" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Review payment flow");
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByText("No tasks match the current filters.")).toBeVisible();
});

test("API console and checklist use live endpoints", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "API Console" }).click();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator("#api-result-status")).toHaveText("HTTP 200");
  await expect(page.locator("#api-response")).toContainText('"status": "ready"');

  await page.getByRole("button", { name: "Test Ideas" }).click();
  await page.getByRole("button", { name: "Generate checklist" }).click();
  await expect(page.locator(".idea-item")).toHaveCount(6);
  await expect(page.locator("#ai-prompt")).toHaveValue(/Suggest concrete test cases/);
});

test("mobile viewport has no page-level horizontal overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile layout only");
  await signIn(page);
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
  await expect(page.getByRole("button", { name: "New task" })).toBeVisible();
});
