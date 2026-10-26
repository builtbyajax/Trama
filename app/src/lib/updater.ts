import type { Update } from "@tauri-apps/plugin-updater";
import { t } from "./i18n";

const isDesktopApp = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

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
  try {
    await update.downloadAndInstall();
  } catch {
    await update.close().catch(() => undefined);
    throw new Error(t("Couldn't install the update. Try again later."));
  }
}
