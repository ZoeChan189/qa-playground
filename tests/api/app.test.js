import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";

let app;
beforeEach(() => { app = createApp(); });
afterEach(() => vi.unstubAllEnvs());

describe("QA Lab API", () => {
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
      expect(sent.store).toBe(false);
      expect(sent.model).toBe("gemini-3.5-flash-lite");
      expect(sent.input).toContain("equality fails");
      expect(options.body).not.toContain("classroom-demo-code");
      return new Response(JSON.stringify({ steps: [{ type: "model_output", content: [{ type: "text", text: "U01: equality fails" }] }] }), { status: 200 });
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

    const aiApp = createApp({ aiFetch: async () => new Response(JSON.stringify({ steps: [{ type: "model_output", content: [{ type: "text", text: "Draft" }] }] }), { status: 200 }) });
    for (let index = 0; index < 20; index += 1) {
      expect((await request(aiApp).post("/api/ai/generate").send(body)).status).toBe(200);
    }
    const limited = await request(aiApp).post("/api/ai/generate").send(body);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
  });
});
