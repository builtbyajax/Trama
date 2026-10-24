import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkVersions } from "./check-version.mjs";

test("all package manifests and lockfiles must agree", (t) => {
  const root = mkdtempSync(join(tmpdir(), "trama-version-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "src-tauri"));
  const write = (path, value) => writeFileSync(join(root, path), value);
  write("package.json", JSON.stringify({ version: "0.2.0" }));
  write(
    "package-lock.json",
    JSON.stringify({
      version: "0.2.0",
      packages: { "": { version: "0.2.0" } },
    }),
  );
  write("src-tauri/tauri.conf.json", JSON.stringify({ version: "0.2.0" }));
  write(
    "src-tauri/Cargo.toml",
    '[package]\nname = "trama"\nversion = "0.2.0"\n',
  );
  write(
    "src-tauri/Cargo.lock",
    '[[package]]\nname = "trama"\nversion = "0.2.0"\n',
  );
  assert.equal(checkVersions(root), "0.2.0");
  write(
    "src-tauri/Cargo.lock",
    '[[package]]\nname = "trama"\nversion = "0.1.0"\n',
  );
  assert.throws(() => checkVersions(root), /Cargo lockfile.*differs/);
  write("src-tauri/Cargo.lock", "");
  assert.throws(() => checkVersions(root), /Cargo lockfile version missing/);
});
