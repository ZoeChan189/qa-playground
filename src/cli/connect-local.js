import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_BRIDGE_ORIGIN, pairWithLocalServer, parseConnectUri } from "../domain/local-bridge.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const origin = process.env.LOCAL_BRIDGE_ORIGIN || DEFAULT_BRIDGE_ORIGIN;
const pair = parseConnectUri(process.argv[2], origin);
try {
  await pairWithLocalServer(pair);
} catch {
  const child = spawn(process.execPath, [path.join(root, "src/server.js")], {
    cwd: root, detached: true, windowsHide: true, stdio: "ignore",
    env: { ...process.env, NODE_ENV: "development", HOST: "127.0.0.1", PORT: "4173", QA_LAB_OPEN_BROWSER: "0" },
  });
  child.unref();
  let connected = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try { await pairWithLocalServer(pair); connected = true; break; }
    catch { /* The server may still be starting. */ }
  }
  if (!connected) throw new Error("QA Lab could not start. Close an older QA Lab server on port 4173, then connect again.");
}
console.log("QA Lab connected. Return to the website to run k6.");
