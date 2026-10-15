import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";

function dpapi(value, decrypt = false) {
  return new Promise((resolve, reject) => {
    const operation = decrypt ? "Unprotect" : "Protect";
    const input = decrypt ? "[Convert]::FromBase64String($text)" : "[Text.Encoding]::UTF8.GetBytes($text)";
    const output = decrypt ? "[Text.Encoding]::UTF8.GetString($result)" : "[Convert]::ToBase64String($result)";
    const command = `Add-Type -AssemblyName System.Security; $text=[Console]::In.ReadToEnd(); $result=[Security.Cryptography.ProtectedData]::${operation}(${input},$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write(${output})`;
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    let text = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("Windows credential protection timed out.")); }, 15_000);
    child.stdout.on("data", (chunk) => { text += chunk; });
    child.on("error", () => { clearTimeout(timer); reject(new Error("Windows credential protection is unavailable.")); });
    child.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve(text) : reject(new Error("Windows could not unlock QA Lab credentials. Use the same Windows user account.")); });
    child.stdin.on("error", () => {});
    child.stdin.end(value);
  });
}

export function createChatGptStore({ directory = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".config"), "QA Lab", "chatgpt"),
  protect = (value) => process.platform === "win32" ? dpapi(value) : value,
  unprotect = (value) => process.platform === "win32" ? dpapi(value, true) : value } = {}) {
  const file = path.join(directory, "credentials.dat");
  return {
    async load() {
      try { return JSON.parse(await unprotect(await readFile(file, "utf8"))); }
      catch (error) { if (error.code === "ENOENT") return null; throw new Error("Saved ChatGPT credentials could not be read. Check the QA Lab credential folder for this Windows user."); }
    },
    async save(value) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temporary = `${file}.${process.pid}.tmp`;
      try {
        await writeFile(temporary, await protect(JSON.stringify(value)), { mode: 0o600 });
        await rename(temporary, file);
      } finally { await rm(temporary, { force: true }); }
    },
  };
}
