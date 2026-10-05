import { evaluateThresholds } from "./shared/evaluation.js";
import { validatePlan } from "./shared/plan-rules.js";
import { MAX_LOCAL_PEAK_VUS, scenarioWithPeak } from "./shared/perf-profile.js";

const byId = (id) => document.getElementById(id);
const topicNames = { performance: "Performance", unit: "Unit", api: "API", e2e: "Web E2E", mobile: "Mobile web", visual: "Visual", ai: "AI-assisted", ci: "CI/CD" };
const profileCopy = {
  load: { title: "Load: steady baseline", purpose: "Establish normal response time and throughput before increasing traffic.", context: "Load: confirm the expected baseline" },
  stress: { title: "Stress: ramp to capacity", purpose: "Increase users gradually to locate the point where latency or HTTP 503 responses rise.", context: "Stress: find the point where latency or errors rise" },
  spike: { title: "Spike: sudden traffic jump", purpose: "Jump from baseline to peak traffic, then check recovery after the burst.", context: "Spike: compare the burst with the recovery period" },
  soak: { title: "Soak: sustained traffic", purpose: "Hold steady traffic and watch latency, errors and actual Node heap over time.", context: "Soak: look for degradation during the steady period" },
};
const profileCases = {
  load: [["P01 · baseline", "p95 and error rate at 5 VUs", "Record reference values"], ["P02 · throughput", "Requests completed in 17 s", "Stable rate with few errors"]],
  stress: [["P03 · breaking point", "p95 and 503s as VUs rise", "Identify first sustained breach"], ["P04 · capacity", "Peak active vs 24-job limit", "Rejections begin at saturation"], ["P05 · ramp-down", "p95 after VUs decrease", "Check whether backlog clears"]],
  spike: [["P06 · burst", "p95 and 503s during 1-second jump", "Measure impact of sudden arrivals"], ["P07 · recovery", "p95 and errors after drop", "Service returns toward baseline"]],
  soak: [["P08 · stability", "p95 and error rate across steady hold", "No sustained degradation"], ["P09 · memory", "Actual heap trend and min/max", "Investigate growth; do not infer a leak from one run"]],
};
const phaseLabels = {
  load: [["baseline", "Baseline"]],
  stress: [["ramp5", "Ramp to 5"], ["ramp12", "Ramp to 12"], ["ramp24", "Ramp to 24"], ["peak40", "Ramp to 40"], ["recovery", "Ramp down"]],
  spike: [["baseline", "Baseline"], ["burst", "Burst"], ["recovery", "Recovery"]],
  soak: [["early", "Early hold"], ["late", "Late hold"]],
};
const apiPresets = {
  health: { method: "GET", url: "/api/health", body: "" },
  metrics: { method: "GET", url: "/api/perf/metrics", body: "" },
  evaluate: { method: "POST", url: "/api/evaluate", body: JSON.stringify({ p95Ms: 280, errorRate: 0.005, p95LimitMs: 500, errorLimit: 0.01 }, null, 2) },
  invalid: { method: "POST", url: "/api/evaluate", body: JSON.stringify({ p95Ms: -5, errorRate: 0.005, p95LimitMs: 500, errorLimit: 0.01 }, null, 2) },
  missing: { method: "GET", url: "/api/not-found", body: "" },
};
let scenarios = null;
let selectedScenario = "stress";
const heapHistory = [];
let aiReady = false;
let aiRequiresCode = false;
let localK6Ready = false;
let runActive = false;
let runStartPending = false;
let latestAutoId = null;
let latestAutoStatus = null;
let manualSummary = false;
let autoIdAtImport = null;
let latestPollPending = false;
const localPage = ["localhost", "127.0.0.1"].includes(location.hostname);
const bridgeBase = "http://127.0.0.1:4173/local-bridge";
let bridgeCode = "";
let bridgeConnected = false;
let aiMode = "group";
let aiDraftReady = false;

function createEvidence(topic, afterId, description) {
  const section = document.createElement("section");
  section.className = "evidence-panel";
  section.setAttribute("aria-label", `${topicNames[topic]} measured evidence`);
  const heading = document.createElement("h2");
  heading.textContent = "Measured result";
  const note = document.createElement("p");
  note.textContent = description;
  const grid = document.createElement("div");
  grid.className = "evidence-grid";
  const verdict = document.createElement("div");
  verdict.className = "result-line";
  verdict.setAttribute("role", "status");
  verdict.textContent = "NOT RUN · Run the check above to see measured values.";
  section.append(heading, note, grid, verdict);
  (byId(afterId) || document.querySelector(`.${afterId}`)).after(section);
  return (metrics, message, status = "") => {
    grid.replaceChildren(...metrics.map(([label, value]) => {
      const cell = document.createElement("div");
      const title = document.createElement("span");
      const number = document.createElement("strong");
      title.textContent = label;
      number.textContent = String(value);
      cell.append(title, number);
      return cell;
    }));
    verdict.className = `result-line ${status}`;
    verdict.textContent = message;
  };
}

const showUnitEvidence = createEvidence("unit", "unit-form", "Function output; p95 and errors must both be strictly below their limits.");
const showApiEvidence = createEvidence("api", "api-grid", "HTTP status and response contract are checked against the selected request.");
const showE2eEvidence = createEvidence("e2e", "plan-step-3", "The UI flow passes after valid input is saved and the same plan is retrieved.");
const showMobileEvidence = createEvidence("mobile", "mobile-measure", "This browser checks page-level overflow. Touch and full workflow need a mobile device or Playwright.");
const showVisualEvidence = createEvidence("visual", "visual-specimen", "Live DOM-style comparison, not a Playwright screenshot diff.");
const showAiEvidence = createEvidence("ai", "ai-result-wrap", "A generated draft is not a passing test; review and execution are separate.");
const showCiEvidence = createEvidence("ci", "pipeline", "Latest public GitHub Actions run; check the linked run for individual test failures.");

function toast(message, error = false) {
  const node = document.createElement("div");
  node.className = `toast${error ? " error" : ""}`;
  node.textContent = message;
  byId("toast-region").append(node);
  setTimeout(() => node.remove(), 3200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard.");
  } catch {
    toast("Clipboard unavailable. Select the text and copy it.", true);
  }
}

