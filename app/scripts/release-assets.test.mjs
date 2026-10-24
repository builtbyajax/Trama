import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { stageInstaller, checksums } from "./release-assets.mjs";
test("stages three platforms with deterministic names and SHA256SUMS", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "trama-release-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dest = join(dir, "assets");
  const source = join(dir, "installer.dmg");
  writeFileSync(source, "Synthetic installer");
  for (const platform of ["macOS_Apple-Silicon", "macOS_Intel"])
    stageInstaller([source], "0.2.0", platform, dest);
  assert.throws(() => checksums(dest), /three installers/);
  const exe = join(dir, "setup.exe");
  writeFileSync(exe, "Synthetic installer");
  const staged = stageInstaller([exe], "0.2.0", "Windows_x64_Setup", dest);
  const text = checksums(dest);
  assert.equal(text.split("\n").filter(Boolean).length, 3);
  assert.ok(
    text.includes(
      createHash("sha256").update(readFileSync(staged)).digest("hex"),
    ),
  );
  assert.equal(readFileSync(join(dest, "SHA256SUMS"), "utf8"), text);
  assert.throws(
    () => stageInstaller([exe], "0.2.0", "Windows_x64_Setup", dest),
    /overwrite/,
  );
  assert.throws(
    () => stageInstaller([], "0.2.0", "macOS_Intel", dest),
    /exactly one/,
  );
  assert.throws(
    () => stageInstaller([source, source], "0.2.0", "macOS_Intel", dest),
    /exactly one/,
  );
  assert.throws(
    () => stageInstaller([source], "../../escape", "macOS_Intel", dest),
    /version/,
  );
});
