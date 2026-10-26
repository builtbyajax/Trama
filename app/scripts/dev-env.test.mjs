import { test } from "node:test";
import assert from "node:assert/strict";
import { developmentEnv, developmentHome } from "./dev-env.mjs";

test("development uses isolated data without changing the parent environment", () => {
  const env = { PATH: "/tools" };
  assert.deepEqual(developmentEnv(env), {
    ...env,
    TRAMA_HOME: developmentHome,
  });
  assert.deepEqual(env, { PATH: "/tools" });
});

test("explicit database, data folder and personal-data opt-in are preserved", () => {
  for (const env of [
    { TRAMA_DB: "/selected.sqlite" },
    { TRAMA_HOME: "/sandbox" },
    { TRAMA_DEV_PERSONAL: "1" },
  ]) {
    assert.deepEqual(developmentEnv(env), env);
  }
  assert.equal(
    developmentEnv({ TRAMA_DEV_PERSONAL: "0" }).TRAMA_HOME,
    developmentHome,
  );
});
