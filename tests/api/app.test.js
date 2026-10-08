import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { createBridgeSession } from "../../src/domain/local-bridge.js";

let app;
beforeEach(() => { app = createApp(); });
afterEach(() => vi.unstubAllEnvs());

describe("QA Lab API", () => {
  it("accepts an automatically paired token and rejects a different website", async () => {
    const origin = "https://class.example";
    const session = createBridgeSession({ origin, code: "manual" });
    const token = "b".repeat(64);
    const bridge = createApp({ bridgeSession: session, bridgeCode: session.code, bridgeOrigin: origin, perfRunner: { latest: async () => ({ canRun: true }), start: () => {} } });
    const get = () => request(bridge).get("/local-bridge/status").set("Host", "127.0.0.1:4173").set("Origin", origin).set("X-QA-Bridge-Code", token);
    expect((await get()).status).toBe(401);
    session.pair({ origin, token });
    expect((await get()).body.canRun).toBe(true);
    expect((await request(bridge).get("/local-bridge/status").set("Host", "127.0.0.1:4173").set("Origin", "https://evil.example").set("X-QA-Bridge-Code", token)).status).toBe(403);
  });
  it("starts k6 only from a local same-origin page and validates the profile", async () => {
    const perfRunner = {
      latest: vi.fn().mockResolvedValue({ canRun: true, reason: null, run: null }),
      start: vi.fn().mockReturnValue({ ok: true, status: 202, run: { id: "new-run", status: "running" } }),
    };
    const localApp = createApp({ perfRunner });
    expect((await request(localApp).get("/api/perf/runs/latest")).body.canRun).toBe(true);
    const post = (body) => request(localApp).post("/api/perf/runs")
      .set("Host", "localhost:4173").set("Origin", "http://localhost:4173").send(body);
    expect((await post({ scenario: "stress", peakVus: 40 })).status).toBe(202);
    expect(perfRunner.start).toHaveBeenCalledWith("stress", 40);
    expect((await post({ scenario: "spike", peakVus: 4 })).status).toBe(400);
    expect((await post({ scenario: "unknown", peakVus: 40 })).status).toBe(400);
    expect((await request(localApp).post("/api/perf/runs").set("Host", "localhost:4173")
      .set("Origin", "https://example.com").send({ scenario: "stress", peakVus: 40 })).status).toBe(403);
    expect(perfRunner.start).toHaveBeenCalledTimes(1);
  });

  it("pairs a hosted page with the loopback k6 bridge without exposing the code", async () => {
    const perfRunner = {
      latest: vi.fn().mockResolvedValue({ canRun: true, run: null }),
      start: vi.fn().mockReturnValue({ ok: true, status: 202, run: { id: "bridge-run", status: "running" } }),
    };
    const bridge = createApp({ perfRunner, bridgeCode: "secret-pair-code", bridgeOrigin: "https://class.example" });
    const headers = (call) => call.set("Host", "127.0.0.1:4173").set("Origin", "https://class.example");
    const preflight = await headers(request(bridge).options("/local-bridge/status"))
      .set("Access-Control-Request-Private-Network", "true");
    expect(preflight.status).toBe(204);
    expect(preflight.headers["access-control-allow-private-network"]).toBe("true");
    expect((await headers(request(bridge).get("/local-bridge/status"))).status).toBe(401);
    expect((await headers(request(bridge).get("/local-bridge/status")).set("X-QA-Bridge-Code", "secret-pair-code")).body.canRun).toBe(true);
    expect((await headers(request(bridge).get("/local-bridge/metrics")).set("X-QA-Bridge-Code", "secret-pair-code")).body.capacity).toBe(24);
    expect((await headers(request(bridge).get("/local-bridge/probe?work=1")).set("X-QA-Bridge-Code", "secret-pair-code")).body.iterations).toBe(1000);
    expect((await request(bridge).get("/local-bridge/status").set("Host", "127.0.0.1:4173")
      .set("Origin", "https://evil.example").set("X-QA-Bridge-Code", "secret-pair-code")).status).toBe(403);
    expect((await headers(request(bridge).post("/local-bridge/runs")).set("X-QA-Bridge-Code", "secret-pair-code")
      .send({ scenario: "spike", peakVus: 4 })).status).toBe(400);
    expect((await headers(request(bridge).post("/local-bridge/runs")).set("X-QA-Bridge-Code", "secret-pair-code")
      .send({ scenario: "stress", peakVus: 40 })).status).toBe(202);
    expect(perfRunner.start).toHaveBeenCalledWith("stress", 40);
  });

  it("exposes health, all four profiles and the case catalog", async () => {
    const health = await request(app).get("/api/health");
    expect(health.status).toBe(200);
    expect(health.body.service).toBe("qa-lab");
    const profiles = await request(app).get("/api/perf/scenarios");
    expect(Object.keys(profiles.body.scenarios)).toEqual(["load", "stress", "spike", "soak"]);
    expect((await request(app).get("/api/cases")).body.cases).toHaveLength(8);
  });

  it("does actual bounded work and reports real server measurements", async () => {
    const result = await request(app).get("/api/perf/work?work=10");
    expect(result.status).toBe(200);
    expect(result.body.iterations).toBe(10_000);
    expect(result.body.digestPrefix).toHaveLength(12);
    expect(result.body.serviceMs).toBeGreaterThan(0);
    expect(result.body.heapUsedMb).toBeGreaterThan(0);
    const metrics = await request(app).get("/api/perf/metrics");
    expect(metrics.body.completed).toBe(1);
    expect(metrics.body.p95Ms).toBeGreaterThan(0);
    expect(metrics.body.active).toBe(0);
  });

  it("rejects invalid work before spending CPU time", async () => {
    for (const value of ["0", "101", "Infinity", "-1", "1.5"]) {
      expect((await request(app).get(`/api/perf/work?work=${value}`)).status).toBe(400);
    }
    expect((await request(app).get("/api/perf/metrics")).body.completed).toBe(0);
  });

  it("rejects work above the concurrent job cap", async () => {
    const responses = await Promise.all(Array.from({ length: 35 }, () => request(app).get("/api/perf/work?work=100")));
    expect(responses.some((response) => response.status === 503)).toBe(true);
    expect(responses.every((response) => [200, 503].includes(response.status))).toBe(true);
    const metrics = (await request(app).get("/api/perf/metrics")).body;
    expect(metrics.peakActive).toBe(24);
    expect(metrics.rejected).toBeGreaterThan(0);
  });

  it("rate-limits the expensive endpoint in production mode", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const publicApp = createApp();
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
    expect((await request(publicApp).get("/api/perf/work?work=1")).status).toBe(200);
    expect((await request(publicApp).get("/api/perf/work?work=1")).status).toBe(200);
    const limited = await request(publicApp).get("/api/perf/work?work=1");
    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBe("1");
  });

  it("classifies metric boundaries and returns field errors", async () => {
    const valid = { p95Ms: 280, errorRate: 0.005, p95LimitMs: 500, errorLimit: 0.01 };
    expect((await request(app).post("/api/evaluate").send(valid)).body.passed).toBe(true);
    expect((await request(app).post("/api/evaluate").send({ ...valid, p95Ms: 500 })).body.passed).toBe(false);
    const invalid = await request(app).post("/api/evaluate").send({ ...valid, p95Ms: -1 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.fields.p95Ms).toBeTruthy();
  });

  it("creates, retrieves and validates test plans", async () => {
    const body = { name: "Checkout spike", scenario: "spike", targetVus: 45, notes: "classroom" };
    const created = await request(app).post("/api/plans").send(body);
    expect(created.status).toBe(201);
    expect((await request(app).get(`/api/plans/${created.body.plan.id}`)).body.plan.name).toBe(body.name);
    expect((await request(app).get("/api/plans/not-here")).status).toBe(404);
    const invalid = await request(app).post("/api/plans").send({ ...body, targetVus: 100 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.fields.targetVus).toBeTruthy();
  });

  it("returns JSON for unknown routes and malformed request bodies", async () => {
    expect((await request(app).get("/api/nope")).body.error).toBe("not_found");
    const malformed = await request(app).post("/api/evaluate").set("Content-Type", "application/json").send("{broken");
    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toBe("invalid_json");
  });

  it("keeps AI disabled without a key or a production access code", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    let aiApp = createApp();
    expect((await request(aiApp).get("/api/ai/status")).body).toMatchObject({ available: false, reason: "missing_key" });
    expect((await request(aiApp).post("/api/ai/generate").send({ topic: "unit", requirement: "A valid metric passes." })).status).toBe(503);

    vi.stubEnv("GEMINI_API_KEY", "test-key-not-real");
    vi.stubEnv("AI_DEMO_ACCESS_CODE", "");
    aiApp = createApp();
    expect((await request(aiApp).get("/api/ai/status")).body).toMatchObject({ available: false, reason: "missing_access_code" });
    vi.stubEnv("NODE_ENV", "development");
    expect((await request(createApp()).get("/api/ai/status")).body.available).toBe(false);
  });

  it("validates and protects a successful Gemini request", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GEMINI_API_KEY", "test-key-not-real");
    vi.stubEnv("AI_DEMO_ACCESS_CODE", "classroom-demo-code");
    const aiFetch = vi.fn(async (_url, options) => {
      expect(options.headers["x-goog-api-key"]).toBe("test-key-not-real");
      const sent = JSON.parse(options.body);
      expect(_url).toContain("/models/gemini-3.5-flash-lite:generateContent");
      expect(sent.contents[0].parts[0].text).toContain("equality fails");
      expect(options.body).not.toContain("classroom-demo-code");
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "U01: equality fails" }] } }] }), { status: 200 });
    });
    const aiApp = createApp({ aiFetch });
    expect((await request(aiApp).get("/api/ai/status")).body).toMatchObject({ available: true, requiresCode: true });
    const body = { topic: "unit", requirement: "Check a threshold boundary at equality.", accessCode: "classroom-demo-code" };
    expect((await request(aiApp).post("/api/ai/generate").send({ ...body, topic: "unknown" })).status).toBe(400);
    expect((await request(aiApp).post("/api/ai/generate").send({ ...body, requirement: "short" })).status).toBe(400);
    expect((await request(aiApp).post("/api/ai/generate").send({ ...body, accessCode: "wrong" })).status).toBe(403);
    expect(aiFetch).not.toHaveBeenCalled();
    const result = await request(aiApp).post("/api/ai/generate").send(body);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ text: "U01: equality fails", model: "gemini-3.5-flash-lite" });
    expect(JSON.stringify(result.body)).not.toContain("test-key-not-real");
    expect(aiFetch).toHaveBeenCalledTimes(1);
  });

  it("does not leak provider errors and limits AI requests", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GEMINI_API_KEY", "test-key-not-real");
    vi.stubEnv("AI_DEMO_ACCESS_CODE", "classroom-demo-code");
    const body = { topic: "performance", requirement: "Check spike recovery after 45 VUs.", accessCode: "classroom-demo-code" };
    const failed = createApp({ aiFetch: async () => new Response("private upstream detail", { status: 429 }) });
    const quota = await request(failed).post("/api/ai/generate").send(body);
    expect(quota.status).toBe(503);
    expect(quota.body.error).toBe("ai_quota");
    expect(JSON.stringify(quota.body)).not.toContain("private upstream detail");

    const aiApp = createApp({ aiFetch: async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Draft" }] } }] }), { status: 200 }) });
    for (let index = 0; index < 20; index += 1) {
      expect((await request(aiApp).post("/api/ai/generate").send(body)).status).toBe(200);
    }
    const limited = await request(aiApp).post("/api/ai/generate").send(body);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("accepts a personal key only for the request and lists available text models", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("AI_DEMO_ACCESS_CODE", "");
    const key = "personal-test-key-long-enough";
    const aiFetch = vi.fn(async (url, options) => {
      expect(options.headers["x-goog-api-key"]).toBe(key);
      if (url.includes("/models?")) return new Response(JSON.stringify({ models: [
        { name: "models/gemini-2.5-flash", displayName: "Gemini Flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/text-embedding", supportedGenerationMethods: ["embedContent"] },
      ] }), { status: 200 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "A test draft" }] } }] }), { status: 200 });
    });
    const personalApp = createApp({ aiFetch });
    const models = await request(personalApp).post("/api/ai/models").send({ mode: "personal", apiKey: key });
    expect(models.body.models).toEqual([{ id: "gemini-2.5-flash", label: "Gemini Flash" }]);
    const result = await request(personalApp).post("/api/ai/generate").send({ mode: "personal", apiKey: key, model: "gemini-2.5-flash", topic: "api", requirement: "Check the health endpoint response." });
    expect(result.status).toBe(200);
    expect(result.body.model).toBe("gemini-2.5-flash");
    expect(JSON.stringify(result.body)).not.toContain(key);
    expect((await request(personalApp).post("/api/ai/generate").send({ mode: "personal", apiKey: "bad", model: "gemini-2.5-flash", topic: "api", requirement: "Check the health endpoint response." })).status).toBe(403);
  });
});
