import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";

let app;
beforeEach(() => { app = createApp(); });

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
});
