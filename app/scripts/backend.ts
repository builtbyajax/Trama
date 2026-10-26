import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const appRoot = fileURLToPath(new URL("../", import.meta.url));
export function command(request: unknown): Promise<unknown> {
  return new Promise((resolveResult, reject) => {
    const binary = resolve(
      appRoot,
      "src-tauri/target/debug",
      process.platform === "win32" ? "trama-api.exe" : "trama-api",
    );
    const child = spawn(binary, [], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error("The Rust core didn't respond."));
      try {
        resolveResult(JSON.parse(output));
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}
