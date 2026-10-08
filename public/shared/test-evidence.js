export function comparePixels(reference, actual, { channelTolerance = 16, maxDiffPercent = 0.1 } = {}) {
  if (reference.width !== actual.width || reference.height !== actual.height) {
    return { passed: false, sameSize: false, changed: null, total: null, diffPercent: null };
  }
  const total = reference.width * reference.height;
  if (!total || reference.data.length !== total * 4 || actual.data.length !== total * 4) throw new Error("Invalid image data.");
  let changed = 0;
  for (let index = 0; index < reference.data.length; index += 4) {
    if ([0, 1, 2, 3].some((channel) => Math.abs(reference.data[index + channel] - actual.data[index + channel]) > channelTolerance)) changed += 1;
  }
  const diffPercent = changed / total * 100;
  return { passed: diffPercent <= maxDiffPercent, sameSize: true, changed, total, diffPercent };
}

export const metricValue = (summary, metric, key) => summary.metrics?.[metric]?.values?.[key] ?? summary.metrics?.[metric]?.[key];

export function perfDecision(summary, config, exitCode) {
  const p95 = metricValue(summary, "http_req_duration", "p(95)");
  const errorRate = metricValue(summary, "http_req_failed", "value") ?? metricValue(summary, "http_req_failed", "rate");
  const requests = metricValue(summary, "http_reqs", "count");
  const p95LimitMs = metricValue(summary, "configured_p95_limit_ms", "value") ?? config.p95LimitMs;
  const errorLimit = metricValue(summary, "configured_error_limit", "value") ?? config.errorLimit;
  const contractFailures = metricValue(summary, "invalid_success_responses", "count");
  if (![p95, errorRate, requests, p95LimitMs, errorLimit].every(Number.isFinite)
    || p95 < 0 || errorRate < 0 || errorRate > 1 || requests <= 0 || !Number.isInteger(requests)
    || p95LimitMs <= 0 || errorLimit <= 0 || errorLimit > 1) throw new Error("No valid measured requests. This run cannot be marked PASS.");
  const checks = [
    ["p95 latency", `< ${p95LimitMs} ms`, `${p95.toFixed(2)} ms`, p95 < p95LimitMs ? "PASS" : "FAIL"],
    ["Failed requests", `< ${(errorLimit * 100).toFixed(2)}%`, `${(errorRate * 100).toFixed(3)}%`, errorRate < errorLimit ? "PASS" : "FAIL"],
    ["Successful response contract", "0 malformed HTTP 200 responses", Number.isFinite(contractFailures) ? String(contractFailures) : "Not recorded in this older summary", Number.isFinite(contractFailures) ? contractFailures === 0 ? "PASS" : "FAIL" : "NOT MEASURED"],
  ];
  for (const [name, metric] of Object.entries(summary.metrics || {})) {
    for (const [expression, result] of Object.entries(metric.thresholds || {})) {
      // Classic --summary-export booleans mean LastFailed; handleSummary objects use ok.
      const ok = typeof result === "boolean" ? !result : result?.ok;
      checks.push([`k6: ${name}`, expression, typeof ok === "boolean" ? ok ? "Threshold satisfied" : "Threshold breached" : "Unknown", ok === true ? "PASS" : ok === false ? "FAIL" : "NOT MEASURED"]);
    }
  }
  if (exitCode !== undefined && exitCode !== null) checks.push(["k6 exit code", "0; 99 means threshold breach", String(exitCode), exitCode === 0 ? "PASS" : "FAIL"]);
  return { p95, errorRate, requests, p95LimitMs, errorLimit, checks, passed: !checks.some((row) => row[3] === "FAIL") };
}
