import express from "express";
import { pbkdf2, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import { evaluateThresholds, percentile } from "../public/shared/evaluation.js";
import { validatePlan } from "../public/shared/plan-rules.js";
import { perfScenarios } from "./domain/perf-scenarios.js";
import { aiTopics, generateAiCases, listGeminiModels, validGeminiModel } from "./domain/ai-assistant.js";
import { createLocalPerfRunner } from "./domain/local-perf-runner.js";
import { scenarioWithPeak } from "../public/shared/perf-profile.js";

const deriveKey = promisify(pbkdf2);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(currentDir, "../public");
const appVersion = JSON.parse(readFileSync(path.resolve(currentDir, "../package.json"), "utf8")).version;
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

export function createApp({ aiFetch = fetch, perfRunner = createLocalPerfRunner(), bridgeCode = "", bridgeOrigin = "", bridgeSession = null } = {}) {
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

  app.get("/api/version", (_request, response) => {
    const commit = process.env.RENDER_GIT_COMMIT || "";
    response.json({ version: appVersion, commit: /^[a-f0-9]{7,40}$/i.test(commit) ? commit : null });
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

  if (bridgeCode && bridgeOrigin && process.env.NODE_ENV !== "production") {
    app.use("/local-bridge", (request, response, next) => {
      const origin = request.get("origin");
      const host = request.get("host") || "";
      const address = request.socket.remoteAddress || "";
      if (origin !== bridgeOrigin || !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host)
        || !/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(address)) {
        return response.status(403).json({ error: "bridge_forbidden" });
      }
      response.setHeader("Access-Control-Allow-Origin", bridgeOrigin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Private-Network", "true");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-QA-Bridge-Code");
      if (request.method === "OPTIONS") return response.sendStatus(204);
      const token = request.get("x-qa-bridge-code");
      if (!(bridgeSession ? bridgeSession.accepts(token) : token === bridgeCode)) return response.status(401).json({ error: "bridge_code_invalid", message: "Pairing code is incorrect." });
      next();
    });
    app.get("/local-bridge/status", async (_request, response) => response.json(await perfRunner.latest()));
    app.get("/local-bridge/runs/latest", async (_request, response) => response.json(await perfRunner.latest()));
    app.get("/local-bridge/metrics", (_request, response) => response.json(telemetry.snapshot()));
    app.get("/local-bridge/probe", perfWork);
    app.post("/local-bridge/runs", (request, response) => {
      const { scenario, peakVus } = request.body ?? {};
      if (!perfScenarios[scenario]) return response.status(400).json({ error: "invalid_run", message: "Choose a valid scenario." });
      try { scenarioWithPeak(scenario, perfScenarios[scenario], peakVus); }
      catch (error) { return response.status(400).json({ error: "invalid_run", message: error.message }); }
      const result = perfRunner.start(scenario, peakVus);
      return response.status(result.status).json(result.ok ? { run: result.run } : { error: result.error, message: result.message });
    });
  }

  async function perfWork(request, response, next) {
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
  }
  app.get("/api/perf/work", perfWork);

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
      personalKeySupported: true,
    });
  });

  function aiCredentials(body) {
    if (body?.mode === "personal") {
      const key = body.apiKey;
      if (typeof key !== "string" || key.length < 20 || key.length > 300 || /\s/.test(key)) return null;
      return { key };
    }
    if (!aiAvailable || body?.accessCode !== aiAccessCode) return null;
    return { key: aiKey };
  }

  app.post("/api/ai/models", async (request, response) => {
    const credentials = aiCredentials(request.body);
    if (!credentials) return response.status(403).json({ error: "ai_access_denied", message: "Enter a valid group code or personal API key." });
    const result = await listGeminiModels({ apiKey: credentials.key, fetchImpl: aiFetch });
    return response.status(result.ok ? 200 : result.status).json(result.ok ? { models: result.models } : { error: "model_list_failed", message: result.message });
  });

  app.post("/api/ai/generate", async (request, response) => {
    const { topic, requirement, model } = request.body ?? {};
    if (!aiTopics.has(topic) || typeof requirement !== "string" || requirement.trim().length < 10 || requirement.trim().length > 500) {
      return response.status(400).json({ error: "invalid_ai_request", message: "Choose a topic and enter a requirement of 10 to 500 characters." });
    }
    if (request.body?.mode !== "personal" && !aiAvailable) return response.status(503).json({ error: "ai_not_configured", message: "Gemini is not configured on this server." });
    const credentials = aiCredentials(request.body);
    if (!credentials) return response.status(403).json({ error: "ai_access_denied", message: "Enter a valid group code or personal API key." });
    const chosenModel = model || aiModel;
    if (!validGeminiModel(chosenModel)) return response.status(400).json({ error: "invalid_model", message: "Choose a Gemini text model." });
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
      const result = await generateAiCases({ topic, requirement: requirement.trim(), apiKey: credentials.key, model: chosenModel, fetchImpl: aiFetch });
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
  const freshAssetHeaders = { "Cache-Control": "no-store" };
  app.get("/vendor/html2canvas.js", (_request, response) => response.sendFile(path.resolve(currentDir, "../node_modules/html2canvas/dist/html2canvas.esm.js"), { headers: freshAssetHeaders }));
  app.use(express.static(publicDir, { etag: false, lastModified: false, setHeaders: (response) => response.set(freshAssetHeaders) }));
  app.get("/{*path}", (_request, response) => response.sendFile(path.join(publicDir, "index.html"), { headers: freshAssetHeaders }));

  return app;
}
