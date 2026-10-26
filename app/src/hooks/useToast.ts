import { useEffect, useRef, useState } from "react";

/** A button in the toast, such as undoing what it reports. */
export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  /** Changes with each message, so a repeated one starts its time again. */
  id: number;
  text: string;
  error?: boolean;
  action?: ToastAction;
  /** How long it stays, in milliseconds. */
  duration: number;
  /** Playing its way out. */
  leaving?: boolean;
}

let next = 0;
/** Matches the toast-out animation in controls.css. */
const exit = 160;

/**
 * The message shown at the top of the window, gone after a few seconds. The time stops while the
 * pointer or the focus is on it, so its action can still be reached.
 */
export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const left = useRef(0);
  const started = useRef(0);
  const holds = useRef(0);
  const notify = (text: string, error = false, action?: ToastAction) =>
    setToast({
      id: ++next,
      text,
      error,
      action,
      duration: error || action ? 6000 : 3200,
    });
  const dismiss = () =>
    setToast((current) => current && { ...current, leaving: true });
  const run = (ms: number) => {
    window.clearTimeout(timer.current);
    started.current = performance.now();
    left.current = ms;
    timer.current = window.setTimeout(dismiss, ms);
  };
  const id = toast?.id;
  const leaving = Boolean(toast?.leaving);
  useEffect(() => {
    holds.current = 0;
    if (!toast) return;
    run(toast.duration);
    return () => window.clearTimeout(timer.current);
  }, [id]);
  useEffect(() => {
    if (!leaving) return;
    window.clearTimeout(timer.current);
    const gone = window.setTimeout(
      () => setToast((current) => (current?.id === id ? null : current)),
      exit,
    );
    return () => window.clearTimeout(gone);
  }, [id, leaving]);
  const hold = () => {
    if (!toast || toast.leaving || holds.current++ > 0) return;
    window.clearTimeout(timer.current);
    left.current -= performance.now() - started.current;
  };
  const release = () => {
    if (!toast || toast.leaving || holds.current === 0 || --holds.current > 0)
      return;
    run(left.current);
  };
  return { toast, notify, dismiss, hold, release };
}
