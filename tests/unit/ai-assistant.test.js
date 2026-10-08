import { describe, expect, it, vi } from "vitest";
import { generateAiCases, listGeminiModels } from "../../src/domain/ai-assistant.js";

const input = { topic: "unit", requirement: "Check equality at the threshold", apiKey: "fake-private-test-key", model: "gemini-test" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

describe("Gemini diagnostics and response safety", () => {
  it.each([[400, "ai_invalid_request"], [401, "ai_key_rejected"], [402, "ai_billing"], [403, "ai_key_rejected"], [404, "ai_model_unavailable"], [408, "ai_provider_unavailable"], [429, "ai_quota"], [500, "ai_provider_unavailable"], [503, "ai_provider_unavailable"]])("classifies provider HTTP %i", async (status, error) => {
    const result = await generateAiCases({ ...input, fetchImpl: async () => json({ error: { message: input.apiKey } }, status) });
    expect(result.error).toBe(error);
    expect(result.diagnostic).toMatchObject({ source: "Gemini API", providerStatus: status });
    expect(JSON.stringify(result)).not.toContain(input.apiKey);
  });
  it("recognizes invalid keys returned as HTTP 400 without leaking upstream text", async () => {
    const result = await generateAiCases({ ...input, fetchImpl: async () => json({ error: { status: "INVALID_ARGUMENT", message: input.apiKey, details: [null, { reason: "API_KEY_INVALID" }] } }, 400) });
    expect(result.error).toBe("ai_key_rejected");
    expect(result.diagnostic.reason).toBe("API_KEY_INVALID");
    expect(JSON.stringify(result)).not.toContain(input.apiKey);
  });
  it.each(["TimeoutError", "AbortError", "TypeError"])("classifies connection exception %s", async (name) => {
    const result = await generateAiCases({ ...input, fetchImpl: async () => { const error = new Error(input.apiKey); error.name = name; throw error; } });
    expect(result.error).toBe(name === "TypeError" ? "ai_unavailable" : "ai_timeout");
    expect(result.diagnostic.providerStatus).toBeNull();
    expect(JSON.stringify(result)).not.toContain(input.apiKey);
  });
  it("does not display reasoning parts as the final draft and uses default temperature", async () => {
    const fetchImpl = vi.fn(async (_url, options) => {
      expect(JSON.parse(options.body).generationConfig).toEqual({ maxOutputTokens: 4096 });
      return json({ candidates: [{ content: { parts: [{ text: "Internal reasoning", thought: true }, { text: "Final cases" }] } }] });
    });
    expect((await generateAiCases({ ...input, fetchImpl })).text).toBe("Final cases");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it.each([{ promptFeedback: { blockReason: "SAFETY" } }, { candidates: [{ finishReason: "SAFETY", content: { parts: [{ text: "Blocked text" }] } }] }])("reports blocked responses", async (data) => {
    expect((await generateAiCases({ ...input, fetchImpl: async () => json(data) })).error).toBe("ai_content_blocked");
  });
  it.each([null, {}, { candidates: [] }, { candidates: [{ content: { parts: [{ text: "Thinking only", thought: true }] } }] }])("rejects empty drafts %j", async (data) => {
    expect((await generateAiCases({ ...input, fetchImpl: async () => json(data) })).error).toBe("ai_empty_response");
  });
  it("reports unreadable JSON and flags truncated drafts", async () => {
    expect((await generateAiCases({ ...input, fetchImpl: async () => new Response("not-json") })).error).toBe("ai_bad_response");
    const result = await generateAiCases({ ...input, fetchImpl: async () => json({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "Partial case" }] } }] }) });
    expect(result.warning).toContain("truncated");
  });
});

describe("Gemini model listing", () => {
  it("loads all pages, filters malformed models and deduplicates IDs", async () => {
    const model = { name: "models/gemini-test", supportedGenerationMethods: ["generateContent"] };
    const fetchImpl = vi.fn(async (url) => url.includes("pageToken=")
      ? json({ models: [model, { ...model, name: "models/gemini-next" }] })
      : json({ models: [null, { name: 42 }, model, { name: "models/embedding", supportedGenerationMethods: ["embedContent"] }], nextPageToken: "page 2" }));
    expect((await listGeminiModels({ apiKey: input.apiKey, fetchImpl })).models.map((model) => model.id)).toEqual(["gemini-test", "gemini-next"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toContain("pageToken=page+2");
  });
  it("does not publish an incomplete list when pagination loops", async () => {
    const result = await listGeminiModels({ apiKey: input.apiKey, fetchImpl: async () => json({ models: [], nextPageToken: "same" }) });
    expect(result.error).toBe("ai_bad_response");
    expect(result.models).toBeUndefined();
  });
  it("distinguishes malformed JSON, provider rejection and network failure", async () => {
    expect((await listGeminiModels({ apiKey: input.apiKey, fetchImpl: async () => new Response("bad") })).error).toBe("ai_bad_response");
    expect((await listGeminiModels({ apiKey: input.apiKey, fetchImpl: async () => json({}, 403) })).error).toBe("ai_key_rejected");
    expect((await listGeminiModels({ apiKey: input.apiKey, fetchImpl: async () => { throw new TypeError("network"); } })).error).toBe("ai_unavailable");
  });
});
