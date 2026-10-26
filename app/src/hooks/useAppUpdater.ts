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
const pendingRestartVersionKey = "trama.updater.pending-restart-version";
const dismissedUpdateVersionKey = "trama.updater.dismissed-update-version";
const checkIntervalMs = 24 * 60 * 60 * 1000;

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
    store(pendingRestartVersionKey, "");
    setRestartNotice(false);
  }, []);

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
        if (previous && previous !== version)
          store(pendingRestartVersionKey, version);
        setRestartNotice(stored(pendingRestartVersionKey) === version);
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
