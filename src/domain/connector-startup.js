import { readJson, connectorHelp } from "../../public/shared/http-json.js";

export async function inspectConnector(pair, { fetchImpl = fetch, port = 4173 } = {}) {
  let health;
  try { health = await fetchImpl(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) }); }
  catch (error) {
    if (error.cause?.code === "ECONNREFUSED" || error.code === "ECONNREFUSED") return false;
    throw new Error(`Cannot reach local port ${port}. ${connectorHelp}`);
  }
  const data = await readJson(health, "Local connector");
  if (!health.ok || data.service !== "qa-lab") throw new Error(`Port ${port} belongs to another application. Close that application or its server before connecting QA Lab.`);
  const status = await fetchImpl(`http://127.0.0.1:${port}/api/version`, { signal: AbortSignal.timeout(2000) });
  const version = await readJson(status, "Local connector");
  // Older servers expose a pairing pipe but serve HTML for missing bridge routes.
  const parts = String(version.version || "").split(".").map(Number);
  if (!status.ok || parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)
    || (parts[0] === 1 && parts[1] < 3) || parts[0] < 1) {
    throw new Error(`An older or incompatible QA Lab is already using port ${port}. ${connectorHelp}`);
  }
  return true;
}

export async function verifyConnector(pair, { fetchImpl = fetch, port = 4173 } = {}) {
  const response = await fetchImpl(`http://127.0.0.1:${port}/local-bridge/scenarios`, {
    headers: { Origin: pair.origin, "X-QA-Bridge-Code": pair.token }, signal: AbortSignal.timeout(3000),
  });
  const data = await readJson(response, "Local connector");
  if (!response.ok || !["load", "stress", "spike", "soak"].every((key) => Array.isArray(data.scenarios?.[key]?.stages))) {
    throw new Error(`The local connector is incompatible or rejected pairing. ${connectorHelp}`);
  }
}
