import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { command } from "./scripts/backend";
function localBackend(): Plugin {
  return {
    name: "trama-rust-backend",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/command", (request, response) => {
        const address = server.httpServer?.address();
        const port =
          address && typeof address === "object" ? address.port : null;
        const host = request.headers.host?.toLowerCase();
        // Origin and Host can agree during DNS rebinding; both must stay local.
        if (
          !port ||
          !["127.0.0.1", "localhost", "[::1]"].some(
            (name) => host === `${name}:${port}`,
          )
        ) {
          response.statusCode = 403;
          response.end();
          return;
        }
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end();
          return;
        }
        // The bridge is local and accepts only same-origin JSON requests.
        if (
          request.headers.origin &&
          request.headers.origin !== `http://${request.headers.host}`
        ) {
          response.statusCode = 403;
          response.end();
          return;
        }
        if (!request.headers["content-type"]?.startsWith("application/json")) {
          response.statusCode = 415;
          response.end();
          return;
        }
        let body = "";
        request.on("data", (chunk) => {
          body += String(chunk);
          if (body.length > 2_000_000) request.destroy();
        });
        request.on("end", () => {
          Promise.resolve()
            .then(() => command(JSON.parse(body)))
            .then((result) => {
              response.setHeader("Content-Type", "application/json");
              response.end(JSON.stringify(result));
            })
            .catch(() => {
              response.statusCode = 500;
              response.end(
                JSON.stringify({ error: "O núcleo local não respondeu." }),
              );
            });
        });
      });
    },
  };
}
export default defineConfig({
  plugins: [react(), localBackend()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: "127.0.0.1" },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "safari16", outDir: "dist" },
});
