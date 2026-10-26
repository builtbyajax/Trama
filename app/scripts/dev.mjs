import { resolve } from "node:path";
import { developmentEnv } from "./dev-env.mjs";
import { root, run } from "./sidecar.mjs";

run(
  process.execPath,
  [resolve(root, "node_modules/vite/bin/vite.js"), ...process.argv.slice(2)],
  {
    env: developmentEnv(),
  },
);
