import express from "express";
import { pbkdf2, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { evaluateThresholds, percentile } from "../public/shared/evaluation.js";
import { validatePlan } from "../public/shared/plan-rules.js";
import { perfScenarios } from "./domain/perf-scenarios.js";
import { aiTopics, generateAiCases } from "./domain/ai-assistant.js";
import { createLocalPerfRunner } from "./domain/local-perf-runner.js";
import { scenarioWithPeak } from "../public/shared/perf-profile.js";

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

export function createApp({ aiFetch = fetch, perfRunner = createLocalPerfRunner() } = {}) {
  const app = express();
  const telemetry = createTelemetry();
  const plans = new Map();
  const aiKey = process.env.GEMINI_API_KEY?.trim() || "";
  const aiAccessCode = process.env.AI_DEMO_ACCESS_CODE?.trim() || "";
  const aiModel = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
  const aiAvailable = Boolean(aiKey && aiAccessCode);
  let aiWindowStart = Date.now();
  let aiWindowCount = 0;
  let aiInflight = 0;
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

  app.get("/api/perf/runs/latest", async (_request, response) => {
    response.json(await perfRunner.latest());
  });

  app.post("/api/perf/runs", (request, response) => {
    const host = request.get("host") || "";
    const origin = request.get("origin") || "";
    const address = request.socket.remoteAddress || "";
    const localHost = /^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host);
    const localAddress = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(address);
    if (!localHost || !localAddress || origin !== `http://${host}`) {
      return response.status(403).json({ error: "local_only", message: "Start k6 only from the local QA Lab page." });
    }
    const { scenario, peakVus } = request.body ?? {};
    if (!perfScenarios[scenario]) {
      return response.status(400).json({ error: "invalid_run", message: "Choose Load, Stress, Spike or Soak." });
    }
    try {
      scenarioWithPeak(scenario, perfScenarios[scenario], peakVus);
    } catch (error) {
      return response.status(400).json({ error: "invalid_run", message: error.message });
    }
    const result = perfRunner.start(scenario, peakVus);
    return response.status(result.status).json(result.ok ? { run: result.run } : { error: result.error, message: result.message });
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

  app.get("/api/ai/status", (_request, response) => {
    response.json({
      available: aiAvailable,
      requiresCode: Boolean(aiAccessCode),
      reason: !aiKey ? "missing_key" : !aiAccessCode ? "missing_access_code" : null,
      model: aiAvailable ? aiModel : null,
    });
  });

  app.post("/api/ai/generate", async (request, response) => {
    if (!aiAvailable) return response.status(503).json({ error: "ai_not_configured", message: "Gemini is not configured on this server." });
    const { topic, requirement, accessCode } = request.body ?? {};
    if (!aiTopics.has(topic) || typeof requirement !== "string" || requirement.trim().length < 10 || requirement.trim().length > 500) {
      return response.status(400).json({ error: "invalid_ai_request", message: "Choose a topic and enter a requirement of 10 to 500 characters." });
    }
    if (aiAccessCode && accessCode !== aiAccessCode) {
      return response.status(403).json({ error: "ai_access_denied", message: "The group access code is incorrect." });
    }
    const now = Date.now();
    if (now - aiWindowStart >= 3_600_000) {
      aiWindowStart = now;
      aiWindowCount = 0;
    }
    if (aiWindowCount >= 20 || aiInflight >= 2) {
      response.setHeader("Retry-After", aiWindowCount >= 20 ? String(Math.ceil((3_600_000 - (now - aiWindowStart)) / 1000)) : "10");
      return response.status(429).json({ error: "ai_rate_limit", message: "AI demo is busy or has reached its hourly limit. Try again later." });
    }
    aiWindowCount += 1;
    aiInflight += 1;
    try {
      const result = await generateAiCases({ topic, requirement: requirement.trim(), apiKey: aiKey, model: aiModel, fetchImpl: aiFetch });
      if (!result.ok) return response.status(result.status).json({ error: result.error, message: result.message });
      return response.json({ text: result.text, model: result.model });
    } finally {
      aiInflight -= 1;
    }
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
