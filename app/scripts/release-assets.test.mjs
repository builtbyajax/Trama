import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  checksums,
  createLatestManifest,
  stageInstaller,
  stageUpdaterArtifact,
} from "./release-assets.mjs";

test("stages signed update bundles, emits latest.json and checksums all assets", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "trama-release-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dest = join(dir, "assets");
  mkdirSync(dest);
  const definitions = [
    ["macOS_Apple-Silicon", ".dmg", ".app.tar.gz", "darwin-aarch64-app"],
    ["macOS_Intel", ".dmg", ".app.tar.gz", "darwin-x86_64-app"],
    ["Windows_x64_Setup", ".exe", ".nsis.zip", "windows-x86_64-nsis"],
  ];

  assert.throws(() => checksums(dest), /three installers/);
  for (const [platform, installerExtension, updaterExtension] of definitions) {
    const installer = join(dir, `${platform}${installerExtension}`);
    const updater = join(dir, `${platform}${updaterExtension}`);
    writeFileSync(installer, `Installer ${platform}`);
    writeFileSync(updater, `Updater bundle ${platform}`);
    writeFileSync(`${updater}.sig`, `Signature ${platform}\n`);
    stageInstaller([installer], "0.2.2", platform, dest);
    stageUpdaterArtifact([updater, `${updater}.sig`], "0.2.2", platform, dest);
  }
  writeFileSync(join(dest, "RELEASE_NOTES.md"), "Update notes");
  const manifest = createLatestManifest(dest, "0.2.2", "builtbyajax/Trama");

  assert.equal(manifest.version, "0.2.2");
  assert.equal(manifest.notes, "Update notes");
  assert.deepEqual(
    Object.keys(manifest.platforms).sort(),
    definitions.map(([, , , target]) => target).sort(),
  );
  assert.ok(
    manifest.platforms["windows-x86_64-nsis"].url.includes("builtbyajax/Trama"),
  );
  assert.equal(
    manifest.platforms["darwin-aarch64-app"].signature,
    "Signature macOS_Apple-Silicon",
  );

  const text = checksums(dest);
  const lines = text.trim().split("\n");
  assert.equal(lines.length, 10);
  assert.ok(lines.some((line) => line.endsWith("latest.json")));
  assert.ok(lines.some((line) => line.endsWith("_updater.app.tar.gz")));
  assert.ok(lines.some((line) => line.endsWith("_updater.nsis.zip.sig")));
  assert.ok(
    text.includes(
      createHash("sha256")
        .update(readFileSync(join(dest, "Trama_0.2.2_Windows_x64_Setup.exe")))
        .digest("hex"),
    ),
  );
  assert.equal(readFileSync(join(dest, "SHA256SUMS"), "utf8"), text);
  assert.throws(
    () =>
      stageInstaller(
        [join(dir, "Windows_x64_Setup.exe")],
        "0.2.2",
        "Windows_x64_Setup",
        dest,
      ),
    /overwrite/,
  );
  assert.throws(
    () => stageInstaller([], "0.2.2", "macOS_Intel", dest),
    /exactly one platform installer/,
  );
  assert.throws(
    () => stageUpdaterArtifact([], "0.2.2", "Windows_x64_Setup", dest),
    /exactly one platform updater bundle/,
  );
  assert.throws(
    () => stageInstaller([], "../../escape", "macOS_Intel", dest),
    /version/,
  );
  assert.throws(
    () => createLatestManifest(dest, "0.2.2", "not a repo"),
    /repository/,
  );
});

test("finds Tauri updater bundles outside the reported installer paths", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "trama-updater-paths-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dest = join(dir, "assets");
  const definitions = [
    ["macOS_Apple-Silicon", ".dmg", ".app.tar.gz", "dmg", "macos"],
    ["macOS_Intel", ".dmg", ".app.tar.gz", "dmg", "macos"],
    ["Windows_x64_Setup", ".exe", ".nsis.zip", "nsis", "nsis"],
  ];

  for (const [
    platform,
    installerExtension,
    updaterExtension,
    installerDir,
    updaterDir,
  ] of definitions) {
    const bundle = join(dir, platform, "bundle");
    const installerDirectory = join(bundle, installerDir);
    const updaterDirectory = join(bundle, updaterDir);
    mkdirSync(installerDirectory, { recursive: true });
    mkdirSync(updaterDirectory, { recursive: true });
    const installer = join(
      installerDirectory,
      `Trama_${platform}${installerExtension}`,
    );
    const updater = join(
      updaterDirectory,
      `Trama_${platform}${updaterExtension}`,
    );
    writeFileSync(installer, `Installer ${platform}`);
    writeFileSync(updater, `Updater bundle ${platform}`);
    writeFileSync(`${updater}.sig`, `Signature ${platform}\n`);

    const staged = stageUpdaterArtifact([installer], "0.2.2", platform, dest);

    assert.equal(readFileSync(staged, "utf8"), `Updater bundle ${platform}`);
    assert.equal(
      readFileSync(`${staged}.sig`, "utf8"),
      `Signature ${platform}\n`,
    );
  }
});
