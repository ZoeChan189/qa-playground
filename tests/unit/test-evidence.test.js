import { describe, expect, it } from "vitest";
import { comparePixels, perfDecision } from "../../public/shared/test-evidence.js";
import { createBridgeSession, parseConnectUri } from "../../src/domain/local-bridge.js";

const config = { p95LimitMs: 900, errorLimit: 0.15 };
const summary = (overrides = {}) => ({ metrics: {
  http_reqs: { count: 100 }, http_req_duration: { "p(95)": 80 }, http_req_failed: { value: 0 },
  invalid_success_responses: { count: 0 }, ...overrides,
} });

describe("performance evidence", () => {
  it("uses the limits recorded by the actual run and rejects equality", () => {
    const result = perfDecision(summary({ configured_p95_limit_ms: { value: 80 } }), config, 99);
    expect(result.passed).toBe(false);
    expect(result.checks[0][3]).toBe("FAIL");
    expect(result.p95LimitMs).toBe(80);
  });
  it("does not hide contract breaches or a failed exported threshold", () => {
    expect(perfDecision(summary({ invalid_success_responses: { count: 1 } }), config).passed).toBe(false);
    expect(perfDecision(summary({ checks: { thresholds: { "rate>0.9": true } } }), config).passed).toBe(false);
    expect(perfDecision(summary(), config, 1).passed).toBe(false);
    expect(perfDecision(summary(), config, 0).passed).toBe(true);
    expect(perfDecision(summary({ checks: { thresholds: { "rate>0.9": false } } }), config, 0).passed).toBe(true);
    expect(perfDecision(summary({ checks: { thresholds: { "rate>0.9": { ok: false } } } }), config).passed).toBe(false);
  });
  it("cannot label an empty or impossible run PASS", () => {
    expect(() => perfDecision(summary({ http_reqs: { count: 0 } }), config)).toThrow(/cannot be marked PASS/);
    expect(() => perfDecision(summary({ http_req_failed: { value: 1.5 } }), config)).toThrow();
  });
});

describe("pixel comparison", () => {
  const frame = (data, width = 2) => ({ width, height: 1, data: new Uint8ClampedArray(data) });
  it("measures real differences and tolerates small channel changes", () => {
    const baseline = frame([0, 0, 0, 255, 0, 0, 0, 255]);
    expect(comparePixels(baseline, baseline).passed).toBe(true);
    expect(comparePixels(baseline, frame([10, 0, 0, 255, 0, 0, 0, 255])).changed).toBe(0);
    const changed = comparePixels(baseline, frame([100, 0, 0, 255, 0, 0, 0, 255]));
    expect(changed).toMatchObject({ changed: 1, diffPercent: 50, passed: false });
    expect(comparePixels(baseline, frame([0, 0, 0, 255], 1)).sameSize).toBe(false);
  });
});

describe("local connection links", () => {
  const token = "a".repeat(64);
  const origin = "https://qa-playground-5n74.onrender.com";
  it("accepts only the expected site and well-formed token", () => {
    expect(parseConnectUri(`qalab://connect?${new URLSearchParams({ origin, token })}`)).toEqual({ origin, token });
    expect(() => parseConnectUri(`qalab://connect?origin=https://evil.example&token=${token}`)).toThrow();
    expect(() => parseConnectUri(`qalab://connect?${new URLSearchParams({ origin, token: "short" })}`)).toThrow();
    expect(() => parseConnectUri(`https://connect?${new URLSearchParams({ origin, token })}`)).toThrow();
  });
  it("pairs multiple browser tabs without accepting unknown codes", () => {
    const session = createBridgeSession({ origin, code: "manual" });
    expect(session.pair({ origin, token })).toEqual({ ready: true });
    expect(session.accepts(token)).toBe(true);
    expect(session.accepts("manual")).toBe(true);
    expect(session.accepts("unknown")).toBe(false);
  });
});
