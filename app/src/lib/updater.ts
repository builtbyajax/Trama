import type { Update } from "@tauri-apps/plugin-updater";
import { known, t } from "./i18n";

export const isDesktopApp = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function installedAppVersion(): Promise<string | null> {
  if (!isDesktopApp()) return null;
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}

/** Returns the signed update announced by the configured endpoint, if any. */
export async function checkAppUpdate(): Promise<Update | null> {
  if (!isDesktopApp()) return null;

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    return await check();
  } catch {
    throw new Error(t("Couldn't check for updates. Try again later."));
  }
}

/** Downloads and installs a verified update. The caller decides when to restart. */
export async function installAppUpdate(update: Update): Promise<void> {
  if (await hasRunningAgent())
    throw new Error(t("Close all agent sessions before updating."));

  try {
    await update.downloadAndInstall();
  } catch {
    throw new Error(t("Couldn't install the update. Try again later."));
  }
}

async function hasRunningAgent(): Promise<boolean> {
  if (!isDesktopApp()) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("has_running_agent");
  } catch {
    throw new Error(t("Couldn't check whether agent sessions are closed."));
  }
}

/** Restarts only after a signed update has been installed. */
export async function restartUpdatedApp(): Promise<void> {
  if (!isDesktopApp()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    await invoke("restart_app");
  } catch (error) {
    throw new Error(known(String(error)));
  }
}
