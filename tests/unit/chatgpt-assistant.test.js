import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, rmdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createChatGptAssistant, chatGptFailure, verifyChatGptIdentity } from "../../src/domain/chatgpt-assistant.js";
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from "jose";
import { createChatGptStore } from "../../src/domain/chatgpt-store.js";

const services = [];
afterEach(() => { for (const service of services.splice(0)) service.close(); });
function fixture({ grant = true, events, verifyIdentity, fetchImpl, ...options } = {}) {
  let saved;
  const store = { load: async () => saved, save: async (data) => { saved = structuredClone(data); } };
  const providerFetch = vi.fn(fetchImpl || (async (url) => {
    if (String(url).endsWith("/oauth/token")) return Response.json({ access_token: "private-access-token", refresh_token: "private-refresh-token", id_token: "signed-id-token", token_type: "Bearer", expires_in: 3600,
      scope: grant ? "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct" : "openid email" });
    if (String(url).endsWith("/models")) return Response.json({ models: [{ slug: "gpt-test", display_name: "Test model", visibility: "list" }, { slug: "hidden", visibility: "hide" }] });
    if (String(url).includes("openid-configuration")) return Response.json({ revocation_endpoint: "https://auth.openai.com/revoke" });
    return new Response(null, { status: 200 });
  }));
  const verify = vi.fn(verifyIdentity || (async () => ({ sub: "verified-user", email: "student@example.test" })));
  const stream = vi.fn(async function* () { for (const event of events || [{ type: "response.output_text.delta", delta: "Four test cases" }, { type: "response.completed" }]) yield event; });
  const service = createChatGptAssistant({ store, fetchImpl: providerFetch, verifyIdentity: verify, createStream: stream, ...options });
  services.push(service);
  return { service, store, saved: () => saved, providerFetch, verify, stream };
}
async function callback(f, params = {}, accountId = "") {
  const auth = new URL((await f.service.startSignIn(accountId)).url);
  const url = new URL(auth.searchParams.get("redirect_uri"));
  url.search = new URLSearchParams({ state: auth.searchParams.get("state"), code: "authorization-code", client_id: "oaiapp_test", ...params });
  const response = await fetch(url);
  await response.text();
  return { auth, response };
}

