import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const platforms = {
  "macOS_Apple-Silicon": {
    installerExtension: ".dmg",
    updaterExtension: ".app.tar.gz",
    updaterSubdirectory: "../macos",
    target: "darwin-aarch64-app",
  },
  macOS_Intel: {
    installerExtension: ".dmg",
    updaterExtension: ".app.tar.gz",
    updaterSubdirectory: "../macos",
    target: "darwin-x86_64-app",
  },
  Windows_x64_Setup: {
    installerExtension: ".exe",
    updaterExtension: ".nsis.zip",
    updaterSubdirectory: ".",
    target: "windows-x86_64-nsis",
  },
};
const validVersion = (version) => /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version);

function platformFor(name) {
  const platform = platforms[name];
  if (!platform) throw new Error("Invalid platform");
  return platform;
}

function uniquePath(paths, predicate, message) {
  const matches = paths.filter(predicate);
  if (matches.length !== 1) throw new Error(message);
  return matches[0];
}

function copyNew(source, target) {
  if (existsSync(target))
    throw new Error("Refusing to overwrite a release asset");
  copyFileSync(source, target);
  return target;
}

export function stageInstaller(paths, version, platformName, destination) {
  if (!validVersion(version)) throw new Error("Invalid release version");
  const platform = platformFor(platformName);
  const source = uniquePath(
    paths,
    (path) => path.endsWith(platform.installerExtension),
    "Expected exactly one platform installer",
  );
  mkdirSync(destination, { recursive: true });
  const name = `Trama_${version}_${platformName}${platform.installerExtension}`;
  return copyNew(source, resolve(destination, name));
}

export function stageUpdaterArtifact(
  paths,
  version,
  platformName,
  destination,
) {
  if (!validVersion(version)) throw new Error("Invalid release version");
  const platform = platformFor(platformName);
  let updaterPaths = paths.filter((path) =>
    path.endsWith(platform.updaterExtension),
  );
  if (
    updaterPaths.length === 0 &&
    paths.some((path) => path.endsWith(platform.installerExtension))
  ) {
    const installer = uniquePath(
      paths,
      (path) => path.endsWith(platform.installerExtension),
      "Expected exactly one platform installer",
    );
    const updaterDirectory = resolve(
      dirname(installer),
      platform.updaterSubdirectory,
    );
    updaterPaths = existsSync(updaterDirectory)
      ? readdirSync(updaterDirectory)
          .filter((name) => name.endsWith(platform.updaterExtension))
          .map((name) => resolve(updaterDirectory, name))
      : [];
  }
  const source = uniquePath(
    updaterPaths,
    (path) => path.endsWith(platform.updaterExtension),
    "Expected exactly one platform updater bundle",
  );
  let signaturePaths = paths.filter((path) => path === `${source}.sig`);
  if (signaturePaths.length === 0 && existsSync(`${source}.sig`))
    signaturePaths = [`${source}.sig`];
  const signature = uniquePath(
    signaturePaths,
    (path) => path === `${source}.sig`,
    "Expected exactly one updater signature",
  );
  mkdirSync(destination, { recursive: true });
  const prefix = `Trama_${version}_${platformName}_updater`;
  const bundle = copyNew(
    source,
    resolve(destination, `${prefix}${platform.updaterExtension}`),
  );
  copyNew(signature, `${bundle}.sig`);
  return bundle;
}

export function createLatestManifest(
  directory,
  version,
  repository,
  tag = `v${version}`,
) {
  if (!validVersion(version)) throw new Error("Invalid release version");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository))
    throw new Error("Invalid GitHub repository");
  const prefix = `Trama_${version}_`;
  const manifestPlatforms = {};
  for (const [platformName, platform] of Object.entries(platforms)) {
    const bundleName = uniquePath(
      readdirSync(directory),
      (name) =>
        name.startsWith(`${prefix}${platformName}_updater`) &&
        name.endsWith(platform.updaterExtension),
      `Missing updater bundle for ${platformName}`,
    );
    const signature = readFileSync(
      resolve(directory, `${bundleName}.sig`),
      "utf8",
    ).trim();
    if (!signature)
      throw new Error(`Empty updater signature for ${platformName}`);
    manifestPlatforms[platform.target] = {
      signature,
      url: `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(bundleName)}`,
    };
  }
  const manifest = {
    version,
    notes: existsSync(resolve(directory, "RELEASE_NOTES.md"))
      ? readFileSync(resolve(directory, "RELEASE_NOTES.md"), "utf8")
      : "",
    pub_date: new Date().toISOString(),
    platforms: manifestPlatforms,
  };
  writeFileSync(
    resolve(directory, "latest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

export function checksums(directory) {
  const files = readdirSync(directory)
    .filter((name) =>
      /\.(?:dmg|exe|app\.tar\.gz|nsis\.zip|sig|json)$/.test(name),
    )
    .sort();
  const installers = files.filter((name) => /\.(?:dmg|exe)$/.test(name));
  const bundles = files.filter((name) =>
    /_updater\.(?:app\.tar\.gz|nsis\.zip)$/.test(name),
  );
  const signatures = files.filter((name) => name.endsWith(".sig"));
  if (
    installers.length !== 3 ||
    installers.filter((name) => name.endsWith(".dmg")).length !== 2 ||
    bundles.length !== 3 ||
    signatures.length !== 3 ||
    !files.includes("latest.json")
  )
    throw new Error(
      "Expected three installers, three signed updater bundles and latest.json",
    );
  const lines = files.map(
    (name) =>
      `${createHash("sha256")
        .update(readFileSync(resolve(directory, name)))
        .digest("hex")}  ${name}`,
  );
  const result = lines.join("\n") + "\n";
  writeFileSync(resolve(directory, "SHA256SUMS"), result);
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === "stage") {
    const paths = JSON.parse(process.env.ARTIFACT_PATHS ?? "[]");
    const [version, platform, destination] = args;
    stageInstaller(paths, version, platform, destination);
    stageUpdaterArtifact(paths, version, platform, destination);
  } else if (mode === "manifest") {
    createLatestManifest(...args);
  } else if (mode === "checksums") checksums(args[0]);
  else throw new Error(`Unknown release operation: ${basename(mode ?? "")}`);
}
