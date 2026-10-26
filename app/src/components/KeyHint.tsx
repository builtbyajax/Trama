import { shortcutLabel } from "../lib/shortcuts";

/** Shortcut badge shown only while the hint key is held (see useHintKey). */
export function KeyHint({ keys }: { keys?: string[] }) {
  if (!keys) return null;
  return (
    <kbd className="key-hint" aria-hidden="true">
      {shortcutLabel(keys)}
    </kbd>
  );
}
