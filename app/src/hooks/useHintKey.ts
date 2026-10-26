import { useEffect } from "react";
import { hintKey } from "../lib/shortcuts";

const delay = 450;

/**
 * Holding ⌘ (Ctrl on Windows) on its own for a moment sets `data-hints` on the root element, which
 * reveals the `.key-hint` badges next to destinations and actions. A quick ⌘N never shows them;
 * releasing the key, pressing another one or leaving the window hides them.
 */
export function useHintKey() {
  useEffect(() => {
    const root = document.documentElement;
    let timer = 0;
    const hide = () => {
      window.clearTimeout(timer);
      delete root.dataset.hints;
    };
    const down = (event: KeyboardEvent) => {
      const alone =
        event.key === hintKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat;
      if (!alone) {
        // A shortcut in progress keeps the hints already shown; anything else hides them.
        if (event.key !== hintKey && !(event.metaKey || event.ctrlKey)) hide();
        window.clearTimeout(timer);
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => (root.dataset.hints = "on"), delay);
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === hintKey || !(event.metaKey || event.ctrlKey)) hide();
    };
    const visibility = () => document.hidden && hide();
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
}
