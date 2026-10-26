import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
export const root = fileURLToPath(new URL("../", import.meta.url));
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
export function prepare({ release = false, target, api = false } = {}) {
  const output = spawnSync("rustc", ["--print", "host-tuple"], {
    encoding: "utf8",
  });
  if (output.status !== 0) throw new Error("Rust isn't available.");
  const host = output.stdout.trim();
  target ??= host;
  const triples =
    target === "universal-apple-darwin"
      ? ["aarch64-apple-darwin", "x86_64-apple-darwin"]
      : [target];
  const binaryDir = resolve(root, "src-tauri/binaries");
  mkdirSync(binaryDir, { recursive: true });
  const config = JSON.parse(process.env.TAURI_CONFIG ?? "{}");
  config.bundle = { ...config.bundle, externalBin: [] };
  for (const triple of triples) {
    const native = triple === host;
    run(
      "cargo",
      [
        "build",
        "--manifest-path",
        "src-tauri/Cargo.toml",
        "--features",
        api ? "agent-cli,dev-bridge" : "agent-cli",
        "--bin",
        "trama-agent",
        ...(api ? ["--bin", "trama-api"] : []),
        ...(!native ? ["--target", triple] : []),
        ...(release ? ["--release"] : []),
      ],
      { env: { ...process.env, TAURI_CONFIG: JSON.stringify(config) } },
    );
    const ext = triple.includes("windows") ? ".exe" : "";
    const targetRoot = process.env.CARGO_TARGET_DIR
      ? resolve(root, process.env.CARGO_TARGET_DIR)
      : resolve(root, "src-tauri/target");
    const directory = native ? targetRoot : resolve(targetRoot, triple);
    const destination = resolve(binaryDir, `trama-agent-${triple}${ext}`);
    copyFileSync(
      resolve(directory, release ? "release" : "debug", `trama-agent${ext}`),
      destination,
    );
    if (process.platform !== "win32") chmodSync(destination, 0o755);
  }
  if (target === "universal-apple-darwin")
    run("lipo", [
      "-create",
      ...triples.map((t) => resolve(binaryDir, `trama-agent-${t}`)),
      "-output",
      resolve(binaryDir, `trama-agent-${target}`),
    ]);
}
