import { describe, expect, it } from "vitest";
import { evaluateThresholds, percentile } from "../../public/shared/evaluation.js";
import { validatePlan } from "../../public/shared/plan-rules.js";
import { perfScenarios } from "../../src/domain/perf-scenarios.js";

const validMetrics = { p95Ms: 280, errorRate: 0.005, p95LimitMs: 500, errorLimit: 0.01 };

describe("threshold evaluation", () => {
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
});
