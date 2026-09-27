import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp, credentials } from "../../src/app.js";

let app;

async function authorizedAgent() {
  const login = await request(app).post("/api/auth/login").send(credentials);
  return { token: login.body.token, auth: { Authorization: `Bearer ${login.body.token}` } };
}

beforeEach(() => {
  app = createApp();
});

describe("API contract", () => {
  it("reports health and handles unknown API routes as JSON 404", async () => {
    expect((await request(app).get("/api/health")).body.status).toBe("ready");
    const missing = await request(app).get("/api/not-a-route");
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("not_found");
  });

  it("rejects wrong credentials, a locked account and unauthenticated task access", async () => {
    expect((await request(app).post("/api/auth/login").send({ email: "qa@example.com", password: "wrong" })).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email: "locked@example.com", password: "Test123!" })).status).toBe(423);
    expect((await request(app).get("/api/tasks")).status).toBe(401);
  });

  it("keeps task data independent for each signed-in user", async () => {
    const first = await authorizedAgent();
    const second = await authorizedAgent();
    const task = {
      title: "Private task",
      ownerEmail: "qa@example.com",
      priority: "high",
      status: "todo",
      dueDate: "2028-02-29",
    };
    const created = await request(app).post("/api/tasks").set(first.auth).send(task);
    expect(created.status).toBe(201);
    expect((await request(app).get("/api/tasks").set(first.auth)).body.tasks).toHaveLength(4);
    expect((await request(app).get("/api/tasks").set(second.auth)).body.tasks).toHaveLength(3);
  });

  it("validates, creates, filters, updates, deletes and resets tasks", async () => {
    const { auth } = await authorizedAgent();
    const invalid = await request(app).post("/api/tasks").set(auth).send({ title: "x", ownerEmail: "bad", dueDate: "2028-02-30" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.fields).toHaveProperty("dueDate");

    const task = {
      title: "New task",
      ownerEmail: "qa@example.com",
      priority: "high",
      status: "todo",
      dueDate: "2028-02-29",
    };
    const created = await request(app).post("/api/tasks").set(auth).send(task);
    expect(created.status).toBe(201);
    const id = created.body.task.id;
    const filtered = await request(app).get("/api/tasks?search=New&priority=high").set(auth);
    expect(filtered.body.tasks.map((item) => item.id)).toEqual([id]);
    expect(filtered.body.stats.total).toBe(1);
    expect((await request(app).put(`/api/tasks/${id}`).set(auth).send({ ...task, status: "done" })).body.task.status).toBe("done");
    expect((await request(app).delete(`/api/tasks/${id}`).set(auth)).status).toBe(204);
    expect((await request(app).put(`/api/tasks/${id}`).set(auth).send(task)).status).toBe(404);
    expect((await request(app).post("/api/test/reset").set(auth)).status).toBe(200);
    expect((await request(app).get("/api/tasks").set(auth)).body.tasks).toHaveLength(3);
  });

  it("makes controlled faults visible to an API client", async () => {
    const { auth } = await authorizedAgent();
    const failure = await request(app).get("/api/tasks").set(auth).set("X-Demo-Faults", "api-error");
    expect(failure.status).toBe(503);
    const started = Date.now();
    const slow = await request(app).get("/api/tasks").set(auth).set("X-Demo-Faults", "api-delay");
    expect(slow.status).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1100);
    const bypass = await request(app).post("/api/tasks").set(auth).set("X-Demo-Faults", "validation-bypass").send({ title: "x" });
    expect(bypass.status).toBe(201);
  });

  it("provides test ideas and a performance target", async () => {
    expect((await request(app).post("/api/test-ideas").send({ requirement: "Too short" })).status).toBe(400);
    expect((await request(app).post("/api/test-ideas").send({ requirement: "A user can create tasks." })).body.ideas).toHaveLength(6);
    expect((await request(app).get("/api/performance?profile=load")).body.profile).toBe("load");
    expect((await request(app).get("/api/performance?profile=unknown")).status).toBe(400);
    expect((await request(app).get("/api/performance?work=100000")).status).toBe(400);
  });

  it("returns JSON for malformed requests", async () => {
    const bad = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{broken");
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("invalid_json");
    const { auth } = await authorizedAgent();
    const nullTask = await request(app).post("/api/tasks").set(auth).set("Content-Type", "application/json").send("null");
    expect(nullTask.status).toBe(400);
    expect(nullTask.body.error).toBe("invalid_json");
  });
});
