import express from "express";
import { pbkdf2, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { evaluateThresholds, percentile } from "../public/shared/evaluation.js";
import { validatePlan } from "../public/shared/plan-rules.js";
import { perfScenarios } from "./domain/perf-scenarios.js";

const deriveKey = promisify(pbkdf2);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(currentDir, "../public");
const iconsDir = path.resolve(currentDir, "../node_modules/lucide-static/icons");
const maxInflight = Math.max(1, Math.min(64, Number(process.env.PERF_MAX_INFLIGHT) || 24));

function createTelemetry() {
  const durations = [];
  const startedAt = Date.now();
  let active = 0;
  let peakActive = 0;
  let completed = 0;
  let rejected = 0;

  return {
    get active() { return active; },
    get limit() { return maxInflight; },
    begin() {
      active += 1;
      peakActive = Math.max(peakActive, active);
      return performance.now();
    },
    finish(started) {
      active -= 1;
      completed += 1;
      durations.push(performance.now() - started);
      if (durations.length > 1000) durations.shift();
    },
    reject() { rejected += 1; },
    snapshot() {
      return {
        active,
        peakActive,
        completed,
        rejected,
        capacity: maxInflight,
        p50Ms: percentile(durations, 50),
        p95Ms: percentile(durations, 95),
        sampleCount: durations.length,
        heapUsedMb: Math.round((process.memoryUsage().heapUsed / 1048576) * 10) / 10,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      };
    },
  };
}

export function createApp() {
  const app = express();
  const telemetry = createTelemetry();
  const plans = new Map();
  const publicWorkLimit = process.env.NODE_ENV === "production" ? 2 : Infinity;
  let publicWindowStart = Date.now();
  let publicWindowCount = 0;

  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.use((request, response, next) => {
    if (request.path.startsWith("/api/")) response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ready", service: "qa-lab" });
  });

  app.get("/api/perf/scenarios", (_request, response) => {
    response.json({ scenarios: perfScenarios, target: "/api/perf/work", localOnlyByDefault: true });
  });

  app.get("/api/perf/metrics", (_request, response) => {
    response.json(telemetry.snapshot());
  });

  app.get("/api/perf/work", async (request, response, next) => {
    const rawWork = String(request.query.work ?? "30");
    if (!/^\d{1,3}$/.test(rawWork) || Number(rawWork) < 1 || Number(rawWork) > 100) {
      return response.status(400).json({ error: "invalid_work", message: "work must be an integer from 1 to 100." });
    }
    const now = Date.now();
    if (now - publicWindowStart >= 1000) {
      publicWindowStart = now;
      publicWindowCount = 0;
    }
    if (publicWindowCount >= publicWorkLimit) {
      response.setHeader("Retry-After", "1");
      return response.status(429).json({ error: "public_rate_limit", message: "Public demo allows two work requests per second." });
    }
    publicWindowCount += 1;
    if (telemetry.active >= telemetry.limit) {
      telemetry.reject();
      response.setHeader("Retry-After", "1");
      return response.status(503).json({ error: "capacity_reached", message: "The work queue is full." });
    }

    const work = Number(rawWork);
    const started = telemetry.begin();
    try {
      const digest = await deriveKey("qa-lab-workload", "classroom-salt", work * 1000, 32, "sha256");
      const serviceMs = Math.round((performance.now() - started) * 100) / 100;
      return response.json({
        ok: true,
        iterations: work * 1000,
        digestPrefix: digest.toString("hex").slice(0, 12),
        serviceMs,
        activeJobs: telemetry.active,
        heapUsedMb: Math.round((process.memoryUsage().heapUsed / 1048576) * 10) / 10,
      });
    } catch (error) {
      return next(error);
    } finally {
      telemetry.finish(started);
    }
  });

  app.post("/api/evaluate", (request, response) => {
    const result = evaluateThresholds(request.body);
    if (!result.valid) return response.status(400).json({ error: "invalid_metrics", fields: result.errors });
    return response.json(result);
  });

  app.post("/api/plans", (request, response) => {
    const result = validatePlan(request.body);
    if (!result.valid) return response.status(400).json({ error: "invalid_plan", fields: result.errors });
    const plan = { id: randomUUID(), ...result.value, createdAt: new Date().toISOString() };
    plans.set(plan.id, plan);
    if (plans.size > 100) plans.delete(plans.keys().next().value);
    return response.status(201).json({ plan });
  });

  app.get("/api/plans/:id", (request, response) => {
    const plan = plans.get(request.params.id);
    if (!plan) return response.status(404).json({ error: "plan_not_found" });
    return response.json({ plan });
  });

  app.get("/api/cases", (_request, response) => {
    response.json({ cases: [
      { id: "UNIT-01", topic: "unit", expected: "Valid metrics are classified by both thresholds." },
      { id: "API-01", topic: "api", expected: "Malformed metrics return HTTP 400." },
      { id: "E2E-01", topic: "e2e", expected: "A reviewed test plan can be saved and retrieved." },
      { id: "MOB-01", topic: "mobile", expected: "No page-level horizontal overflow at mobile width." },
      { id: "VIS-01", topic: "visual", expected: "The baseline specimen matches its screenshot." },
      { id: "PERF-01", topic: "performance", expected: "Measure p95, errors and throughput during load." },
      { id: "AI-01", topic: "ai", expected: "Generated test code is reviewed and run before acceptance." },
      { id: "CI-01", topic: "ci", expected: "A push runs unit, API and browser checks." },
    ] });
  });

  app.use("/api", (_request, response) => response.status(404).json({ error: "not_found" }));
  app.use((error, _request, response, next) => {
    if (error instanceof SyntaxError && "body" in error) {
      return response.status(400).json({ error: "invalid_json", message: "Request body must be valid JSON." });
    }
    return next(error);
  });

  app.use("/icons", express.static(iconsDir, { maxAge: "1d" }));
  app.use(express.static(publicDir, { maxAge: "5m" }));
  app.get("/{*path}", (_request, response) => response.sendFile(path.join(publicDir, "index.html")));

  return app;
}
