import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createInterface } from "node:readline";
const home = await mkdtemp(join(tmpdir(), "trama-e2e-"));
const env = { ...process.env, TRAMA_HOME: home };
delete env.TRAMA_DB;
delete env.TRAMA_DEV_PERSONAL;
const binary = resolve(
  "src-tauri/target/debug/trama-agent" +
    (process.platform === "win32" ? ".exe" : ""),
);
// A new home has no workspace until one is created, as the first screen would.
const api = spawnSync(
  resolve(
    "src-tauri/target/debug/trama-api" +
      (process.platform === "win32" ? ".exe" : ""),
  ),
  {
    env,
    input: JSON.stringify({
      command: "create_workspace",
      args: { name: "Seed", color: null, icon: null },
    }),
    encoding: "utf8",
  },
);
if (api.status !== 0 || JSON.parse(api.stdout).error)
  throw new Error(`Seed workspace failed: ${api.stdout}${api.stderr}`);
const agent = spawn(binary, ["--workspace"], {
  env,
  stdio: ["pipe", "pipe", "inherit"],
});
let counter = 0;
const pending = new Map();
createInterface({ input: agent.stdout }).on("line", (line) => {
  const reply = JSON.parse(line);
  pending.get(reply.id)?.(reply);
  pending.delete(reply.id);
});
const rpc = (method, params) =>
  new Promise((resolveReply, reject) => {
    const id = ++counter;
    const timer = setTimeout(
      () => reject(new Error("Seed MCP timed out")),
      10000,
    );
    pending.set(id, (reply) => {
      clearTimeout(timer);
      reply.error
        ? reject(new Error(JSON.stringify(reply.error)))
        : resolveReply(reply.result);
    });
    agent.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
    );
  });
await rpc("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "trama-e2e", version: "1" },
});
const seed = await rpc("tools/call", {
  name: "create_project",
  arguments: { name: "MCP seed" },
});
if (seed.isError) throw new Error(JSON.stringify(seed));
agent.stdin.end();
await mkdir("../.trama-local", { recursive: true });
await writeFile("../.trama-local/e2e-state.json", JSON.stringify({ home }));
const vite = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--port", "1423"],
  { env, stdio: "inherit" },
);
const stop = () => {
  vite.kill();
  agent.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
vite.on("exit", async (code) => {
  await rm(home, { recursive: true, force: true });
  process.exit(code ?? 0);
});
