import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";

// Exercise the real helper without opening a window or touching personal data.
test(
  "macOS relaunch waits for exit and preserves arguments and data overrides",
  {
    skip: process.platform !== "darwin",
    timeout: 60000,
  },
  async () => {
    const root = mkdtempSync(join(tmpdir(), "trama-relaunch-test-"));
    const bundle = join(root, "Relaunch Fixture.app");
    const contents = join(bundle, "Contents");
    const marker = join(root, "launched.json");
    const helper = join(root, "relaunch");
    const fixture = join(root, "fixture.swift");
    let previous;
    let child;
    try {
      mkdirSync(join(contents, "MacOS"), { recursive: true });
      writeFileSync(
        join(contents, "Info.plist"),
        `<?xml version="1.0"?><plist version="1.0"><dict>
      <key>CFBundleIdentifier</key><string>dev.trama.relaunch-fixture.${randomUUID()}</string>
      <key>CFBundleExecutable</key><string>fixture</string>
      <key>CFBundlePackageType</key><string>APPL</string>
      <key>LSUIElement</key><true/>
      </dict></plist>`,
      );
      writeFileSync(
        fixture,
        `import Foundation
let result: [String:Any] = ["arguments": Array(CommandLine.arguments.dropFirst(1)),
 "home": ProcessInfo.processInfo.environment["TRAMA_HOME"] ?? "",
 "db": ProcessInfo.processInfo.environment["TRAMA_DB"] ?? ""]
try JSONSerialization.data(withJSONObject:result).write(to:URL(fileURLWithPath:CommandLine.arguments[1]))
`,
      );
      execFileSync("/usr/bin/swiftc", [
        "-O",
        "-swift-version",
        "5",
        fixture,
        "-o",
        join(contents, "MacOS/fixture"),
      ]);
      const source = fileURLToPath(
        new URL("../src-tauri/src/relaunch-macos.swift", import.meta.url),
      );
      execFileSync("/usr/bin/swiftc", [
        "-O",
        "-swift-version",
        "5",
        source,
        "-o",
        helper,
      ]);
      const intel = join(root, "relaunch-intel");
      execFileSync("/usr/bin/swiftc", [
        "-O",
        "-swift-version",
        "5",
        "-target",
        "x86_64-apple-macosx14.0",
        source,
        "-o",
        intel,
      ]);
      assert.match(
        execFileSync("/usr/bin/lipo", ["-archs", intel], { encoding: "utf8" }),
        /x86_64/,
      );
      const invalid = join(root, "invalid-helper");
      copyFileSync(helper, invalid);
      assert.throws(() =>
        execFileSync(invalid, [join(root, "missing.app"), "1"], {
          stdio: "pipe",
        }),
      );
      assert.equal(existsSync(invalid), false);
      previous = spawn("/bin/sleep", ["30"], { stdio: "ignore" });
      child = spawn(
        helper,
        [bundle, String(previous.pid), marker, "argument with spaces"],
        {
          env: {
            ...process.env,
            TRAMA_HOME: join(root, "isolated-home"),
            TRAMA_DB: join(root, "isolated.sqlite"),
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      let errors = "";
      child.stdout.on("data", (data) => (output += data));
      child.stderr.on("data", (data) => (errors += data));
      const exited = new Promise((resolve, reject) => {
        child.once("exit", (code) => resolve(code));
        child.once("error", reject);
      });
      const readyDeadline = Date.now() + 5000;
      while (!output.includes("READY") && Date.now() < readyDeadline)
        await pause(20);
      assert.match(output, /READY/);
      await pause(150);
      assert.equal(
        existsSync(marker),
        false,
        "must wait for the old PID to exit",
      );
      previous.kill("SIGTERM");
      assert.equal(await exited, 0, errors);
      const launchDeadline = Date.now() + 5000;
      while (!existsSync(marker) && Date.now() < launchDeadline)
        await pause(20);
      const result = JSON.parse(readFileSync(marker, "utf8"));
      assert.deepEqual(result.arguments, [marker, "argument with spaces"]);
      assert.equal(result.home, join(root, "isolated-home"));
      assert.equal(result.db, join(root, "isolated.sqlite"));
      const log = JSON.parse(errors.trim());
      assert.equal(log.createsNewApplicationInstance, false);
      assert.deepEqual(log.registeredPidsBeforeLaunch, []);
      assert.equal(existsSync(helper), false);
    } finally {
      previous?.kill("SIGTERM");
      child?.kill("SIGTERM");
      if (existsSync(bundle))
        execFileSync(
          "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
          ["-u", bundle],
        );
      rmSync(root, { recursive: true, force: true });
    }
  },
);
