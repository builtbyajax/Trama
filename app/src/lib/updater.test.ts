import { afterEach, describe, expect, it, vi } from "vitest";
import { checkAppUpdate, installAppUpdate } from "./updater";

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { check } from "@tauri-apps/plugin-updater";
import { invoke } from "@tauri-apps/api/core";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("app updater", () => {
  it("does not contact the updater in the browser preview", async () => {
    expect(await checkAppUpdate()).toBeNull();
    expect(check).not.toHaveBeenCalled();
  });

  it("checks for an update in the desktop app", async () => {
    const update = { version: "0.2.2" };
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.mocked(check).mockResolvedValue(update as never);

    await expect(checkAppUpdate()).resolves.toBe(update);
    expect(check).toHaveBeenCalledOnce();
  });

  it("hides updater internals behind a translated check error", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.mocked(check).mockRejectedValue(new Error("network failure"));

    await expect(checkAppUpdate()).rejects.toThrow(
      "Couldn't check for updates. Try again later.",
    );
  });

  it("installs the update and closes it after an install failure", async () => {
    const update = {
      downloadAndInstall: vi.fn().mockRejectedValue(new Error("bad signature")),
      close: vi.fn().mockResolvedValue(undefined),
    };

    await expect(installAppUpdate(update as never)).rejects.toThrow(
      "Couldn't install the update. Try again later.",
    );
    expect(update.downloadAndInstall).toHaveBeenCalledOnce();
    expect(update.close).toHaveBeenCalledOnce();
  });

  it("leaves the update pending while a Windows agent session uses the binary", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.mocked(invoke).mockResolvedValue(true);
    const update = {
      downloadAndInstall: vi.fn(),
      close: vi.fn(),
    };

    await expect(installAppUpdate(update as never)).rejects.toThrow(
      "Close all agent sessions before updating.",
    );
    expect(update.downloadAndInstall).not.toHaveBeenCalled();
    expect(update.close).not.toHaveBeenCalled();
  });
});
