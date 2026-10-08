export function percentile(values, percentileValue) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return Math.round(sorted[Math.max(0, index)] * 100) / 100;
}

export function parseMetric(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return NaN;
  return Number(value);
}

export function evaluateThresholds(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const parse = parseMetric;
  const p95Ms = parse(source.p95Ms);
  const errorRate = parse(source.errorRate);
  const p95LimitMs = parse(source.p95LimitMs);
  const errorLimit = parse(source.errorLimit);
  const errors = {};
  if (!Number.isFinite(p95Ms) || p95Ms < 0) errors.p95Ms = "Use a non-negative latency.";
  if (!Number.isFinite(errorRate) || errorRate < 0 || errorRate > 1) errors.errorRate = "Use an error rate from 0 to 1.";
  if (!Number.isFinite(p95LimitMs) || p95LimitMs <= 0) errors.p95LimitMs = "Use a positive latency limit.";
  if (!Number.isFinite(errorLimit) || errorLimit <= 0 || errorLimit > 1) errors.errorLimit = "Use an error limit above 0 and up to 1.";
  if (Object.keys(errors).length) return { valid: false, errors };

  const latencyPassed = p95Ms < p95LimitMs;
  const errorsPassed = errorRate < errorLimit;
  return {
    valid: true,
    passed: latencyPassed && errorsPassed,
    checks: { latencyPassed, errorsPassed },
    values: { p95Ms, errorRate, p95LimitMs, errorLimit },
  };
}
