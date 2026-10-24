import { resolve } from "node:path";
import { prepare, root, run } from "./sidecar.mjs";
import { developmentEnv } from "./dev-env.mjs";
const args = process.argv.slice(2);
if (args[0] === "dev") Object.assign(process.env, developmentEnv());
if (args[0] === "dev" || args[0] === "build") {
  const index = args.indexOf("--target");
  const inline = args.find((a) => a.startsWith("--target="));
  prepare({
    release: args[0] === "build",
    target: index >= 0 ? args[index + 1] : inline?.split("=")[1],
  });
}
run(process.execPath, [
  resolve(root, "node_modules/@tauri-apps/cli/tauri.js"),
  ...args,
]);
