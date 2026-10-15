import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { ChatGptError } from "../../src/domain/chatgpt-assistant.js";

afterEach(() => vi.unstubAllEnvs());
const host = "127.0.0.1:4173";
const origin = `http://${host}`;
const mockAssistant = () => ({ status: vi.fn(async () => ({ signedIn: false, planEnabled: false, accounts: [] })),
  startSignIn: vi.fn(async () => ({ url: "https://auth.openai.com/api/accounts/authorize" })),
  models: vi.fn(async () => ({ models: [{ id: "test", label: "Test" }] })),
  generate: vi.fn(async () => ({ text: "Example draft", model: "test" })),
  signOut: vi.fn(async () => ({ revoked: true })),
});

describe("local ChatGPT HTTP boundary", () => {
  it("allows local same-origin requests and never invokes ChatGPT from foreign origins", async () => {
    const assistant = mockAssistant();
    const app = createApp({ chatGptAssistant: assistant });
    expect((await request(app).get("/api/ai/chatgpt/status").set("Host", host)).status).toBe(200);
    for (const endpoint of ["sign-in", "models", "generate", "sign-out"]) {
      expect((await request(app).post(`/api/ai/chatgpt/${endpoint}`).set("Host", host).set("Origin", origin).send({})).status).toBe(200);
      expect((await request(app).post(`/api/ai/chatgpt/${endpoint}`).set("Host", host).set("Origin", "https://evil.example").send({})).status).toBe(403);
      expect((await request(app).post(`/api/ai/chatgpt/${endpoint}`).set("Host", host).send({})).status).toBe(403);
    }
    expect(assistant.startSignIn).toHaveBeenCalledTimes(1);
    expect(assistant.generate).toHaveBeenCalledTimes(1);
    expect((await request(app).get("/api/ai/chatgpt/status").set("Host", host).set("Sec-Fetch-Site", "cross-site")).status).toBe(403);
    expect((await request(app).get("/api/ai/chatgpt/status").set("Host", "attacker.example:4173")).status).toBe(403);
    vi.stubEnv("NODE_ENV", "production");
    expect((await request(app).post("/api/ai/chatgpt/sign-in").set("Host", host).set("Origin", origin).send({})).status).toBe(403);
    expect(assistant.startSignIn).toHaveBeenCalledTimes(1);
  });
  it("returns useful sanitized provider diagnostics, without tokens or raw stacks", async () => {
    const assistant = mockAssistant();
    assistant.generate.mockRejectedValueOnce(new ChatGptError("ChatGPT plan limit reached.", 429, "subscription_sharing_usage_limit_exceeded", "Check ChatGPT Usage.", 429));
    const app = createApp({ chatGptAssistant: assistant });
    const result = await request(app).post("/api/ai/chatgpt/generate").set("Host", host).set("Origin", origin).send({});
    expect(result.status).toBe(429);
    expect(result.body.diagnostic).toMatchObject({ providerStatus: 429, action: "Check ChatGPT Usage." });
    assistant.generate.mockRejectedValueOnce(new Error("private-token-internal-path"));
    expect(JSON.stringify((await request(app).post("/api/ai/chatgpt/generate").set("Host", host).set("Origin", origin).send({})).body)).not.toContain("private-token");
  });
  it("prevents concurrent mutation while a model request is running", async () => {
    let finish;
    const assistant = mockAssistant();
    assistant.models.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const app = createApp({ chatGptAssistant: assistant });
    const first = request(app).post("/api/ai/chatgpt/models").set("Host", host).set("Origin", origin).send({}).then((result) => result);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    expect((await request(app).post("/api/ai/chatgpt/sign-in").set("Host", host).set("Origin", origin).send({})).status).toBe(409);
    expect((await request(app).get("/api/ai/chatgpt/status").set("Host", host)).status).toBe(200);
    finish({ models: [] });
    expect((await first).status).toBe(200);
    expect((await request(app).post("/api/ai/chatgpt/sign-in").set("Host", host).set("Origin", origin).send({})).status).toBe(200);
  });
  it("never serves the SPA as connector data when a route is missing or disabled", async () => {
    const disabled = createApp();
    const missing = await request(disabled).get("/local-bridge/scenarios");
    expect(missing.status).toBe(404);
    expect(missing.type).toBe("application/json");
    expect(missing.body.error).toBe("connector_unavailable");
    const enabled = createApp({ bridgeCode: "manual", bridgeOrigin: "https://class.example" });
    const unknown = await request(enabled).get("/local-bridge/unknown").set("Host", host).set("Origin", "https://class.example").set("X-QA-Bridge-Code", "manual");
    expect(unknown.status).toBe(404);
    expect(unknown.type).toBe("application/json");
    expect(unknown.headers["access-control-allow-origin"]).toBe("https://class.example");
  });
});
