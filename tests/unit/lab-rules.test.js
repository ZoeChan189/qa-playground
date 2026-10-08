import { describe, expect, it } from "vitest";
import { evaluateThresholds, percentile } from "../../public/shared/evaluation.js";
import { validatePlan } from "../../public/shared/plan-rules.js";
import { perfScenarios } from "../../src/domain/perf-scenarios.js";
import { scenarioWithPeak, soakSteadySeconds } from "../../public/shared/perf-profile.js";

const validMetrics = { p95Ms: 280, errorRate: 0.005, p95LimitMs: 500, errorLimit: 0.01 };

describe("threshold evaluation", () => {
  it.each([false, true, [], [1], {}, " ", "0x10", null, undefined, Infinity, NaN])("rejects non-numeric metric input %j", (p95Ms) => {
    expect(evaluateThresholds({ ...validMetrics, p95Ms }).valid).toBe(false);
  });
  it("accepts decimal and scientific numeric form strings", () => {
    expect(evaluateThresholds({ ...validMetrics, p95Ms: " 2.8e2 " }).passed).toBe(true);
  });
  it("passes only when latency and errors are both below their limits", () => {
    expect(evaluateThresholds(validMetrics).passed).toBe(true);
    expect(evaluateThresholds({ ...validMetrics, errorRate: 0.02 }).checks).toEqual({ latencyPassed: true, errorsPassed: false });
  });

  it("treats exact limits as a breach", () => {
    expect(evaluateThresholds({ ...validMetrics, p95Ms: 500 }).passed).toBe(false);
    expect(evaluateThresholds({ ...validMetrics, errorRate: 0.01 }).passed).toBe(false);
  });

  it("rejects malformed and out-of-range data", () => {
    expect(evaluateThresholds({ ...validMetrics, p95Ms: -1 }).errors.p95Ms).toBeTruthy();
    expect(evaluateThresholds({ ...validMetrics, errorRate: 1.1 }).errors.errorRate).toBeTruthy();
    expect(evaluateThresholds(null).valid).toBe(false);
  });

  it("uses nearest-rank percentile and leaves an empty sample unset", () => {
    expect(percentile([40, 10, 20, 30], 95)).toBe(40);
    expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
    expect(percentile([], 95)).toBeNull();
  });
});

describe("test plan rules", () => {
  const validPlan = { name: "  Peak   traffic  ", scenario: "spike", targetVus: 45, notes: "classroom" };
  it.each([{ name: {} }, { name: ["Valid name"] }, { targetVus: true }, { targetVus: [5] }, { notes: {} }, { scenario: ["stress"] }])("rejects coerced plan fields %j", (fields) => {
    expect(validatePlan({ ...validPlan, ...fields }).valid).toBe(false);
  });

  it("normalizes a valid plan", () => {
    const result = validatePlan(validPlan);
    expect(result.valid).toBe(true);
    expect(result.value.name).toBe("Peak traffic");
  });

  it("rejects invalid boundaries and malformed bodies", () => {
    expect(validatePlan({ ...validPlan, targetVus: 51 }).errors.targetVus).toBeTruthy();
    expect(validatePlan({ ...validPlan, name: "x" }).errors.name).toBeTruthy();
    expect(validatePlan([]).valid).toBe(false);
  });
});

describe("performance profiles", () => {
  it.each([["90s", 90], ["5m", 300], ["1h30m", 5400], ["1500ms", 1.5]])("parses Soak duration %s", (input, seconds) => {
    expect(soakSteadySeconds(input)).toBe(seconds);
  });
  it.each(["90", "0s", "5garbage", "-1m", "25h", "1sBAD", "Infinitys"])("rejects invalid Soak duration %s", (input) => {
    expect(() => soakSteadySeconds(input)).toThrow();
  });
  it("has distinct stress, spike and soak shapes", () => {
    const stress = perfScenarios.stress.stages;
    const spike = perfScenarios.spike.stages;
    const soak = perfScenarios.soak.stages;
    expect(stress.map((stage) => stage.vus)).toEqual([5, 12, 24, 40, 0]);
    expect(spike[1]).toEqual({ seconds: 1, vus: 45 });
    expect(soak[1].seconds).toBeGreaterThan(60);
    for (const config of Object.values(perfScenarios)) {
      expect(Math.max(...config.stages.map((stage) => stage.vus))).toBe(config.peakVus);
    }
  });

  it("scales local stress and soak stages without changing the shared defaults", () => {
    expect(scenarioWithPeak("stress", perfScenarios.stress, 120).stages.map((stage) => stage.vus)).toEqual([15, 36, 72, 120, 0]);
    expect(scenarioWithPeak("soak", perfScenarios.soak, 100).stages.map((stage) => stage.vus)).toEqual([100, 100, 0]);
    expect(perfScenarios.stress.peakVus).toBe(40);
  });

  it("keeps spike baseline small and rejects unsafe peak values", () => {
    expect(scenarioWithPeak("spike", perfScenarios.spike, 120).stages.map((stage) => stage.vus)).toEqual([5, 120, 120, 5, 5, 0]);
    expect(() => scenarioWithPeak("spike", perfScenarios.spike, 4)).toThrow();
    expect(() => scenarioWithPeak("stress", perfScenarios.stress, 201)).toThrow();
    expect(() => scenarioWithPeak("stress", perfScenarios.stress, 2.5)).toThrow();
  });
});
