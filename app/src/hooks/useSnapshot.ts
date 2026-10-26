import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, loadSnapshot } from "../lib/api";
import type { Snapshot } from "../lib/types";

/**
 * The data of every project, read when the app opens, every 5 s while the window is visible and
 * on `refresh`. `revision` grows when something changed (or on every forced refresh), for the
 * views that load their own data to read it again. `onLoaded` runs once, with the first read.
 */
export function useSnapshot(onLoaded: (snapshot: Snapshot) => void) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const snapshotRef = useRef<Snapshot | null>(null);
  const refresh = useCallback(async (force = true) => {
    try {
      const loaded = await loadSnapshot();
      setError(null);
      if (JSON.stringify(snapshotRef.current) !== JSON.stringify(loaded)) {
        snapshotRef.current = loaded;
        setSnapshot(loaded);
        setRevision((v) => v + 1);
      }
      if (force) setRevision((v) => v + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    let active = true;
    loadSnapshot()
      .then((loaded) => {
        if (active) {
          snapshotRef.current = loaded;
          setSnapshot(loaded);
          onLoaded(loaded);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh(false);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return { snapshot, error, revision, refresh };
}
