import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rmdir, stat, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { perfScenarios } from "./perf-scenarios.js";
import { scenarioWithPeak } from "../../public/shared/perf-profile.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const resultsDir = path.join(root, "results");
const savedName = /^(load|stress|spike|soak)-\d{4}-.*\.json$/;

function validSummary(summary) {
  const metrics = summary?.metrics;
  return metrics && Number.isFinite(metrics.http_reqs?.count)
    && Number.isFinite(metrics.http_req_duration?.["p(95)"])
    && Number.isFinite(metrics.http_req_failed?.value);
}

async function latestSavedRun() {
  let names;
  try {
    names = (await readdir(resultsDir)).filter((name) => savedName.test(name));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const files = await Promise.all(names.map(async (name) => {
    const info = await stat(path.join(resultsDir, name));
    return { name, modified: info.mtimeMs, size: info.size };
  }));
  files.sort((a, b) => b.modified - a.modified);
  for (const file of files) {
    if (file.size > 5_000_000) continue;
    try {
      const summary = JSON.parse(await readFile(path.join(resultsDir, file.name), "utf8"));
      if (!validSummary(summary)) continue;
      return {
        id: `saved:${file.name}:${file.modified}`,
        status: "complete",
        source: "saved",
        filename: file.name,
        scenario: file.name.match(savedName)[1],
        startedAt: new Date(file.modified).toISOString(),
        finishedAt: new Date(file.modified).toISOString(),
        summary,
      };
    } catch {
      // A CLI run may still be writing its summary; use the previous complete file.
    }
  }
  return null;
}

function publicRun(run) {
  if (!run) return null;
  const { id, status, source, filename, scenario, peakVus, startedAt, finishedAt, exitCode, message, summary } = run;
  return { id, status, source, filename, scenario, peakVus, startedAt, finishedAt, exitCode, message, summary };
}

export function createLocalPerfRunner({
  enabled = process.env.NODE_ENV !== "production" && (!process.env.HOST || /^(localhost|127\.0\.0\.1|::1)$/.test(process.env.HOST)),
  bin = process.env.K6_BIN || "k6",
  port = process.env.PORT || "4173",
} = {}) {
  const installed = enabled && (() => {
    const check = spawnSync(bin, ["version"], { encoding: "utf8", windowsHide: true, timeout: 3000 });
    return !check.error && check.status === 0;
  })();
  let active = null;
  let lastCompleted = null;

  async function latest() {
    if (!enabled) return { canRun: false, reason: "hosted", run: null };
    const saved = await latestSavedRun();
    const current = active || lastCompleted;
    const currentTime = current ? Date.parse(current.finishedAt || current.startedAt) : 0;
    const savedTime = saved ? Date.parse(saved.finishedAt) : 0;
    return {
      canRun: installed,
      reason: installed ? null : "k6_missing",
      run: publicRun(active || (current && currentTime >= savedTime ? current : saved)),
    };
  }

  async function execute(run) {
    let tempDir;
    let log = "";
    try {
      tempDir = await mkdtemp(path.join(os.tmpdir(), "qa-lab-k6-"));
      const output = path.join(tempDir, "summary.json");
      const script = path.join(root, "k6", `${run.scenario}.js`);
      const baseUrl = `http://127.0.0.1:${port}`;
      const child = spawn(bin, ["run", "--quiet", "--summary-export", output, script], {
        cwd: root,
        env: { ...process.env, BASE_URL: baseUrl, PERF_PEAK_VUS: String(run.peakVus) },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      for (const stream of [child.stdout, child.stderr]) {
        stream.on("data", (chunk) => { log = (log + chunk.toString()).slice(-6000); });
      }
      const timeout = setTimeout(() => child.kill(), 180_000);
      const { code, error } = await new Promise((resolve) => {
        let launchError = null;
        child.on("error", (cause) => { launchError = cause; });
        child.on("close", (exitCode) => resolve({ code: exitCode, error: launchError }));
      });
      clearTimeout(timeout);
      run.exitCode = code;
      if (error) throw error;
      const summary = JSON.parse(await readFile(output, "utf8"));
      if (!validSummary(summary)) throw new Error("k6 did not return a valid summary.");
      run.summary = summary;
      run.status = "complete";
    } catch (error) {
      run.status = "error";
      run.message = `${error.message}${log ? ` ${log.trim().slice(-500)}` : ""}`;
    } finally {
      run.finishedAt = new Date().toISOString();
      active = null;
      lastCompleted = run;
      if (tempDir) {
        await unlink(path.join(tempDir, "summary.json")).catch(() => {});
        await rmdir(tempDir).catch(() => {});
      }
    }
  }

  function start(scenario, peakVus) {
    if (!enabled) return { ok: false, status: 403, error: "local_only", message: "Run k6 on a local QA Lab copy, not on the hosted site." };
    if (!installed) return { ok: false, status: 503, error: "k6_missing", message: "Install Grafana k6, then restart QA Lab." };
    try {
      scenarioWithPeak(scenario, perfScenarios[scenario], peakVus);
    } catch {
      return { ok: false, status: 400, error: "invalid_run", message: "Choose a scenario and a whole-number peak VU count." };
    }
    if (active) return { ok: false, status: 409, error: "run_in_progress", message: "Another k6 run is still in progress." };
    const run = {
      id: randomUUID(),
      status: "running",
      source: "browser",
      scenario,
      peakVus,
      startedAt: new Date().toISOString(),
    };
    active = run;
    void execute(run);
    return { ok: true, status: 202, run: publicRun(run) };
  }

  return { latest, start };
}
