import { expect, test } from "@playwright/test";

test("ChatGPT local status, model catalog, generation and sign-out update visible evidence", async ({ page }, testInfo) => {
  let connected = true;
  await page.route("**/api/ai/chatgpt/**", (route) => {
    const endpoint = route.request().url().split("/").at(-1);
    if (endpoint === "status") return route.fulfill({ json: { signedIn: connected, planEnabled: connected, pending: false, activeId: "account-one", accounts: [{ id: "account-one", label: "Student (1)" }] } });
    if (endpoint === "models") return route.fulfill({ json: { models: [{ id: "gpt-test", label: "Account model" }] } });
    if (endpoint === "sign-out") { connected = false; return route.fulfill({ json: { revoked: true, message: "Signed out." } }); }
    return route.fulfill({ json: { text: "Test case: invalid metrics return HTTP 400.", model: "gpt-test" } });
  });
  await page.goto("/#ai");
  await page.locator("#ai-mode-chatgpt").click();
  await expect(page.locator("#chatgpt-status")).toContainText("plan use is enabled");
  await expect(page.locator("#ai-personal-wrap")).toBeHidden();
  await expect(page.locator("#gemini-model-row")).toBeHidden();
  await expect(page.locator("#ai-generate")).toBeDisabled();
  await page.locator("#chatgpt-load-models").click();
  await expect(page.locator("#chatgpt-model")).toHaveValue("gpt-test");
  await page.locator("#ai-generate").click();
  await expect(page.locator("#ai-result")).toContainText("HTTP 400");
  await expect(page.locator("#view-ai .evidence-panel")).toContainText("gpt-test");
  await expect(page.locator("#view-ai .evidence-panel .result-line")).toContainText("NOT VERIFIED");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("chatgpt-local.png"), fullPage: true });
  await page.locator("#chatgpt-sign-out").click();
  await expect(page.locator("#ai-generate")).toBeDisabled();
  await expect(page.locator("#ai-result-wrap")).toBeHidden();
  await page.locator("#ai-mode-personal").click();
  await page.locator("#ai-personal-key").fill("test-personal-key-long-enough");
  await expect(page.locator("#ai-generate")).toBeEnabled();
  await expect(page.locator("#gemini-model-row")).toBeVisible();
});

test("ChatGPT provider errors are visible and cannot be reported as a successful draft", async ({ page }) => {
  await page.route("**/api/ai/chatgpt/status", (route) => route.fulfill({ json: { signedIn: true, planEnabled: true, pending: false, accounts: [], activeId: "one" } }));
  await page.route("**/api/ai/chatgpt/models", (route) => route.fulfill({ json: { models: [{ id: "gpt-test", label: "Test" }] } }));
  await page.route("**/api/ai/chatgpt/generate", (route) => route.fulfill({ status: 429, json: { error: "subscription_sharing_usage_limit_exceeded", message: "ChatGPT plan limit reached.", diagnostic: { source: "OpenAI", providerStatus: 429, action: "Check ChatGPT Usage." } } }));
  await page.goto("/#ai");
  await page.locator("#ai-mode-chatgpt").click();
  await page.locator("#chatgpt-load-models").click();
  await page.locator("#ai-generate").click();
  await expect(page.locator("#ai-status")).toContainText("Check ChatGPT Usage");
  await expect(page.locator("#view-ai .evidence-panel .result-line")).toContainText("FAIL");
  await expect(page.locator("#view-ai .evidence-panel")).toContainText("429");
  await expect(page.locator("#ai-result-wrap")).toBeHidden();
});

