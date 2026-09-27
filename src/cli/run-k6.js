import { spawn, spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const profile = process.argv[2];
if (!["load", "stress", "spike", "soak"].includes(profile)) {
  console.error("Choose load, stress, spike or soak.");
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const baseUrl = (process.env.BASE_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
const localTarget = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(baseUrl);
if (!localTarget && process.env.ALLOW_REMOTE_LOAD !== "1") {
  console.error("Remote load is blocked. Ask the host operator first, then set ALLOW_REMOTE_LOAD=1.");
  process.exit(2);
}

const bin = process.env.K6_BIN || "k6";
const installed = spawnSync(bin, ["version"], { encoding: "utf8", windowsHide: true });
if (installed.error || installed.status !== 0) {
  console.error("k6 is missing. Install it from https://grafana.com/docs/k6/latest/set-up/install-k6/");
  console.error("Then reopen the terminal, or set K6_BIN to the full path of k6.exe.");
  process.exit(2);
}

try {
  const health = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
  if (!health.ok || (await health.json()).service !== "qa-lab") throw new Error("Wrong server response");
} catch {
  console.error(`QA Lab is not available at ${baseUrl}. Run npm start in another terminal first.`);
  process.exit(2);
}

const resultsDir = path.join(root, "results");
await mkdir(resultsDir, { recursive: true });
const filename = `${profile}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
const output = path.join(resultsDir, filename);
console.log(`Running ${profile} against ${baseUrl}`);
console.log(`Summary: ${output}`);
const child = spawn(bin, ["run", "--quiet", "--summary-export", output, path.join(root, "k6", `${profile}.js`)], {
  cwd: root,
  env: { ...process.env, BASE_URL: baseUrl },
  stdio: "inherit",
  windowsHide: true,
});
child.on("error", (error) => {
  console.error(`Could not start k6: ${error.message}`);
  process.exitCode = 2;
});
child.on("exit", (code) => {
  console.log(`Summary saved to ${output}`);
  process.exitCode = code ?? 2;
});
