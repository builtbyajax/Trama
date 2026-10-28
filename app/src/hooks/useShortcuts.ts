import { useEffect, useRef } from "react";
import { inTauri } from "../lib/api";
import { isMac } from "../lib/shortcuts";
export type WorkspaceAction =
  | "new_task"
  | "new_project"
  | "preferences"
  | "shortcuts"
  | "search"
  | "toggle_sidebar"
  | "reload"
  | "overview"
  | "archive"
  | "notes"
  | "project_page"
  | "board"
  | "git"
  | "project_notes"
  | "board_view"
  | "toggle_done"
  | "switch_project"
  | `project_${number}`
  | "close_details"
  | "back"
  | "forward"
  | "full_page";

// In the macOS app these come from the native menu, which owns their key equivalents; other
// systems have no menu, so the keys come through here.
const menuActions = new Set<WorkspaceAction>([
  "new_task",
  "new_project",
  "preferences",
  "shortcuts",
  "search",
  "toggle_sidebar",
  "reload",
  "overview",
  "archive",
  "notes",
  "project_page",
  "board",
  "git",
  "project_notes",
  "board_view",
  "toggle_done",
  "switch_project",
  "back",
  "forward",
]);

/** Maps a key press to a workspace action; see `shortcuts` in lib/shortcuts for the table. */
function actionFor(event: KeyboardEvent): WorkspaceAction | undefined {
  const mod = isMac ? event.metaKey : event.ctrlKey;
  // AltGr reports Ctrl+Alt on Windows layouts; it types characters, not shortcuts.
  if (event.getModifierState?.("AltGraph")) return undefined;
  const digit = /^Digit([1-9])$/.exec(event.code)?.[1];
  // The open project's tabs: ⌃1–4 on macOS, Alt+1–4 elsewhere.
  const tab = isMac
    ? event.ctrlKey && !event.metaKey && !event.altKey
    : event.altKey && !event.ctrlKey;
  if (tab && !event.shiftKey && digit)
    return (["project_page", "board", "git", "project_notes"] as const)[
      Number(digit) - 1
    ];
  if (!mod) {
    if (event.key === "Escape" && !document.querySelector("dialog[open]"))
      return "close_details";
    return undefined;
  }
  if (isMac && event.ctrlKey) return undefined;
  if (event.altKey) {
    if (event.shiftKey) return undefined;
    if (digit === "1") return "overview";
    if (digit === "2") return "archive";
    if (digit === "3") return "notes";
    if (event.code === "KeyB") return "toggle_done";
    return undefined;
  }
  if (event.shiftKey) {
    if (event.code === "KeyN") return "new_project";
    if (event.code === "KeyL") return "board_view";
    return undefined;
  }
  if (digit) return `project_${Number(digit) - 1}`;
  if (event.key === "/") return "shortcuts";
  if (event.code === "BracketLeft") return "back";
  if (event.code === "BracketRight") return "forward";
  if (event.key === "Enter" && !event.defaultPrevented) return "full_page";
  if (event.key === ",") return "preferences";
  switch (event.code) {
    case "KeyB":
      return "toggle_sidebar";
    case "KeyK":
      return "search";
    case "KeyN":
      return "new_task";
    case "KeyR":
      return "reload";
    case "KeyT":
      return "switch_project";
  }
  return undefined;
}

export function useShortcuts(onAction: (action: WorkspaceAction) => void) {
  const latest = useRef(onAction);
  latest.current = onAction;
  useEffect(() => {
    const dispatch = (action: WorkspaceAction) => latest.current(action);
    const nativeMenu = isMac && inTauri();
    const key = (event: KeyboardEvent) => {
      const action = actionFor(event);
      if (!action || (nativeMenu && menuActions.has(action))) return;
      event.preventDefault();
      dispatch(action);
    };
    window.addEventListener("keydown", key);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (nativeMenu)
      void import("@tauri-apps/api/event")
        .then(({ listen }) =>
          listen<WorkspaceAction>("trama-menu", ({ payload }) =>
            dispatch(payload),
          ),
        )
        .then((fn) => {
          if (disposed) fn();
          else unlisten = fn;
        })
        .catch((error) =>
          console.error("Falha ao conectar o menu local", error),
        );
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("keydown", key);
    };
  }, []);
}
