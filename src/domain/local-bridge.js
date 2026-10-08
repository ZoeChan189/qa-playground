import net from "node:net";
import { randomBytes } from "node:crypto";

export const DEFAULT_BRIDGE_ORIGIN = "https://qa-playground-5n74.onrender.com";
export const bridgePipe = (port = 4173) => `\\\\.\\pipe\\qa-lab-${port}`;

export function parseConnectUri(value, allowedOrigin = DEFAULT_BRIDGE_ORIGIN) {
  const uri = new URL(value);
  const origin = uri.searchParams.get("origin");
  const token = uri.searchParams.get("token");
  if (uri.protocol !== "qalab:" || uri.hostname !== "connect" || !["", "/"].includes(uri.pathname)
    || uri.username || uri.password || uri.hash || uri.port
    || origin !== allowedOrigin || !/^[a-f0-9]{64}$/.test(token || "")) {
    throw new Error("Invalid QA Lab connection link or unapproved website.");
  }
  return { origin, token };
}

export function createBridgeSession({ origin = DEFAULT_BRIDGE_ORIGIN, code = randomBytes(18).toString("base64url") } = {}) {
  const tokens = new Set();
  return {
    origin,
    code,
    accepts: (token) => token === code || tokens.has(token),
    pair(request) {
      const pair = parseConnectUri(`qalab://connect?${new URLSearchParams(request)}`, origin);
      tokens.add(pair.token);
      if (tokens.size > 8) tokens.delete(tokens.values().next().value);
      return { ready: true };
    },
  };
}

export function listenForLocalPairing(session, port) {
  const server = net.createServer((socket) => {
    socket.setTimeout(5000, () => socket.destroy());
    let buffer = "";
    socket.on("error", () => {});
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > 2048) return socket.destroy();
      if (!buffer.includes("\n")) return;
      try { socket.end(`${JSON.stringify(session.pair(JSON.parse(buffer.split("\n")[0])))}\n`); }
      catch { socket.end('{"ready":false}\n'); }
    });
  });
  server.on("error", (error) => console.error(`Local connection helper unavailable: ${error.code}`));
  server.listen(bridgePipe(port));
  return server;
}

export function pairWithLocalServer(pair, port = 4173) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(bridgePipe(port));
    let buffer = "";
    socket.setTimeout(3000, () => socket.destroy(new Error("Local connection timed out.")));
    socket.on("error", reject);
    socket.on("connect", () => socket.write(`${JSON.stringify(pair)}\n`));
    socket.on("data", (chunk) => { buffer += chunk.toString(); });
    socket.on("end", () => {
      try {
        const result = JSON.parse(buffer);
        if (!result.ready) throw new Error("Local connection rejected.");
        resolve(result);
      } catch (error) { reject(error); }
    });
  });
}
