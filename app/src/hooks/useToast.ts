import { useEffect, useState } from "react";

/** The message shown at the bottom of the window, gone after a few seconds. */
export function useToast() {
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
    null,
  );
  const notify = (text: string, error = false) => setToast({ text, error });
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(
      () => setToast(null),
      toast.error ? 6000 : 3200,
    );
    return () => window.clearTimeout(timer);
  }, [toast]);
  return { toast, notify };
}
