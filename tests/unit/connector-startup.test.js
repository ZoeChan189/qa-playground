import { describe, expect, it, vi } from "vitest";
import { readJson } from "../../public/shared/http-json.js";
import { inspectConnector, verifyConnector } from "../../src/domain/connector-startup.js";

const json = (data, status = 200) => Response.json(data, { status });
describe("connector startup compatibility", () => {
  it("explains HTML without leaking its body", async () => {
    await expect(readJson(new Response("<!doctype html>secret", { headers: { "Content-Type": "text/html" } }), "Local connector")).rejects.toThrow(/older QA Lab/);
    await expect(readJson(new Response("<!doctype html>secret"), "AI service")).rejects.not.toThrow(/secret|Unexpected token/);
  });
  it.each(["null", "[]", "broken", "42"])("rejects non-object JSON: %s", async (text) => {
    await expect(readJson(new Response(text, { headers: { "Content-Type": "application/json" } }))).rejects.toThrow(/invalid JSON/);
  });
  it("starts only when nothing is listening, not when a port is busy or unresponsive", async () => {
    expect(await inspectConnector({}, { fetchImpl: async () => { throw Object.assign(new Error(), { cause: { code: "ECONNREFUSED" } }); } })).toBe(false);
    await expect(inspectConnector({}, { fetchImpl: async () => { throw new Error("timeout"); } })).rejects.toThrow(/port 4173/);
    await expect(inspectConnector({}, { fetchImpl: async () => json({ service: "another-app" }) })).rejects.toThrow(/another application/);
  });
  it.each(["1.1.0", "1.2.0", "0.9.9", "bad", "2.0.0", "9.3.1", "1.3.", "1..3", "1.3. "])("rejects incompatible server %s before pairing", async (version) => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ service: "qa-lab" })).mockResolvedValueOnce(json({ version }));
    await expect(inspectConnector({}, { fetchImpl })).rejects.toThrow(/older or incompatible/);
  });
  it("pairs only with compatible JSON scenario routes", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ service: "qa-lab" })).mockResolvedValueOnce(json({ version: "1.3.0" }));
    expect(await inspectConnector({}, { fetchImpl })).toBe(true);
    const pair = { origin: "https://class.example", token: "private-tab-token" };
    const fetchScenario = vi.fn(async () => json({ scenarios: Object.fromEntries(["load", "stress", "spike", "soak"].map((name) => [name, { stages: [] }])) }));
    await verifyConnector(pair, { fetchImpl: fetchScenario });
    expect(fetchScenario.mock.calls[0][1].headers.Origin).toBe(pair.origin);
    await expect(verifyConnector(pair, { fetchImpl: async () => new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } }) })).rejects.toThrow(/not test data/);
  });
});
