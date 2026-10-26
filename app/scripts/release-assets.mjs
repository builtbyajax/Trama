import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function stageInstaller(paths, version, platform, destination) {
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version))
    throw new Error("Invalid release version");
  if (
    !["macOS_Apple-Silicon", "macOS_Intel", "Windows_x64_Setup"].includes(
      platform,
    )
  )
    throw new Error("Invalid platform");
  const installers = paths.filter((path) =>
    path.endsWith(platform.startsWith("Windows") ? ".exe" : ".dmg"),
  );
  if (installers.length !== 1)
    throw new Error("Expected exactly one platform installer");
  const name = `Trama_${version}_${platform}${platform.startsWith("Windows") ? ".exe" : ".dmg"}`;
  mkdirSync(destination, { recursive: true });
  const target = resolve(destination, name);
  if (existsSync(target)) throw new Error("Refusing to overwrite an installer");
  copyFileSync(installers[0], target);
  return target;
}
export function checksums(directory) {
  const files = readdirSync(directory)
    .filter((name) => /\.(dmg|exe)$/.test(name))
    .sort();
  if (
    files.length !== 3 ||
    files.filter((name) => name.endsWith(".dmg")).length !== 2
  )
    throw new Error("Expected all three installers before publishing");
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
  if (mode === "stage")
    stageInstaller(JSON.parse(process.env.ARTIFACT_PATHS ?? "[]"), ...args);
  else if (mode === "checksums") checksums(args[0]);
  else throw new Error(`Unknown release operation: ${basename(mode ?? "")}`);
}
