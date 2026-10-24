import { execFileSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  copyFileSync,
  realpathSync,
  readFileSync,
} from "node:fs";
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

test("branch installer checks export the app version without enforcing an existing release tag", (t) => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "trama-version-output-")),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "src-tauri"));
  mkdirSync(join(root, "scripts"));
  const write = (path, value) => writeFileSync(join(root, path), value);
  const version = "0.2.0";
  write("package.json", JSON.stringify({ version }));
  write(
    "package-lock.json",
    JSON.stringify({ version, packages: { "": { version } } }),
  );
  write("src-tauri/tauri.conf.json", JSON.stringify({ version }));
  write(
    "src-tauri/Cargo.toml",
    `[package]\nname = "trama"\nversion = "${version}"\n`,
  );
  write(
    "src-tauri/Cargo.lock",
    `[[package]]\nname = "trama"\nversion = "${version}"\n`,
  );
  copyFileSync(
    new URL("./check-version.mjs", import.meta.url),
    join(root, "scripts/check-version.mjs"),
  );
  const output = join(root, "output");
  execFileSync(process.execPath, [join(root, "scripts/check-version.mjs")], {
    cwd: root,
    env: { ...process.env, GITHUB_OUTPUT: output },
  });
  assert.equal(readFileSync(output, "utf8"), "version=0.2.0\n");
  // Release mode must still reject a version tag on another commit.
  const git = (...args) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Trama test",
        "-c",
        "user.email=tests@example.invalid",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "tag.gpgsign=false",
        "-c",
        "core.hooksPath=disabled-test-hooks",
        ...args,
      ],
      { cwd: root },
    );
  git("init", "-q");
  git("add", ".");
  git("commit", "-qm", "First synthetic commit");
  git("tag", "v0.2.0");
  git("commit", "--allow-empty", "-qm", "Second synthetic commit");
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [join(root, "scripts/check-version.mjs"), "--release"],
        { cwd: root, stdio: "pipe" },
      ),
    /points to another commit/,
  );
});
