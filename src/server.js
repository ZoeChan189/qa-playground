import { createApp } from "./app.js";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const bridgeOrigin = process.env.LOCAL_BRIDGE_ORIGIN || "https://qa-playground-5n74.onrender.com";
const bridgeCode = process.env.NODE_ENV === "production" || host !== "127.0.0.1" ? "" : randomBytes(18).toString("base64url");

createApp({ bridgeCode, bridgeOrigin }).listen(port, host, () => {
  const url = `http://localhost:${port}`;
  console.log(`QA Lab ready at ${url}`);
  if (bridgeCode) console.log(`Hosted-site pairing code for ${bridgeOrigin}: ${bridgeCode}`);
  if (process.platform === "win32" && process.env.QA_LAB_OPEN_BROWSER === "1") {
    execFile("rundll32.exe", ["url.dll,FileProtocolHandler", url], { windowsHide: true }, (error) => {
      if (error) console.error(`Could not open the browser automatically. Open ${url} manually.`);
    });
  }
});
