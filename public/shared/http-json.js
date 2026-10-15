export const connectorHelp = "Close older QA Lab windows, download the latest GitHub version, run setup-windows.cmd in that folder, then reconnect. Check port 4173 and the browser's local-network permission.";

export async function readJson(response, context = "QA Lab") {
  const text = await response.text();
  const type = response.headers.get("content-type") || "";
  if (/^\s*</.test(text) || !/\bjson\b/i.test(type)) {
    throw new Error(`${context} returned a web page or non-JSON response (HTTP ${response.status}), not test data. ${context === "Local connector" ? connectorHelp : "Reload the updated QA Lab and check the server connection."}`);
  }
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    throw new Error(`${context} returned invalid JSON (HTTP ${response.status}). ${context === "Local connector" ? connectorHelp : "Retry after checking the server."}`);
  }
}
