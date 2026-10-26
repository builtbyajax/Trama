import { useEffect, useState } from "react";

/** A button in the toast, such as undoing what it reports. */
export interface ToastAction {
  label: string;
  run: () => void;
}

/** The message shown at the bottom of the window, gone after a few seconds. */
export function useToast() {
  const [toast, setToast] = useState<{
    text: string;
    error?: boolean;
    action?: ToastAction;
  } | null>(null);
  const notify = (text: string, error = false, action?: ToastAction) =>
    setToast({ text, error, action });
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(
      () => setToast(null),
      toast.error || toast.action ? 6000 : 3200,
    );
    return () => window.clearTimeout(timer);
  }, [toast]);
  return { toast, notify, dismiss: () => setToast(null) };
}