describe("ChatGPT local sign-in", () => {
  it("cryptographically verifies signature, issuer, audience, expiry and nonce", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const keySet = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: "test" }] });
    const sign = (claims = {}) => new SignJWT({ sub: "verified-user", nonce: "expected", ...claims }).setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer("https://auth.openai.com").setAudience("oaiapp_test").setIssuedAt().setExpirationTime("1h").sign(privateKey);
    const token = await sign();
    expect((await verifyChatGptIdentity(token, "oaiapp_test", "expected", keySet)).sub).toBe("verified-user");
    await expect(verifyChatGptIdentity(token, "oaiapp_wrong", "expected", keySet)).rejects.toBeTruthy();
    await expect(verifyChatGptIdentity(token, "oaiapp_test", "wrong", keySet)).rejects.toBeTruthy();
    const expired = await new SignJWT({ sub: "verified-user", nonce: "expected" }).setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer("https://auth.openai.com").setAudience("oaiapp_test").setIssuedAt(0).setExpirationTime(10).sign(privateKey);
    await expect(verifyChatGptIdentity(expired, "oaiapp_test", "expected", keySet)).rejects.toBeTruthy();
    const wrongIssuer = await new SignJWT({ sub: "verified-user", nonce: "expected" }).setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer("https://evil.example").setAudience("oaiapp_test").setIssuedAt().setExpirationTime("1h").sign(privateKey);
    await expect(verifyChatGptIdentity(wrongIssuer, "oaiapp_test", "expected", keySet)).rejects.toBeTruthy();
    const alternate = await generateKeyPair("RS256");
    await expect(verifyChatGptIdentity(token, "oaiapp_test", "expected", createLocalJWKSet({ keys: [{ ...await exportJWK(alternate.publicKey), kid: "test" }] }))).rejects.toBeTruthy();
  });
  it("uses a stable host, fresh PKCE/state/nonce and an already listening loopback callback", async () => {
    const f = fixture();
    const { auth, response } = await callback(f);
    expect(response.status).toBe(200);
    expect(auth.origin).toBe("https://auth.openai.com");
    expect(auth.searchParams.get("client_id")).toBe("dynamic_agent_client");
    expect(auth.searchParams.get("agent_name_hint")).toBe("QA Lab");
    expect(new URL(auth.searchParams.get("redirect_uri")).hostname).toBe("127.0.0.1");
    const tokenBody = f.providerFetch.mock.calls[0][1].body;
    expect(tokenBody.get("client_id")).toBe("oaiapp_test");
    expect(tokenBody.get("redirect_uri")).toBe(auth.searchParams.get("redirect_uri"));
    expect(createHash("sha256").update(tokenBody.get("code_verifier")).digest("base64url")).toBe(auth.searchParams.get("code_challenge"));
    expect(f.verify).toHaveBeenCalledWith("signed-id-token", "oaiapp_test", auth.searchParams.get("nonce"));
    const status = await f.service.status();
    expect(status).toMatchObject({ signedIn: true, planEnabled: true, pending: false });
    expect(status.welcomeRequired).toBe(true);
    await f.service.confirmPlan();
    expect((await f.service.status()).welcomeRequired).toBe(false);
    expect(JSON.stringify(status)).not.toMatch(/private-|signed-id-token|refreshToken|accessToken/);
    const returning = new URL((await f.service.startSignIn(status.activeId)).url);
    expect(returning.searchParams.get("client_id")).toBe("oaiapp_test");
    expect(returning.searchParams.has("agent_name_hint")).toBe(false);
    expect(returning.searchParams.get("ext_agent_host_id")).toBe(auth.searchParams.get("ext_agent_host_id"));
    expect(returning.searchParams.get("state")).not.toBe(auth.searchParams.get("state"));
  });
  it("never exchanges a code with the wrong state", async () => {
    const f = fixture();
    const result = await callback(f, { state: "wrong-state" });
    expect(result.response.status).toBe(400);
    expect(f.providerFetch).not.toHaveBeenCalled();
    expect((await f.service.status()).signedIn).toBe(false);
  });
  it.each([{ error: "access_denied" }, { client_id: "dynamic_agent_client" }, { code: "" }])("handles denied or incomplete registration %j", async (params) => {
    const f = fixture();
    expect((await callback(f, params)).response.status).toBe(400);
    expect(f.providerFetch).not.toHaveBeenCalled();
    expect((await f.service.status()).lastError).toBeTruthy();
  });
  it("does not activate an unverified identity or grant inference from identity scopes alone", async () => {
    const invalid = fixture({ verifyIdentity: async () => { throw new Error("signature-invalid-secret"); } });
    expect((await callback(invalid)).response.status).toBe(400);
    expect((await invalid.service.status()).signedIn).toBe(false);
    expect(JSON.stringify(await invalid.service.status())).not.toContain("signature-invalid-secret");
    const identityOnly = fixture({ grant: false });
    await callback(identityOnly);
    expect(await identityOnly.service.status()).toMatchObject({ signedIn: true, planEnabled: false });
    await expect(identityOnly.service.models()).rejects.toMatchObject({ status: 403 });
  });
  it("rejects changed client IDs and subjects on returning authorization", async () => {
    const f = fixture();
    await callback(f);
    const id = (await f.service.status()).activeId;
    expect((await callback(f, { client_id: "oaiapp_another" }, id)).response.status).toBe(400);
    f.verify.mockResolvedValueOnce({ sub: "different-user" });
    expect((await callback(f, {}, id)).response.status).toBe(400);
    expect((await f.service.status()).activeId).toBe(id);
    expect(f.saved().accounts).toHaveLength(1);
  });
  it("keeps separate registrations, loads only visible account models and completes streamed inference", async () => {
    const f = fixture();
    await callback(f);
    expect((await f.service.models()).models).toEqual([{ id: "gpt-test", label: "Test model" }]);
    await expect(f.service.generate({ topic: "api", requirement: "Check invalid metrics", model: "invented-model" })).rejects.toMatchObject({ status: 400 });
    expect(await f.service.generate({ topic: "api", requirement: "Check invalid metrics", model: "gpt-test" })).toEqual({ text: "Four test cases", model: "gpt-test" });
    expect(f.stream.mock.calls[0][1]).toMatchObject({ store: false, stream: true, input: expect.any(Array) });
    expect(f.stream.mock.calls[0][1]).not.toHaveProperty("max_output_tokens");
    f.verify.mockResolvedValueOnce({ sub: "second-user", email: "student@example.test" });
    await callback(f, { client_id: "oaiapp_second" });
    expect((await f.service.status()).accounts).toHaveLength(2);
  });
  it.each([
    [{ type: "response.output_text.delta", delta: "partial" }],
    [{ type: "response.output_text.delta", delta: "partial" }, { type: "response.incomplete" }],
    [{ type: "response.completed" }],
  ])("rejects incomplete streams instead of returning a successful draft", async (...eventArray) => {
    // it.each spreads array elements into arguments.
    const events = eventArray.filter((event) => event && typeof event === "object" && event.type);
    const f = fixture({ events });
    await callback(f);
    await expect(f.service.generate({ topic: "api", requirement: "Check invalid metrics", model: "gpt-test" })).rejects.toBeTruthy();
  });
  it("preserves a usage-limit error even after the stream starts", async () => {
    const f = fixture({ events: [{ type: "response.output_text.delta", delta: "partial" }, { type: "response.failed", response: { error: { code: "subscription_sharing_usage_limit_exceeded" } } }] });
    await callback(f);
    try { await f.service.generate({ topic: "api", requirement: "Check invalid metrics", model: "gpt-test" }); throw new Error("unexpected success"); }
    catch (error) { expect(chatGptFailure(error)).toMatchObject({ status: 429, body: { error: "subscription_sharing_usage_limit_exceeded" } }); }
  });
  it("serializes rotating refreshes and revokes before clearing tokens on sign-out", async () => {
    const f = fixture();
    await callback(f);
    const saved = f.saved();
    saved.accounts[0].expiresAt = 0;
    const second = createChatGptAssistant({ store: f.store, fetchImpl: f.providerFetch });
    services.push(second);
    await Promise.all([second.models(), second.models()]);
    const refreshes = f.providerFetch.mock.calls.filter(([, options]) => options.body?.get?.("grant_type") === "refresh_token");
    expect(refreshes).toHaveLength(1);
    expect(refreshes[0][1].body.get("client_id")).toBe("oaiapp_test");
    expect((await second.signOut()).revoked).toBe(true);
    expect((await second.status()).signedIn).toBe(false);
    expect(JSON.stringify(f.saved())).not.toMatch(/private-|signed-id-token/);
    expect(f.saved().accounts[0].clientId).toBe("oaiapp_test");
  });
  it("does not expose provider messages or secrets in connection diagnostics", () => {
    const error = Object.assign(new Error("private-access-token"), { status: 403, code: "arbitrary-secret-code" });
    expect(JSON.stringify(chatGptFailure(error))).not.toMatch(/private-access-token|arbitrary-secret-code/);
    expect(chatGptFailure(error).body.diagnostic.providerStatus).toBe(403);
  });
  it("stores credentials atomically outside source; Windows uses current-user encryption", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "qa-chatgpt-store-"));
    const store = createChatGptStore({ directory });
    try {
      expect(await store.load()).toBeNull();
      await store.save({ hostId: "stable-host", token: "private-token-for-store-test" });
      expect(await store.load()).toEqual({ hostId: "stable-host", token: "private-token-for-store-test" });
      if (process.platform === "win32") expect(await readFile(path.join(directory, "credentials.dat"), "utf8")).not.toContain("private-token-for-store-test");
    } finally { await rm(path.join(directory, "credentials.dat"), { force: true }); await rmdir(directory); }
  }, 20_000);
});