function currentRoute() {
  const [topic, scenario] = location.hash.slice(1).split("/");
  return { topic: topicNames[topic] ? topic : "performance", scenario: profileCopy[scenario] ? scenario : selectedScenario };
}

function showTopic(topic) {
  document.querySelectorAll(".topic-link").forEach((button) => button.classList.toggle("active", button.dataset.view === topic));
  document.querySelectorAll(".view").forEach((section) => section.classList.toggle("active", section.id === `view-${topic}`));
  byId("current-topic").textContent = topicNames[topic];
  if (topic === "mobile") measureMobile();
  if (topic === "performance") { pollTelemetry(); pollLatestRun(); }
  if (topic === "ci") loadCiStatus();
}

function navigate(topic) {
  location.hash = topic === "performance" ? `#performance/${selectedScenario}` : `#${topic}`;
}

function syncRoute() {
  const { topic, scenario } = currentRoute();
  showTopic(topic);
  if (topic === "performance" && scenarios) selectScenario(scenario, false);
}

const SVG_NS = "http://www.w3.org/2000/svg";
function svgElement(tag, attributes = {}, label = "") {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (label) node.textContent = label;
  return node;
}

function drawVuChart(profile, config) {
  const chart = byId("vu-chart");
  const totalSeconds = config.stages.reduce((sum, stage) => sum + stage.seconds, 0);
  const left = 43, right = 728, bottom = 205, top = 20;
  const width = right - left, height = bottom - top;
  const y = (vus) => bottom - (vus / Math.max(config.peakVus, 1)) * height;
  const nodes = [];
  for (const portion of [0, 0.5, 1]) {
    const position = y(config.peakVus * portion);
    nodes.push(svgElement("line", { x1: left, y1: position, x2: right, y2: position, stroke: "#e3eaed", "stroke-width": 1 }));
    nodes.push(svgElement("text", { x: 5, y: position + 4, fill: "#6d7b84", "font-size": 11 }, String(Math.round(config.peakVus * portion))));
  }
  let elapsed = 0;
  const points = [[left, bottom]];
  for (const stage of config.stages) {
    elapsed += stage.seconds;
    points.push([left + (elapsed / totalSeconds) * width, y(stage.vus)]);
  }
  const stroke = profile === "spike" ? "#b54436" : profile === "soak" ? "#315a9b" : "#087e83";
  nodes.push(svgElement("polyline", { points: points.map((point) => point.join(",")).join(" "), fill: "none", stroke, "stroke-width": 3, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  points.slice(1).forEach(([cx, cy]) => nodes.push(svgElement("circle", { cx, cy, r: 4, fill: stroke, stroke: "white", "stroke-width": 2 })));
  chart.replaceChildren(...nodes);
  chart.setAttribute("aria-label", `${config.label}: planned virtual users rise to ${config.peakVus} over ${totalSeconds} seconds`);
  byId("chart-end").textContent = `${totalSeconds} s`;
  byId("chart-duration").textContent = `${totalSeconds} seconds`;
}

function drawHeapChart() {
  const chart = byId("heap-chart");
  if (!heapHistory.length) return;
  const min = Math.min(...heapHistory), max = Math.max(...heapHistory);
  const spread = Math.max(2, max - min);
  const points = heapHistory.map((value, index) => [
    16 + (index / Math.max(1, heapHistory.length - 1)) * 417,
    89 - ((value - min) / spread) * 66,
  ]);
  chart.replaceChildren(
    svgElement("line", { x1: 16, y1: 89, x2: 433, y2: 89, stroke: "#dfe8eb" }),
    svgElement("polyline", { points: points.map((point) => point.join(",")).join(" "), fill: "none", stroke: "#315a9b", "stroke-width": 2.5, "stroke-linecap": "round" }),
    svgElement("text", { x: 16, y: 105, fill: "#61707c", "font-size": 10 }, `${min.toFixed(1)} MB`),
    svgElement("text", { x: 370, y: 16, fill: "#315a9b", "font-size": 11, "font-weight": 700 }, `${max.toFixed(1)} MB`),
  );
}

function populateCases(profile) {
  byId("case-context").textContent = profileCopy[profile].context;
  byId("perf-case-rows").replaceChildren(...profileCases[profile].map((values) => {
    const row = document.createElement("tr");
    values.forEach((value) => { const cell = document.createElement("td"); cell.textContent = value; row.append(cell); });
    return row;
  }));
}

function selectScenario(profile, updateHash = true) {
  if (!scenarios?.[profile]) return;
  selectedScenario = profile;
  const config = scenarios[profile];
  document.querySelectorAll("[data-scenario]").forEach((button) => button.classList.toggle("selected", button.dataset.scenario === profile));
  byId("chart-title").textContent = profileCopy[profile].title;
  byId("profile-name").textContent = config.label;
  byId("profile-purpose").textContent = profileCopy[profile].purpose;
  byId("profile-work").textContent = `${(config.work * 1000).toLocaleString()} iterations`;
  byId("profile-p95").textContent = `${config.p95LimitMs} ms`;
  byId("profile-error").textContent = `${config.errorLimit * 100}%`;
  byId("perf-vus").min = profile === "spike" ? "5" : "1";
  byId("perf-vus").value = config.peakVus;
  byId("probe-work").value = config.work;
  updatePeak();
  populateCases(profile);
  if (updateHash) location.hash = `#performance/${profile}`;
}

function updatePeak() {
  const input = byId("perf-vus");
  const error = byId("perf-vus-error");
  const peak = Number(input.value);
  try {
    if (!/^\d+$/.test(input.value)) throw new RangeError("Enter a whole number.");
    const config = scenarioWithPeak(selectedScenario, scenarios[selectedScenario], peak);
    byId("profile-vus").textContent = `${peak} VUs`;
    byId("perf-command").textContent = `npm run perf:${selectedScenario}${peak === scenarios[selectedScenario].peakVus ? "" : ` -- --vus ${peak}`}`;
    byId("copy-perf-command").disabled = false;
    byId("run-k6").disabled = !localK6Ready || runActive || runStartPending;
    error.textContent = `${selectedScenario === "spike" ? "5" : "1"}–${MAX_LOCAL_PEAK_VUS} local VUs; this page does not generate load.`;
    error.classList.remove("error-text");
    drawVuChart(selectedScenario, config);
  } catch (cause) {
    byId("copy-perf-command").disabled = true;
    byId("run-k6").disabled = true;
    byId("perf-command").textContent = "Enter valid local VUs";
    error.textContent = cause.message;
    error.classList.add("error-text");
  }
}

async function pollTelemetry() {
  if (!scenarios || document.hidden || !byId("view-performance").classList.contains("active")) return;
  try {
    const response = await fetch(bridgeConnected ? `${bridgeBase}/metrics` : "/api/perf/metrics", {
      cache: "no-store", headers: bridgeConnected ? { "X-QA-Bridge-Code": bridgeCode } : {},
    });
    if (!response.ok) throw new Error("Telemetry unavailable");
    const data = await response.json();
    byId("metric-active").textContent = data.active;
    byId("metric-capacity").textContent = `of ${data.capacity} capacity`;
    byId("metric-completed").textContent = data.completed.toLocaleString();
    byId("metric-rejected").textContent = data.rejected.toLocaleString();
    byId("metric-p95").textContent = data.p95Ms === null ? "–" : `${data.p95Ms.toFixed(0)} ms`;
    byId("metric-heap").textContent = `${data.heapUsedMb.toFixed(1)} MB`;
    byId("telemetry-updated").textContent = `${bridgeConnected ? "Local" : "Current site"} Node process · ${new Date().toLocaleTimeString()}`;
    heapHistory.push(data.heapUsedMb);
    if (heapHistory.length > 42) heapHistory.shift();
    drawHeapChart();
  } catch {
    byId("telemetry-updated").textContent = "Telemetry offline · last sample shown";
  }
}

async function checkHealth() {
  const status = byId("server-status");
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok || (await response.json()).service !== "qa-lab") throw new Error();
    status.classList.remove("offline");
    status.lastChild.textContent = " API online";
  } catch {
    status.classList.add("offline");
    status.lastChild.textContent = " API offline";
  }
}

async function runProbe() {
  const work = Number(byId("probe-work").value);
  const result = byId("probe-result");
  if (!Number.isInteger(work) || work < 1 || work > 100) {
    result.className = "result-line fail";
    result.textContent = "Work factor must be 1–100.";
    return;
  }
  result.className = "result-line";
  result.textContent = "Running one request…";
  const started = performance.now();
  try {
    const response = await fetch(bridgeConnected ? `${bridgeBase}/probe?work=${work}` : `/api/perf/work?work=${work}`, {
      cache: "no-store", headers: bridgeConnected ? { "X-QA-Bridge-Code": bridgeCode } : {},
    });
    const body = await response.json();
    const elapsed = Math.round(performance.now() - started);
    result.className = `result-line ${response.ok ? "pass" : "fail"}`;
    result.textContent = response.ok ? `HTTP 200 · ${elapsed} ms client · ${body.serviceMs} ms server · ${body.iterations.toLocaleString()} iterations` : `HTTP ${response.status} · ${body.message || body.error}`;
    pollTelemetry();
  } catch {
    result.className = "result-line fail";
    result.textContent = "Request failed. Check the API connection.";
  }
}

function metricValue(summary, metric, key) {
  const data = summary.metrics?.[metric];
  return data?.values?.[key] ?? data?.[key];
}

function tableRow(values, lastClass = "") {
  const row = document.createElement("tr");
  values.forEach((value, index) => {
    const cell = document.createElement("td");
    cell.textContent = value;
    if (lastClass && index === values.length - 1) cell.className = lastClass;
    row.append(cell);
  });
  return row;
}

function readableTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "–";
}

