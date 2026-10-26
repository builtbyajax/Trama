import { fileURLToPath } from "node:url";

export const developmentHome = fileURLToPath(
  new URL("../../.trama-local/development/", import.meta.url),
);

export function developmentEnv(env = process.env) {
  if (env.TRAMA_HOME || env.TRAMA_DB || env.TRAMA_DEV_PERSONAL === "1")
    return { ...env };
  return { ...env, TRAMA_HOME: developmentHome };
}