test("first plan use is explained once and confirmation is sent to the local service", async ({ page }) => {
  let welcomeRequired = true;
  await page.route("**/api/ai/chatgpt/status", (route) => route.fulfill({ json: { signedIn: true, planEnabled: true, welcomeRequired, pending: false, activeId: "one", accounts: [{ id: "one", label: "Student (1)" }] } }));
  await page.route("**/api/ai/chatgpt/confirm-plan", (route) => { welcomeRequired = false; return route.fulfill({ json: { confirmed: true } }); });
  await page.goto("/#ai");
  await page.locator("#ai-mode-chatgpt").click();
  await expect(page.getByRole("dialog")).toContainText("You're using your ChatGPT plan");
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("#chatgpt-active-account")).toHaveText("Active account: Student (1)");
  await page.reload();
  await page.locator("#ai-mode-chatgpt").click();
  await expect(page.locator("#chatgpt-status")).toContainText("plan use is enabled");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("an old local server returning HTML produces upgrade instructions, not a JSON exception", async ({ page, baseURL }) => {
  const origin = "https://qa-lab.example";
  await page.route(`${origin}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/perf/runs/latest") return route.fulfill({ json: { canRun: false, reason: "hosted", run: null } });
    return route.fulfill({ response: await page.request.get(`${baseURL}${url.pathname}${url.search}`) });
  });
  await page.route("http://127.0.0.1:4173/local-bridge/**", (route) => {
    const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "X-QA-Bridge-Code", "Access-Control-Allow-Private-Network": "true" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    return route.request().url().endsWith("scenarios")
      ? route.fulfill({ headers, contentType: "text/html", body: "<!doctype html><title>Old QA Lab</title>" })
      : route.fulfill({ headers, json: { canRun: true, run: null } });
  });
  await page.goto(`${origin}/#performance/load`);
  await page.locator("#manual-pairing summary").click();
  await page.locator("#bridge-code").fill("test-code");
  await page.locator("#bridge-connect").click();
  await expect(page.locator("#bridge-status")).toContainText("Close older QA Lab windows");
  await expect(page.locator("#bridge-status")).not.toContainText("Unexpected token");
  await expect(page.locator("#run-k6")).toBeDisabled();
  await page.locator('[data-view="ai"]').click();
  await page.locator("#ai-mode-chatgpt").click();
  await expect(page.locator("#chatgpt-open-local")).toBeVisible();
  await expect(page.locator("#chatgpt-sign-in")).toBeHidden();
});

test("a delayed initial saved result does not replace an imported summary", async ({ page }) => {
  let release;
  const ready = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/perf/runs/latest", async (route) => {
    await ready;
    return route.fulfill({ json: { canRun: true, run: { id: "old-saved", source: "saved", scenario: "spike", status: "complete", finishedAt: "2026-09-01T00:00:00Z",
      summary: { metrics: { http_reqs: { count: 999 }, http_req_duration: { "p(95)": 9 }, http_req_failed: { value: 0.2 } } } } } });
  });
  await page.goto("/#performance/load");
  await page.locator("#summary-file").setInputFiles({ name: "load-import.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ metrics: {
    http_reqs: { count: 123 }, http_req_duration: { "p(95)": 8 }, http_req_failed: { value: 0 },
  } })) });
  await expect(page.locator("#summary-requests")).toHaveText("123");
  const response = page.waitForResponse("**/api/perf/runs/latest");
  release();
  await response;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator("#summary-requests")).toHaveText("123");
  await expect(page.locator("#perf-outcome-title")).toContainText("NOT VERIFIED");
});

test("connecting before hosted profiles finish preserves the chosen scenario and local duration", async ({ page, baseURL }) => {
  const origin = "https://qa-lab.example";
  const hosted = (await (await page.request.get(`${baseURL}/api/perf/scenarios`)).json()).scenarios;
  const local = structuredClone(hosted);
  local.soak.stages[1].seconds = 180;
  let release;
  const ready = new Promise((resolve) => { release = resolve; });
  await page.route(`${origin}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/perf/scenarios") { await ready; return route.fulfill({ json: { scenarios: hosted } }); }
    if (url.pathname === "/api/perf/runs/latest") return route.fulfill({ json: { canRun: false, reason: "hosted", run: null } });
    return route.fulfill({ response: await page.request.get(`${baseURL}${url.pathname}${url.search}`) });
  });
  await page.route("http://127.0.0.1:4173/local-bridge/**", (route) => {
    const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "X-QA-Bridge-Code", "Access-Control-Allow-Private-Network": "true" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ headers, status: 204 });
    return route.fulfill({ headers, json: route.request().url().endsWith("/scenarios") ? { scenarios: local } : { canRun: true, run: null } });
  });
  await page.goto(`${origin}/#performance/soak`);
  await expect(page.locator("#perf-vus")).toBeDisabled();
  await page.locator("#manual-pairing summary").click();
  await page.locator("#bridge-code").fill("test-code");
  await page.locator("#bridge-connect").click();
  await expect(page.locator("#bridge-status")).toContainText("Connected.");
  await expect(page.locator("#profile-name")).toHaveText("Soak");
  await expect(page.locator("#chart-duration")).toHaveText("190 seconds");
  await expect(page.locator("#perf-vus")).toHaveValue("10");
  await page.locator("#perf-vus").fill("15");
  const response = page.waitForResponse(`${origin}/api/perf/scenarios`);
  release();
  await response;
  await expect(page.locator("#chart-duration")).toHaveText("190 seconds");
  await expect(page.locator("#profile-name")).toHaveText("Soak");
  await expect(page.locator("#perf-vus")).toHaveValue("15");
});