function clearSummary() {
  byId("summary-empty").hidden = false;
  byId("summary-result").hidden = true;
  byId("summary-detail").hidden = true;
  byId("phase-section").hidden = true;
  byId("summary-message").textContent = "";
  byId("perf-outcome").className = "outcome-bar";
  byId("perf-outcome-title").textContent = "No completed k6 result";
  byId("perf-outcome-detail").textContent = "Waiting for measured p95, error rate, request count and threshold decisions.";
}

function renderSummary(summary, profile, source = {}) {
  const config = scenarios[profile];
  const p95 = metricValue(summary, "http_req_duration", "p(95)");
  const errorRate = metricValue(summary, "http_req_failed", "value") ?? metricValue(summary, "http_req_failed", "rate");
  const requests = metricValue(summary, "http_reqs", "count");
  if (!config || !Number.isFinite(p95) || !Number.isFinite(errorRate) || !Number.isFinite(requests)) {
    throw new Error("Use a k6 summary exported by this project's perf command.");
  }
  selectScenario(profile, false);
  history.replaceState(null, "", `#performance/${profile}`);
  const importedPeak = metricValue(summary, "configured_peak_vus", "value");
  const peak = Number.isInteger(importedPeak) && importedPeak >= (profile === "spike" ? 5 : 1) && importedPeak <= MAX_LOCAL_PEAK_VUS
    ? importedPeak : config.peakVus;
  byId("perf-vus").value = peak;
  updatePeak();
  const verdict = evaluateThresholds({ p95Ms: p95, errorRate, p95LimitMs: config.p95LimitMs, errorLimit: config.errorLimit });
  const heapMin = metricValue(summary, "server_heap_used_mb", "min");
  const heapMax = metricValue(summary, "server_heap_used_mb", "max");
  const peakActive = metricValue(summary, "server_active_jobs", "max");
  byId("summary-profile").textContent = config.label;
  byId("summary-requests").textContent = requests.toLocaleString();
  byId("summary-p95").textContent = `${p95.toFixed(0)} ms`;
  byId("summary-errors").textContent = `${(errorRate * 100).toFixed(1)}%`;
  byId("summary-active").textContent = Number.isFinite(peakActive) ? String(Math.round(peakActive)) : "–";
  byId("summary-heap").textContent = Number.isFinite(heapMin) && Number.isFinite(heapMax) ? `${heapMin.toFixed(1)}–${heapMax.toFixed(1)} MB` : "–";
  byId("summary-verdict").textContent = verdict.passed ? "WITHIN LIMITS" : "LIMIT BREACHED";
  byId("summary-verdict").parentElement.className = `summary-verdict ${verdict.passed ? "pass" : "fail"}`;
  byId("perf-outcome").className = `outcome-bar ${verdict.passed ? "pass" : "fail"}`;
  const sourceKind = source.label?.startsWith("Latest saved run") ? "SAVED RESULT" : source.label?.startsWith("Opened") ? "IMPORTED RESULT" : "LATEST RUN";
  byId("perf-outcome-title").textContent = `${sourceKind} · ${verdict.passed ? "PASS" : "FAIL"}`;
  byId("perf-outcome-detail").textContent = `${config.label} · ${requests.toLocaleString()} requests · p95 ${p95.toFixed(0)} / ${config.p95LimitMs} ms · errors ${(errorRate * 100).toFixed(1)} / ${(config.errorLimit * 100).toFixed(0)}% · ${readableTime(source.finishedAt)}`;
  byId("summary-empty").hidden = true;
  byId("summary-result").hidden = false;

  const whole = (value) => Number.isFinite(value) ? Math.round(value).toLocaleString() : "–";
  const ms = (value) => Number.isFinite(value) ? `${value.toFixed(1)} ms` : "–";
  const requestRate = metricValue(summary, "http_reqs", "rate");
  const failedCount = metricValue(summary, "http_req_failed", "passes");
  const hasStatusCounts = ["http_status_200", "http_status_503", "http_status_other"]
    .some((name) => Number.isFinite(metricValue(summary, name, "count")));
  const statusCount = (name) => whole(metricValue(summary, name, "count") ?? (hasStatusCounts ? 0 : null));
  const rows = [
    ["Completed at", readableTime(source.finishedAt), "Time this summary became available"],
    ["Configured peak", `${peak} VUs`, "Maximum planned virtual users"],
    ["Requests per second", Number.isFinite(requestRate) ? requestRate.toFixed(1) : "–", "Average across the whole run"],
    ["Failed requests", whole(Number.isFinite(failedCount) ? failedCount : requests * errorRate), "HTTP requests counted as failed by k6"],
    ["HTTP 200", statusCount("http_status_200"), "Successful work responses"],
    ["HTTP 503", statusCount("http_status_503"), "Requests rejected at the capacity limit"],
    ["Other status", statusCount("http_status_other"), "Other responses, including timeouts"],
    ["Latency min", ms(metricValue(summary, "http_req_duration", "min")), "Fastest recorded HTTP response"],
    ["Latency average", ms(metricValue(summary, "http_req_duration", "avg")), "Arithmetic mean across requests"],
    ["Latency median", ms(metricValue(summary, "http_req_duration", "med")), "Half the requests are at or below this"],
    ["Latency p90", ms(metricValue(summary, "http_req_duration", "p(90)")), "90% of requests are at or below this"],
    ["Latency p95", ms(p95), "Compared with the scenario limit"],
    ["Latency max", ms(metricValue(summary, "http_req_duration", "max")), "Slowest recorded HTTP response"],
    ["Iterations", whole(metricValue(summary, "iterations", "count")), "Completed k6 virtual-user loops"],
    ["Data received", Number.isFinite(metricValue(summary, "data_received", "count")) ? `${(metricValue(summary, "data_received", "count") / 1048576).toFixed(2)} MB` : "–", "Total response data"],
  ];
  byId("detail-rows").replaceChildren(...rows.map((row) => tableRow(row)));
  byId("summary-source").textContent = `${source.label || "Imported k6 summary"} · ${readableTime(source.finishedAt)}`;
  byId("summary-detail").hidden = false;
  byId("threshold-rows").replaceChildren(
    tableRow(["p95 latency", ms(p95), `< ${config.p95LimitMs} ms`, verdict.checks.latencyPassed ? "PASS" : "FAIL"], verdict.checks.latencyPassed ? "threshold-pass" : "threshold-fail"),
    tableRow(["Failed requests", `${(errorRate * 100).toFixed(2)}%`, `< ${(config.errorLimit * 100).toFixed(0)}%`, verdict.checks.errorsPassed ? "PASS" : "FAIL"], verdict.checks.errorsPassed ? "threshold-pass" : "threshold-fail"),
  );

  const importedConfig = scenarioWithPeak(profile, config, peak);
  const stressStage = { ramp5: 0, ramp12: 1, ramp24: 2, peak40: 3 };
  const phaseRows = phaseLabels[profile].map(([name, originalLabel]) => {
    const label = profile === "stress" && name in stressStage ? `Ramp to ${importedConfig.stages[stressStage[name]].vus}` : originalLabel;
    const phaseP95 = metricValue(summary, `phase_${name}_duration_ms`, "p(95)");
    const phaseErrors = metricValue(summary, `phase_${name}_failed`, "value");
    const phaseRequests = metricValue(summary, `phase_${name}_requests`, "count");
    if (!Number.isFinite(phaseP95) || !Number.isFinite(phaseErrors)) return null;
    return tableRow([label, whole(phaseRequests), `${phaseP95.toFixed(0)} ms`, `${(phaseErrors * 100).toFixed(1)}%`]);
  }).filter(Boolean);
  byId("phase-rows").replaceChildren(...phaseRows);
  byId("phase-section").hidden = phaseRows.length === 0;
  const earlyHeap = metricValue(summary, "phase_early_heap_mb", "avg");
  const lateHeap = metricValue(summary, "phase_late_heap_mb", "avg");
  byId("heap-comparison").hidden = !Number.isFinite(earlyHeap) || !Number.isFinite(lateHeap);
  if (!byId("heap-comparison").hidden) byId("heap-comparison").textContent = `Mean Node heap: early ${earlyHeap.toFixed(1)} MB, late ${lateHeap.toFixed(1)} MB. A single short run does not prove a leak.`;
  const latencyStatus = verdict.checks.latencyPassed ? "PASS" : "FAIL";
  const errorStatus = verdict.checks.errorsPassed ? "PASS" : "FAIL";
  const message = byId("summary-message");
  message.textContent = `p95 ${latencyStatus}: ${p95.toFixed(1)} ms vs ${config.p95LimitMs} ms limit. Errors ${errorStatus}: ${(errorRate * 100).toFixed(2)}% vs ${(config.errorLimit * 100).toFixed(0)}% limit.${verdict.passed && errorRate > 0 ? " Some requests still failed; inspect the phases." : ""}`;
  message.className = `inline-message ${verdict.passed ? "pass" : "fail"}`;
}

