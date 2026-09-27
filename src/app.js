import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { calculateStats, generateTestIdeas, validateTask } from "./domain/task-rules.js";
import { createTaskStore } from "./store.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(currentDir, "../public");

function parseFaults(request) {
  return new Set(
    String(request.header("x-demo-faults") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function filterTasks(tasks, query) {
  const search = String(query.search ?? "").trim().toLowerCase();
  return tasks.filter((task) => {
    const matchesSearch = !search || `${task.title} ${task.ownerEmail}`.toLowerCase().includes(search);
    const matchesStatus = !query.status || task.status === query.status;
    const matchesPriority = !query.priority || task.priority === query.priority;
    return matchesSearch && matchesStatus && matchesPriority;
  });
}

export function createApp() {
  const app = express();
  const sessions = new Map();
  let activePerformanceRequests = 0;
  let soakCounter = 0;

  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  app.use((request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ready", service: "qa-playground" });
  });

  app.post("/api/auth/login", (request, response) => {
    const email = String(request.body?.email ?? "").trim().toLowerCase();
    const password = String(request.body?.password ?? "");

    if (email === "locked@example.com") {
      return response.status(423).json({ error: "account_locked", message: "This demo account is locked." });
    }
    if (email !== "qa@example.com" || password !== "Test123!") {
      return response.status(401).json({ error: "invalid_credentials", message: "Email or password is incorrect." });
    }
    const token = randomUUID();
    sessions.set(token, createTaskStore());
    return response.json({ token, user: { name: "QA Student", email } });
  });

  app.use("/api/tasks", (request, response, next) => {
    const token = request.header("authorization")?.replace(/^Bearer /, "");
    if (!token || !sessions.has(token)) {
      return response.status(401).json({ error: "unauthorized", message: "A valid demo token is required." });
    }
    request.taskStore = sessions.get(token);
    return next();
  });

  app.get("/api/tasks", (request, response) => {
    const faults = parseFaults(request);
    if (faults.has("api-error")) {
      return response.status(503).json({ error: "service_unavailable", message: "Injected API failure." });
    }

    const send = () => {
      const tasks = filterTasks(request.taskStore.list(), request.query);
      response.json({ tasks, stats: calculateStats(tasks) });
    };

    if (faults.has("api-delay")) return setTimeout(send, 1200);
    return send();
  });

  app.post("/api/tasks", (request, response) => {
    const faults = parseFaults(request);
    const validation = validateTask(request.body);
    if (!validation.valid && !faults.has("validation-bypass")) {
      return response.status(400).json({ error: "validation_failed", fields: validation.errors });
    }
    const task = faults.has("validation-bypass") ? request.body : validation.value;
    return response.status(201).json({ task: request.taskStore.create(task) });
  });

  app.put("/api/tasks/:id", (request, response) => {
    const validation = validateTask(request.body);
    if (!validation.valid) {
      return response.status(400).json({ error: "validation_failed", fields: validation.errors });
    }
    const task = request.taskStore.update(request.params.id, validation.value);
    if (!task) return response.status(404).json({ error: "not_found" });
    return response.json({ task });
  });

  app.delete("/api/tasks/:id", (request, response) => {
    if (!request.taskStore.remove(request.params.id)) return response.status(404).json({ error: "not_found" });
    return response.status(204).end();
  });

  app.post("/api/test-ideas", (request, response) => {
    const result = generateTestIdeas(request.body?.requirement);
    if (!result.valid) return response.status(400).json({ error: "validation_failed", message: result.error });
    return response.json(result);
  });

  app.get("/api/performance", (request, response) => {
    const profile = String(request.query.profile ?? "load");
    const work = Number(request.query.work ?? 0);
    if (!["load", "stress", "spike", "soak"].includes(profile) || !Number.isFinite(work) || work < 0 || work > 1000) {
      return response.status(400).json({ error: "invalid_performance_profile" });
    }
    activePerformanceRequests += 1;
    const pressure = Math.max(0, activePerformanceRequests - 8);
    if (profile === "soak") soakCounter += 0.08;

    let delayMs = 18 + work;
    if (profile === "stress") delayMs += Math.pow(pressure, 1.45) * 5;
    if (profile === "spike") delayMs += Math.pow(pressure, 1.6) * 7;
    if (profile === "soak") delayMs += Math.min(soakCounter, 80);
    const shouldFail =
      (profile === "stress" && activePerformanceRequests > 24 && activePerformanceRequests % 5 === 0) ||
      (profile === "spike" && activePerformanceRequests > 18 && activePerformanceRequests % 4 === 0);

    setTimeout(() => {
      const observedActive = activePerformanceRequests;
      activePerformanceRequests -= 1;
      response.status(shouldFail ? 503 : 200).json({
        ok: !shouldFail,
        profile,
        activeRequests: observedActive,
        simulatedMemoryMb: Number((84 + soakCounter).toFixed(2)),
      });
    }, Math.round(delayMs));
  });

  app.post("/api/test/reset", (request, response) => {
    const token = request.header("authorization")?.replace(/^Bearer /, "");
    if (!token || !sessions.has(token)) return response.status(401).json({ error: "unauthorized" });
    sessions.get(token).reset();
    soakCounter = 0;
    response.json({ status: "reset" });
  });

  app.use("/api", (_request, response) => response.status(404).json({ error: "not_found" }));
  app.use((error, _request, response, next) => {
    if (error instanceof SyntaxError && "body" in error) {
      return response.status(400).json({ error: "invalid_json", message: "Request body must be valid JSON." });
    }
    return next(error);
  });

  app.use(express.static(publicDir));
  app.get("/{*path}", (_request, response) => response.sendFile(path.join(publicDir, "index.html")));

  return app;
}

export const credentials = {
  email: "qa@example.com",
  password: "Test123!",
};
