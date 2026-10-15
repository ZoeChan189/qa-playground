import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openSync, closeSync, mkdirSync } from "node:fs";
import os from "node:os";
import { DEFAULT_BRIDGE_ORIGIN, pairWithLocalServer, parseConnectUri } from "../domain/local-bridge.js";
import { inspectConnector, verifyConnector } from "../domain/connector-startup.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const origin = process.env.LOCAL_BRIDGE_ORIGIN || DEFAULT_BRIDGE_ORIGIN;
async function connect() {
  const pair = parseConnectUri(process.argv[2], origin);
  if (await inspectConnector(pair)) {
    await pairWithLocalServer(pair);
    await verifyConnector(pair);
    console.log("QA Lab connected. Return to the website to run k6.");
    return;
  }
  const logDir = path.join(process.env.LOCALAPPDATA || os.homedir(), "QA Lab", "logs");
  mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, "server-startup.log");
  const log = openSync(logPath, "a", 0o600);
  const child = spawn(process.execPath, [path.join(root, "src/server.js")], {
    cwd: root, detached: true, windowsHide: true, stdio: ["ignore", "ignore", log],
    env: { ...process.env, NODE_ENV: "development", HOST: "127.0.0.1", PORT: "4173", QA_LAB_OPEN_BROWSER: "0" },
  });
  closeSync(log);
  let startError;
  child.on("error", (error) => { startError = error; });
  child.unref();
  let connected = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (startError) throw new Error(`Node could not start QA Lab. Run setup-windows.cmd again. Startup log: ${logPath}`);
    try { await pairWithLocalServer(pair); connected = true; break; }
    catch { /* The server may still be starting. */ }
  }
  if (!connected) throw new Error(`QA Lab could not start. Run setup-windows.cmd in the latest folder and check port 4173. Startup log: ${logPath}`);
  await verifyConnector(pair);
  console.log("QA Lab connected. Return to the website to run k6.");
}

try { await connect(); }
catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