function showRunState(title, detail, failed = false) {
  const state = byId("run-state");
  state.hidden = false;
  state.className = `run-state${failed ? " fail" : ""}`;
  byId("run-state-title").textContent = title;
  byId("run-state-detail").textContent = detail;
}

async function importSummary(file) {
  if (!file) return;
  manualSummary = true;
  autoIdAtImport = latestAutoId;
  clearSummary();
  try {
    if (file.size > 5_000_000) throw new Error("Summary file is too large.");
    const summary = JSON.parse(await file.text());
    renderSummary(summary, file.name.split("-")[0], { label: `Opened ${file.name}`, finishedAt: file.lastModified });
    showRunState("Imported summary", file.name);
  } catch (error) {
    showRunState("Could not open summary", error.message, true);
    byId("summary-message").className = "inline-message fail";
    byId("summary-message").textContent = error.message;
  }
}

async function pollLatestRun() {
  if (!scenarios || latestPollPending || document.hidden || !byId("view-performance").classList.contains("active")) return;
  latestPollPending = true;
  try {
    const response = await fetch(bridgeConnected ? `${bridgeBase}/runs/latest` : "/api/perf/runs/latest", {
      cache: "no-store",
      headers: bridgeConnected ? { "X-QA-Bridge-Code": bridgeCode } : {},
    });
    if (!response.ok) throw new Error("Local run status unavailable.");
    const data = await response.json();
    localK6Ready = data.canRun;
    runActive = data.run?.status === "running";
    const availability = byId("run-availability");
    availability.textContent = data.canRun ? "Run k6 on this computer; the latest result appears automatically."
      : data.reason === "hosted" ? "Hosted view: run k6 on a local QA Lab copy, or open a summary."
        : "k6 is missing. Install Grafana k6, then restart QA Lab.";
    byId("k6-install").hidden = data.canRun || (data.reason === "hosted" && !bridgeConnected);
    updatePeak();
    const run = data.run;
    if (!run || runStartPending) return;
    if (manualSummary && run.id === autoIdAtImport) return;
    if (manualSummary && run.id !== autoIdAtImport) manualSummary = false;
    if (run.id === latestAutoId && run.status === latestAutoStatus) return;
    latestAutoId = run.id;
    latestAutoStatus = run.status;
    if (run.status === "running") {
      clearSummary();
      byId("perf-outcome-title").textContent = "k6 test running";
      byId("perf-outcome-detail").textContent = `${run.scenario.toUpperCase()} · ${run.peakVus} peak VUs · results will appear when this run completes. Counters above are server-wide.`;
      showRunState(`${run.scenario.toUpperCase()} test running`, `${run.peakVus} VUs peak · started ${readableTime(run.startedAt)} · live server counters above`);
    } else if (run.status === "complete") {
      try {
        renderSummary(run.summary, run.scenario, {
          label: run.source === "saved" ? `Latest saved run: ${run.filename}` : "Latest local k6 run",
          finishedAt: run.finishedAt,
        });
        showRunState(run.source === "saved" ? "Saved k6 result loaded" : "Latest test completed", `${run.scenario.toUpperCase()} · ${readableTime(run.finishedAt)} · ${run.source === "saved" ? "saved file found on this computer" : "result updated automatically"}`);
      } catch (error) {
        clearSummary();
        showRunState("Invalid k6 result", error.message, true);
      }
    } else {
      clearSummary();
      byId("perf-outcome").className = "outcome-bar fail";
      byId("perf-outcome-title").textContent = "k6 run failed";
      byId("perf-outcome-detail").textContent = run.message || "No valid summary was produced.";
      showRunState("k6 run failed", run.message || "No valid summary was produced. Check k6 installation and try again.", true);
    }
  } catch {
    localK6Ready = false;
    bridgeConnected = false;
    byId("run-k6").disabled = true;
    byId("run-availability").textContent = "Could not check local k6. Reopen the local QA Lab page.";
    byId("k6-install").hidden = true;
  } finally {
    latestPollPending = false;
  }
}

