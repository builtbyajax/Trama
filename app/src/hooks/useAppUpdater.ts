import { useCallback, useEffect, useRef, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { stored, store } from "../lib/storage";
import {
  checkAppUpdate,
  installAppUpdate,
  installedAppVersion,
  isDesktopApp,
  restartUpdatedApp,
} from "../lib/updater";

const autoCheckKey = "trama.updater.auto-check";
const installedVersionKey = "trama.updater.installed-version";
const restartNoticeKey = "trama.updater.restart-notice";
const dismissedUpdateVersionKey = "trama.updater.dismissed-update-version";
const checkIntervalMs = 24 * 60 * 60 * 1000;

type RestartNotice = { from: string; to: string; dismissed: boolean };

function readRestartNotice(): RestartNotice | null {
  try {
    const value: unknown = JSON.parse(stored(restartNoticeKey) ?? "null");
    if (
      value &&
      typeof value === "object" &&
      "from" in value &&
      typeof value.from === "string" &&
      "to" in value &&
      typeof value.to === "string" &&
      "dismissed" in value &&
      typeof value.dismissed === "boolean"
    )
      return value as RestartNotice;
  } catch {
    /* Ignore malformed local state. */
  }
  return null;
}

export type UpdateStatus =
  "idle" | "checking" | "current" | "available" | "error";

export function useAppUpdater() {
  const [autoCheck, setAutoCheckState] = useState(
    () => stored(autoCheckKey) !== "false",
  );
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState(() =>
    stored(dismissedUpdateVersionKey),
  );
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [restartNotice, setRestartNotice] = useState(false);
  const [installing, setInstalling] = useState(false);
  const busy = useRef(false);
  const updateRef = useRef<Update | null>(null);

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setStatus("checking");
    try {
      const next = await checkAppUpdate();
      if (updateRef.current && updateRef.current !== next)
        await updateRef.current.close().catch(() => undefined);
      const dismissedVersion = stored(dismissedUpdateVersionKey);
      if (dismissedVersion !== (next?.version ?? null)) {
        store(dismissedUpdateVersionKey, "");
        setDismissedUpdateVersion(null);
      }
      updateRef.current = next;
      setAvailableUpdate(next);
      setStatus(next ? "available" : "current");
    } catch {
      setStatus("error");
    } finally {
      busy.current = false;
    }
  }, []);

  const setAutoCheck = useCallback((enabled: boolean) => {
    setAutoCheckState(enabled);
    store(autoCheckKey, String(enabled));
  }, []);

  const dismissUpdate = useCallback(() => {
    const version = updateRef.current?.version;
    if (!version) return;
    store(dismissedUpdateVersionKey, version);
    setDismissedUpdateVersion(version);
  }, []);

  const dismissRestartNotice = useCallback(() => {
    const notice = readRestartNotice();
    if (notice?.to === installedVersion)
      store(restartNoticeKey, JSON.stringify({ ...notice, dismissed: true }));
    setRestartNotice(false);
  }, [installedVersion]);

  const install = useCallback(async () => {
    const update = updateRef.current;
    if (!update || busy.current) return;
    busy.current = true;
    setInstalling(true);
    try {
      await installAppUpdate(update);
      updateRef.current = null;
      setAvailableUpdate(null);
      setStatus("idle");
      store(dismissedUpdateVersionKey, "");
      setDismissedUpdateVersion(null);
      await restartUpdatedApp();
    } catch (error) {
      setStatus("error");
      throw error;
    } finally {
      busy.current = false;
      setInstalling(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void installedAppVersion()
      .then((version) => {
        if (!active || !version) return;
        const previous = stored(installedVersionKey);
        setInstalledVersion(version);
        if (previous && previous !== version) {
          store(
            restartNoticeKey,
            JSON.stringify({ from: previous, to: version, dismissed: false }),
          );
          setRestartNotice(true);
        } else {
          const notice = readRestartNotice();
          setRestartNotice(
            Boolean(previous && notice?.to === version && !notice.dismissed),
          );
        }
        store(installedVersionKey, version);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!autoCheck || !isDesktopApp()) return;
    void check();
    const timer = window.setInterval(() => void check(), checkIntervalMs);
    return () => window.clearInterval(timer);
  }, [autoCheck, check]);

  useEffect(
    () => () => {
      const update = updateRef.current;
      updateRef.current = null;
      if (update) void update.close().catch(() => undefined);
    },
    [],
  );

  return {
    autoCheck,
    availableUpdate,
    check,
    dismissRestartNotice,
    dismissUpdate,
    updateNoticeDismissed:
      Boolean(availableUpdate) &&
      dismissedUpdateVersion === availableUpdate?.version,
    install,
    installing,
    installedVersion,
    restartNotice,
    setAutoCheck,
    status,
  };
}

export type AppUpdater = ReturnType<typeof useAppUpdater>;
