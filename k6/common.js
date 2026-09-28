import http from "k6/http";
import { check, sleep } from "k6";
import exec from "k6/execution";
import { Gauge, Rate, Trend } from "k6/metrics";
import { perfScenarios } from "../src/domain/perf-scenarios.js";
import { scenarioWithPeak } from "../public/shared/perf-profile.js";

const baseUrl = (__ENV.BASE_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
const localTarget = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(baseUrl);
if (!localTarget && __ENV.ALLOW_REMOTE_LOAD !== "1") {
  throw new Error("Remote load is blocked. Set ALLOW_REMOTE_LOAD=1 only with the host operator's permission.");
}

const serverHeap = new Gauge("server_heap_used_mb");
const serverActive = new Gauge("server_active_jobs");
const configuredPeak = new Gauge("configured_peak_vus");
const phaseNames = ["baseline", "ramp5", "ramp12", "ramp24", "peak40", "burst", "recovery", "early", "late"];
const phaseMetrics = Object.fromEntries(phaseNames.map((name) => [name, {
  duration: new Trend(`phase_${name}_duration_ms`, true),
  failed: new Rate(`phase_${name}_failed`),
}]));
const earlyHeap = new Trend("phase_early_heap_mb");
const lateHeap = new Trend("phase_late_heap_mb");

function currentPhase(profile) {
  const seconds = exec.instance.currentTestRunDuration / 1000;
  if (profile === "load") return "baseline";
  if (profile === "stress") {
    if (seconds < 5) return "ramp5";
    if (seconds < 13) return "ramp12";
    if (seconds < 21) return "ramp24";
    if (seconds < 29) return "peak40";
    return "recovery";
  }
  if (profile === "spike") return seconds < 4 ? "baseline" : seconds < 14 ? "burst" : "recovery";
  const steadySeconds = Number.parseFloat(__ENV.SOAK_STEADY || "90");
  if (seconds < 5 || seconds >= 5 + steadySeconds) return null;
  if (seconds < 5 + steadySeconds * 0.25) return "early";
  if (seconds >= 5 + steadySeconds * 0.75) return "late";
  return null;
}

export function optionsFor(profile) {
  const baseConfig = perfScenarios[profile];
  const config = scenarioWithPeak(profile, baseConfig, __ENV.PERF_PEAK_VUS ? Number(__ENV.PERF_PEAK_VUS) : baseConfig.peakVus);
  const stages = config.stages.map((stage, index) => ({
    duration: profile === "soak" && index === 1 ? (__ENV.SOAK_STEADY || `${stage.seconds}s`) : `${stage.seconds}s`,
    target: stage.vus,
  }));
  return {
    scenarios: { [profile]: { executor: "ramping-vus", startVUs: 0, stages, gracefulRampDown: "5s" } },
    thresholds: {
      http_req_duration: [`p(95)<${config.p95LimitMs}`],
      http_req_failed: [`rate<${config.errorLimit}`],
    },
  };
}

export function exercise(profile) {
  const config = perfScenarios[profile];
  configuredPeak.add(__ENV.PERF_PEAK_VUS ? Number(__ENV.PERF_PEAK_VUS) : config.peakVus);
  const phase = currentPhase(profile);
  const response = http.get(`${baseUrl}/api/perf/work?work=${config.work}`, {
    tags: { profile, phase: phase || "middle" },
    timeout: "15s",
  });
  if (phase) {
    phaseMetrics[phase].duration.add(response.timings.duration);
    phaseMetrics[phase].failed.add(response.status !== 200);
  }
  check(response, {
    "HTTP 200": (result) => result.status === 200,
    "JSON response": (result) => result.headers["Content-Type"]?.includes("application/json"),
  });
  if (response.status === 200) {
    try {
      const body = response.json();
      if (typeof body.heapUsedMb === "number") serverHeap.add(body.heapUsedMb, { profile });
      if (typeof body.activeJobs === "number") serverActive.add(body.activeJobs, { profile });
      if (profile === "soak" && phase === "early" && typeof body.heapUsedMb === "number") earlyHeap.add(body.heapUsedMb);
      if (profile === "soak" && phase === "late" && typeof body.heapUsedMb === "number") lateHeap.add(body.heapUsedMb);
    } catch {
      // The JSON check above still reports the malformed response.
    }
  }
  sleep(0.06);
}
