import { createApp } from "./app.js";
import { execFile } from "node:child_process";

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

createApp().listen(port, host, () => {
  const url = `http://localhost:${port}`;
  console.log(`QA Lab ready at ${url}`);
  if (process.platform === "win32" && process.env.QA_LAB_OPEN_BROWSER === "1") {
    execFile("rundll32.exe", ["url.dll,FileProtocolHandler", url], { windowsHide: true }, (error) => {
      if (error) console.error(`Could not open the browser automatically. Open ${url} manually.`);
    });
  }
});
