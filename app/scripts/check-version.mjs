import { readFileSync, appendFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function checkVersions(root) {
  const json = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
  const app = json("package.json");
  const lock = json("package-lock.json");
  const cargo = readFileSync(resolve(root, "src-tauri/Cargo.toml"), "utf8");
  const cargoLock = readFileSync(resolve(root, "src-tauri/Cargo.lock"), "utf8");
  const versions = {
    Tauri: json("src-tauri/tauri.conf.json").version,
    "npm lockfile": lock.version,
    "npm package lock": lock.packages?.[""]?.version,
    Rust: cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1],
    "Cargo lockfile": cargoLock.match(
      /\[\[package\]\]\s+name = "trama"\s+version = "([^"]+)"/,
    )?.[1],
  };
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(app.version)) {
    throw new Error("Invalid app version.");
  }
  for (const [name, version] of Object.entries(versions)) {
    if (version !== app.version) {
      throw new Error(
        `${name} version ${version ?? "missing"} differs from npm ${app.version}.`,
      );
    }
  }
  return app.version;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const version = checkVersions(root);
  if (process.argv.includes("--release")) {
    const tag = `v${version}`;
    const exists = spawnSync("git", [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/tags/${tag}`,
    ]);
    if (exists.status === 0) {
      const revision = (ref) =>
        execFileSync("git", ["rev-parse", ref], { encoding: "utf8" }).trim();
      if (revision(`${tag}^{commit}`) !== revision("HEAD")) {
        throw new Error(
          `${tag} points to another commit. Bump the app version before releasing.`,
        );
      }
    } else if (exists.status !== 1) {
      throw new Error("Could not check the release tag.");
    }
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  }
  console.log(`App versions match ${version}.`);
}
