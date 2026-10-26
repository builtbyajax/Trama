import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [target] = process.argv.slice(2);
if (
  !/^(aarch64-apple-darwin|x86_64-apple-darwin|x86_64-pc-windows-msvc)$/.test(
    target ?? "",
  )
)
  throw new Error("Expected a supported native build target");
const windows = target.includes("windows");
let extracted;
let mounted = false;
try {
  const installers = JSON.parse(process.env.ARTIFACT_PATHS ?? "[]").filter(
    (path) => path.endsWith(windows ? ".exe" : ".dmg"),
  );
  if (installers.length !== 1)
    throw new Error("Expected exactly one native installer");
  extracted = mkdtempSync(join(tmpdir(), "trama-packaged-"));
  let binary;
  if (windows) {
    execFileSync("7z", ["x", installers[0], `-o${extracted}`, "-y"], {
      stdio: "inherit",
    });
    const find = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? find(join(dir, entry.name))
          : entry.name === "trama-agent.exe"
            ? [join(dir, entry.name)]
            : [],
      );
    const found = find(extracted);
    if (found.length !== 1)
      throw new Error("Installer must contain exactly one MCP server");
    binary = found[0];
  } else {
    // A DMG-only Tauri build removes the intermediate .app after packaging.
    execFileSync(
      "hdiutil",
      [
        "attach",
        installers[0],
        "-readonly",
        "-nobrowse",
        "-mountpoint",
        extracted,
      ],
      { stdio: "inherit" },
    );
    mounted = true;
    binary = join(extracted, "Trama.app/Contents/MacOS/trama-agent");
  }
  if (!existsSync(binary))
    throw new Error(`Packaged MCP server is missing: ${binary}`);
  execFileSync(
    "cargo",
    [
      "test",
      "--locked",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--features",
      "agent-cli",
      "--test",
      "mcp_contract",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        TRAMA_AGENT_BIN: binary,
        TAURI_CONFIG: '{"bundle":{"externalBin":[]}}',
      },
    },
  );
} finally {
  if (mounted)
    execFileSync("hdiutil", ["detach", extracted], { stdio: "inherit" });
  if (extracted) rmSync(extracted, { recursive: true, force: true });
}