async function startK6Run() {
  const peakVus = Number(byId("perf-vus").value);
  try {
    scenarioWithPeak(selectedScenario, scenarios[selectedScenario], peakVus);
  } catch (error) {
    showRunState("Invalid peak VUs", error.message, true);
    return;
  }
  runStartPending = true;
  byId("run-k6").disabled = true;
  clearSummary();
  byId("perf-outcome-title").textContent = "Starting k6 test";
  byId("perf-outcome-detail").textContent = `${selectedScenario.toUpperCase()} · ${peakVus} peak VUs · waiting for measurements.`;
  showRunState("Starting local k6", `${selectedScenario.toUpperCase()} · ${peakVus} VUs peak`);
  try {
    const response = await fetch(bridgeConnected ? `${bridgeBase}/runs` : "/api/perf/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(bridgeConnected ? { "X-QA-Bridge-Code": bridgeCode } : {}) },
      body: JSON.stringify({ scenario: selectedScenario, peakVus }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Could not start k6.");
    manualSummary = false;
    latestAutoId = null;
    latestAutoStatus = null;
  } catch (error) {
    manualSummary = true;
    autoIdAtImport = latestAutoId;
    showRunState("Could not start k6", error.message, true);
    byId("perf-outcome").className = "outcome-bar fail";
    byId("perf-outcome-title").textContent = "Could not start k6";
    byId("perf-outcome-detail").textContent = error.message;
  } finally {
    runStartPending = false;
    await pollLatestRun();
  }
}

async function connectLocalK6() {
  const entered = byId("bridge-code").value.trim();
  if (!entered) {
    byId("bridge-status").textContent = "Enter the pairing code shown in the local QA Lab window.";
    return;
  }
  byId("bridge-connect").disabled = true;
  byId("bridge-status").textContent = "Connecting to this computer...";
  try {
    const response = await fetch(`${bridgeBase}/status`, { cache: "no-store", headers: { "X-QA-Bridge-Code": entered } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Connection rejected. Check the code and allowed site origin.");
    bridgeCode = entered;
    bridgeConnected = true;
    byId("bridge-code").value = "";
    byId("bridge-status").textContent = result.canRun ? "Connected. k6, live counters and probe use this computer." : "Connected, but k6 is missing. Install it and restart QA Lab.";
    latestAutoId = null;
    latestAutoStatus = null;
    await pollLatestRun();
    await pollTelemetry();
  } catch (error) {
    bridgeConnected = false;
    localK6Ready = false;
    byId("bridge-status").textContent = `Could not connect: ${error.message}. Start QA Lab and check the browser's local-network permission.`;
  } finally {
    byId("bridge-connect").disabled = false;
  }
}

function runUnit(event) {
  event.preventDefault();
  const result = evaluateThresholds({
    p95Ms: byId("unit-p95").value,
    errorRate: byId("unit-errors").value === "" ? "" : Number(byId("unit-errors").value) / 100,
    p95LimitMs: byId("unit-p95-limit").value,
    errorLimit: byId("unit-error-limit").value === "" ? "" : Number(byId("unit-error-limit").value) / 100,
  });
  const target = byId("unit-result");
  target.className = `result-line ${result.valid && result.passed ? "pass" : "fail"}`;
  target.textContent = !result.valid ? Object.values(result.errors).join(" ") : result.passed ? "PASS · latency and error rate are both below their limits." : `FAIL · ${result.checks.latencyPassed ? "latency passes" : "latency breaches"}; ${result.checks.errorsPassed ? "errors pass" : "errors breach"}.`;
  showUnitEvidence([
    ["p95 observed / limit", `${byId("unit-p95").value} / ${byId("unit-p95-limit").value} ms`],
    ["Errors observed / limit", `${byId("unit-errors").value} / ${byId("unit-error-limit").value}%`],
    ["Rules passed", result.valid ? `${Number(result.checks.latencyPassed) + Number(result.checks.errorsPassed)} / 2` : "Invalid input"],
  ], !result.valid ? "INVALID · Input does not meet the metric contract." : result.passed ? "PASS · Both strict threshold checks passed." : "FAIL · One or both thresholds were reached or exceeded.", result.valid && result.passed ? "pass" : "fail");
}

function updateApiPreset() {
  byId("api-body").value = apiPresets[byId("api-preset").value].body;
}

async function sendApiRequest() {
  const preset = apiPresets[byId("api-preset").value];
  const started = performance.now();
  try {
    const response = await fetch(preset.url, {
      method: preset.method,
      headers: preset.method === "POST" ? { "Content-Type": "application/json" } : {},
      body: preset.method === "POST" ? byId("api-body").value : undefined,
    });
    const body = await response.text();
    byId("api-response-status").textContent = `HTTP ${response.status}`;
    byId("api-response-time").textContent = `${Math.round(performance.now() - started)} ms`;
    let parsed;
    try { parsed = JSON.parse(body); byId("api-response").textContent = JSON.stringify(parsed, null, 2); }
    catch { byId("api-response").textContent = body; }
    const expectedStatus = { health: 200, metrics: 200, evaluate: 200, invalid: 400, missing: 404 }[byId("api-preset").value];
    const contract = {
      health: parsed?.service === "qa-lab" && parsed?.status === "ready",
      metrics: Number.isFinite(parsed?.completed) && Number.isFinite(parsed?.capacity),
      evaluate: typeof parsed?.passed === "boolean" && parsed?.valid === true,
      invalid: Boolean(parsed?.fields?.p95Ms),
      missing: parsed?.error === "not_found",
    }[byId("api-preset").value];
    const passed = response.status === expectedStatus && contract;
    showApiEvidence([["HTTP observed / expected", `${response.status} / ${expectedStatus}`], ["Response time", byId("api-response-time").textContent], ["JSON contract", contract ? "Matched" : "Mismatch"]], `${passed ? "PASS" : "FAIL"} · Status and required response fields ${passed ? "matched" : "did not match"}.`, passed ? "pass" : "fail");
  } catch (error) {
    byId("api-response-status").textContent = "Request failed";
    byId("api-response").textContent = error.message;
    showApiEvidence([["HTTP status", "No response"], ["Response time", "–"], ["JSON contract", "Not checked"]], "FAIL · The request did not complete.", "fail");
  }
}

function planPayload() {
  return { name: byId("plan-name").value, scenario: byId("plan-scenario").value, targetVus: byId("plan-vus").value, notes: byId("plan-notes").value };
}

function showPlanStep(step) {
  [1, 2, 3].forEach((number) => {
    byId(`plan-step-${number}`).hidden = number !== step;
    document.querySelector(`.steps [data-step="${number}"]`).classList.toggle("current", number === step);
  });
}

function reviewPlan(event) {
  event.preventDefault();
  const result = validatePlan(planPayload());
  for (const field of ["name", "scenario", "targetVus", "notes"]) byId(`plan-error-${field}`).textContent = result.errors[field] || "";
  if (!result.valid) {
    showE2eEvidence([["Valid fields", `${4 - Object.keys(result.errors).length} / 4`], ["Save response", "Not sent"], ["Retrieved plan", "Not checked"]], "FAIL · Fix the highlighted input before saving.", "fail");
    return;
  }
  showE2eEvidence([["Valid fields", "4 / 4"], ["Save response", "Not sent"], ["Retrieved plan", "Not checked"]], "VALIDATED · Continue to Save plan; the end-to-end check is not complete yet.");
  const labels = { name: "Plan name", scenario: "Scenario", targetVus: "Peak users", notes: "Notes" };
  byId("plan-review").replaceChildren(...Object.entries(result.value).map(([key, value]) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = labels[key];
    detail.textContent = String(value || "–");
    row.append(term, detail);
    return row;
  }));
  showPlanStep(2);
}

async function savePlan() {
  byId("plan-save-error").textContent = "";
  try {
    const response = await fetch("/api/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(planPayload()) });
    const body = await response.json();
    if (!response.ok) throw new Error(Object.values(body.fields || {}).join(" ") || "Plan could not be saved.");
    const verify = await fetch(`/api/plans/${body.plan.id}`);
    if (!verify.ok) throw new Error("Saved plan could not be retrieved.");
    const saved = (await verify.json()).plan;
    if (saved?.name !== body.plan.name || saved?.scenario !== body.plan.scenario || saved?.targetVus !== body.plan.targetVus) throw new Error("Retrieved plan does not match what was saved.");
    byId("plan-saved-copy").textContent = `${body.plan.name} · ${body.plan.scenario} · ${body.plan.targetVus} VUs`;
    byId("plan-saved-id").textContent = body.plan.id;
    showPlanStep(3);
    showE2eEvidence([["Valid fields", "4 / 4"], ["Save response", `HTTP ${response.status}`], ["Retrieved plan", "Matched ID + fields"]], "PASS · The plan was saved and retrieved through the UI/API flow.", "pass");
  } catch (error) {
    byId("plan-save-error").textContent = error.message;
    showE2eEvidence([["Valid fields", "4 / 4"], ["Save response", "Failed"], ["Retrieved plan", "Not verified"]], `FAIL · ${error.message}`, "fail");
  }
}

function measureMobile() {
  const width = document.documentElement.clientWidth;
  const content = document.documentElement.scrollWidth;
  byId("mobile-viewport").textContent = `${width} px`;
  byId("mobile-page-width").textContent = `${content} px`;
  byId("mobile-touch").textContent = navigator.maxTouchPoints > 0 ? "Available" : "Not detected";
  byId("mobile-overflow").textContent = content > width ? "Detected" : "None";
  byId("mobile-overflow").style.color = content > width ? "var(--coral)" : "var(--green)";
  const overflow = Math.max(0, content - width);
  showMobileEvidence([["Viewport", `${width} px`], ["Horizontal overflow", `${overflow} px`], ["Allowed overflow", "0 px"]], `${overflow ? "FAIL" : "PASS"} · Page-level layout at this viewport. This does not certify touch or native mobile behavior.`, overflow ? "fail" : "pass");
}

function setVisualVariant(variant) {
  document.querySelectorAll("[data-visual]").forEach((button) => button.classList.toggle("selected", button.dataset.visual === variant));
  byId("visual-specimen").classList.toggle("shifted", variant === "shifted");
  const heading = byId("visual-specimen").querySelector(".specimen-heading");
  const transform = getComputedStyle(heading).transform;
  const shift = transform === "none" ? 0 : Math.round(new DOMMatrixReadOnly(transform).m41);
  const changes = Number(shift !== 0) + Number(variant === "shifted");
  showVisualEvidence([["Heading shift", `${shift} px`], ["Style differences", String(changes)], ["Allowed shift", "0 px"]], `${changes ? "FAIL" : "PASS"} · ${changes ? "Preview style differs" : "Preview style matches"}. Run Playwright for the actual screenshot assertion.`, changes ? "fail" : "pass");
}

function buildAiPrompt() {
  const requirement = byId("ai-requirement").value.trim();
  const topic = byId("ai-topic").value;
  if (requirement.length < 10 || requirement.length > 500) {
    byId("ai-output").value = "";
    toast("Enter a requirement of 10 to 500 characters.", true);
    return false;
  }
  byId("ai-output").value = `You are assisting a SWT301 software testing student. The system under test is QA Lab, a Node.js/Express app. Focus topic: ${topic}.\n\nRequirement: ${requirement}\n\nRead the real source and API contract before writing tests. Propose key happy-path, invalid, boundary and recovery cases. For each case give setup, steps, expected result and the exact assertion. Then draft runnable tests using Vitest, Supertest, Playwright or k6 as appropriate. Do not invent observed results or claim a test passed before executing it. Keep load tests local unless the server owner gives permission. Flag assumptions and review generated code with a human.`;
  return true;
}

async function loadAiStatus() {
  try {
    const response = await fetch("/api/ai/status");
    if (!response.ok) throw new Error("AI status unavailable");
    const status = await response.json();
    aiReady = status.available;
    aiRequiresCode = status.requiresCode;
    const option = byId("ai-model").querySelector("option");
    option.value = status.model || "gemini-3.5-flash-lite";
    option.textContent = status.model || "Default model";
    updateAiMode();
    byId("ai-status").textContent = aiReady
      ? `Gemini ready (${status.model}). Up to 20 requests per hour on this server.`
      : status.reason === "missing_access_code"
        ? "Group API needs an owner access code. You can use your own API key instead."
        : "Group API is not configured. You can use your own API key instead.";
  } catch {
    byId("ai-generate").disabled = true;
    byId("ai-status").textContent = "Could not check Gemini status. Prompt builder still works.";
  }
}

function updateAiMode() {
  byId("ai-mode-group").classList.toggle("selected", aiMode === "group");
  byId("ai-mode-personal").classList.toggle("selected", aiMode === "personal");
  byId("ai-access-wrap").hidden = aiMode !== "group" || !aiRequiresCode;
  byId("ai-personal-wrap").hidden = aiMode !== "personal";
  byId("ai-generate").disabled = aiMode === "group" ? !aiReady : !byId("ai-personal-key").value.trim();
}

function aiCredentials() {
  return aiMode === "personal"
    ? { mode: "personal", apiKey: byId("ai-personal-key").value.trim() }
    : { mode: "group", accessCode: byId("ai-access-code").value };
}

async function loadAiModels() {
  if (aiMode === "personal" && !byId("ai-personal-key").value.trim()) {
    byId("ai-status").textContent = "Enter your API key first.";
    return;
  }
  if (aiMode === "group" && (!aiReady || (aiRequiresCode && !byId("ai-access-code").value))) {
    byId("ai-status").textContent = "Enter the group access code first.";
    return;
  }
  byId("ai-load-models").disabled = true;
  byId("ai-status").textContent = "Loading available Gemini models...";
  try {
    const response = await fetch("/api/ai/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(aiCredentials()) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Could not load models.");
    if (!data.models.length) throw new Error("No text generation models were returned for this key.");
    const previous = byId("ai-model").value;
    byId("ai-model").replaceChildren(...data.models.map((model) => {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = `${model.label} (${model.id})`;
      return option;
    }));
    if (data.models.some((model) => model.id === previous)) byId("ai-model").value = previous;
    byId("ai-status").textContent = `${data.models.length} available Gemini models loaded. Choose one, then generate.`;
  } catch (error) {
    byId("ai-status").textContent = error.message;
  } finally {
    byId("ai-load-models").disabled = false;
  }
}

async function generateAiCases() {
  if ((aiMode === "group" && !aiReady) || !buildAiPrompt()) return;
  const accessCode = byId("ai-access-code").value;
  if (aiMode === "group" && aiRequiresCode && !accessCode) {
    byId("ai-status").textContent = "Enter the group access code to generate test cases.";
    byId("ai-access-code").focus();
    return;
  }
  const button = byId("ai-generate");
  button.disabled = true;
  byId("ai-status").textContent = "Generating test cases...";
  byId("ai-result-wrap").hidden = true;
  try {
    const response = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: byId("ai-topic").value, requirement: byId("ai-requirement").value.trim(), model: byId("ai-model").value, ...aiCredentials() }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Gemini request failed.");
    byId("ai-result").textContent = result.text;
    byId("ai-result-wrap").hidden = false;
    aiDraftReady = true;
    updateAiEvidence();
    byId("ai-status").textContent = "Draft ready. Check its assertions and run the test before reporting a pass.";
  } catch (error) {
    byId("ai-status").textContent = error.message || "Gemini request failed.";
    toast(byId("ai-status").textContent, true);
  } finally {
    updateAiMode();
  }
}

function updateAiEvidence() {
  const checks = [...byId("view-ai").querySelectorAll(".checklist input")];
  const reviewed = checks.filter((box) => box.checked).length;
  const done = aiDraftReady && reviewed === checks.length;
  showAiEvidence([["Draft generated", aiDraftReady ? "Yes" : "No"], ["Review checks", `${reviewed} / ${checks.length}`], ["Model", byId("ai-model").value]], done ? "REVIEW COMPLETE · Confirm actual test results separately; this is not an automated pass." : "NOT VERIFIED · AI output needs human review and a real test run.", done ? "pass" : "");
}

async function loadCiStatus() {
  showCiEvidence([["Latest run", "Loading"], ["State", "Checking"], ["Updated", "–"]], "Checking the latest public GitHub Actions run...");
  try {
    const response = await fetch("https://api.github.com/repos/ZoeChan189/qa-playground/actions/runs?per_page=1", { headers: { Accept: "application/vnd.github+json" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("GitHub Actions status unavailable");
    const run = (await response.json()).workflow_runs?.[0];
    if (!run) throw new Error("No workflow run found");
    const status = run.status === "completed" ? run.conclusion : run.status;
    const decision = status === "success" ? "PASS" : ["failure", "cancelled", "timed_out"].includes(status) ? "FAIL" : "PENDING";
    showCiEvidence([["Latest run", `#${run.run_number}`], ["State", status], ["Updated", readableTime(run.updated_at)]], `${decision} · ${run.name}. Open Actions for job-by-job results.`, decision === "PASS" ? "pass" : decision === "FAIL" ? "fail" : "");
  } catch (error) {
    showCiEvidence([["Latest run", "Unavailable"], ["State", "Unknown"], ["Updated", "–"]], `${error.message}. Open Actions for the authoritative result.`);
  }
}

document.querySelectorAll(".topic-link").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.view)));
document.querySelectorAll("[data-scenario]").forEach((button) => button.addEventListener("click", () => selectScenario(button.dataset.scenario)));
document.querySelectorAll("[data-visual]").forEach((button) => button.addEventListener("click", () => setVisualVariant(button.dataset.visual)));
byId("copy-perf-command").addEventListener("click", () => copyText(byId("perf-command").textContent));
byId("perf-vus").addEventListener("input", updatePeak);
byId("run-probe").addEventListener("click", runProbe);
byId("run-k6").addEventListener("click", startK6Run);
byId("bridge-connect").addEventListener("click", connectLocalK6);
byId("summary-file").addEventListener("change", (event) => { importSummary(event.target.files[0]); event.target.value = ""; });
byId("unit-form").addEventListener("submit", runUnit);
byId("api-preset").addEventListener("change", updateApiPreset);
byId("send-api").addEventListener("click", sendApiRequest);
byId("plan-form").addEventListener("submit", reviewPlan);
byId("plan-back").addEventListener("click", () => showPlanStep(1));
byId("plan-save").addEventListener("click", savePlan);
byId("plan-new").addEventListener("click", () => { byId("plan-form").reset(); showPlanStep(1); });
byId("mobile-check").addEventListener("click", measureMobile);
byId("mobile-open-plan").addEventListener("click", () => navigate("e2e"));
byId("ai-build").addEventListener("click", buildAiPrompt);
byId("ai-copy").addEventListener("click", () => { if (buildAiPrompt()) copyText(byId("ai-output").value); });
byId("ai-generate").addEventListener("click", generateAiCases);
byId("ai-copy-result").addEventListener("click", () => copyText(byId("ai-result").textContent));
byId("ai-mode-group").addEventListener("click", () => { aiMode = "group"; updateAiMode(); });
byId("ai-mode-personal").addEventListener("click", () => { aiMode = "personal"; updateAiMode(); });
byId("ai-personal-key").addEventListener("input", updateAiMode);
byId("ai-load-models").addEventListener("click", loadAiModels);
byId("ai-model").addEventListener("change", updateAiEvidence);
byId("view-ai").querySelectorAll(".checklist input").forEach((box) => box.addEventListener("change", updateAiEvidence));
window.addEventListener("hashchange", syncRoute);
window.addEventListener("resize", () => { if (byId("view-mobile").classList.contains("active")) measureMobile(); });

updateApiPreset();
buildAiPrompt();
byId("bridge-controls").hidden = localPage;
setVisualVariant("baseline");
updateAiEvidence();
loadAiStatus();
checkHealth();
try {
  const response = await fetch("/api/perf/scenarios");
  if (!response.ok) throw new Error("Scenario data unavailable");
  scenarios = (await response.json()).scenarios;
  byId("summary-file").disabled = false;
  syncRoute();
  pollTelemetry();
  pollLatestRun();
} catch {
  toast("Performance scenarios could not be loaded.", true);
  syncRoute();
}
setInterval(() => { if (!document.hidden) { checkHealth(); pollTelemetry(); pollLatestRun(); } }, 2000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { pollTelemetry(); pollLatestRun(); } });
