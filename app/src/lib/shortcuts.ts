import { t } from "./i18n";
export const isMac = navigator.platform.includes("Mac");
export const isWindows = navigator.platform.startsWith("Win");
/** The key that reveals shortcut hints while held: ⌘ on macOS, Ctrl elsewhere. */
export const hintKey = isMac ? "Meta" : "Control";

type Key = "mod" | "ctrl" | "shift" | "alt" | string;

const macSymbols: Record<string, string> = {
  mod: "⌘",
  ctrl: "⌃",
  shift: "⇧",
  alt: "⌥",
  enter: "↩",
  escape: "esc",
  space: t("Space"),
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};
const otherNames: Record<string, string> = {
  mod: "Ctrl",
  ctrl: "Ctrl",
  shift: "Shift",
  alt: "Alt",
  enter: "Enter",
  escape: "Esc",
  space: t("Space"),
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};
// macOS lists modifiers as ⌃⌥⇧⌘ regardless of how the shortcut was written.
const macOrder = ["ctrl", "alt", "shift", "mod"];

/** Keycaps for one shortcut, in the platform's conventions (⌥⇧⌘ on macOS, Ctrl+… elsewhere). */
export function keycaps(keys: Key[]): string[] {
  if (!isMac) return keys.map((key) => otherNames[key] ?? key.toUpperCase());
  const modifiers = macOrder.filter((key) => keys.includes(key));
  const rest = keys.filter((key) => !macOrder.includes(key));
  return [...modifiers, ...rest].map(
    (key) => macSymbols[key] ?? key.toUpperCase(),
  );
}

/** Compact label for tooltips and buttons: "⌥⌘S" on macOS, "Ctrl+Alt+S" elsewhere. */
export const shortcutLabel = (keys: Key[]) =>
  keycaps(keys).join(isMac ? "" : "+");

/** `aria-keyshortcuts` value, e.g. "Meta+Alt+1". */
export const ariaKeys = (keys: Key[]) =>
  keys
    .map((key) =>
      key === "mod"
        ? isMac
          ? "Meta"
          : "Control"
        : key === "ctrl"
          ? "Control"
          : key === "alt"
            ? "Alt"
            : key === "shift"
              ? "Shift"
              : key.length === 1
                ? key.toUpperCase()
                : key.charAt(0).toUpperCase() + key.slice(1),
    )
    .join("+");

/** The project's tabs take ⌃ on macOS, where ⌘ and a number picks the project; Ctrl is already
 * that elsewhere, so Alt takes its place. */
const tab = isMac ? "ctrl" : "alt";

// Mostly one-handed: ⌘ and a number is a project, ⌥⌘ and a number a fixed page (⇧⌘3 and ⇧⌘4
// are macOS screenshots), ⌃ and a number a tab of the open project.
export const shortcuts = {
  newTask: ["mod", "n"],
  newProject: ["shift", "mod", "n"],
  search: ["mod", "k"],
  reload: ["mod", "r"],
  overview: ["alt", "mod", "1"],
  drafts: ["alt", "mod", "2"],
  notes: ["alt", "mod", "3"],
  board: [tab, "1"],
  git: [tab, "2"],
  projectNotes: [tab, "3"],
  switchProject: ["mod", "t"],
  sidebar: ["mod", "b"],
  back: ["mod", "["],
  forward: ["mod", "]"],
  fullPage: ["mod", "enter"],
  previousTask: ["up"],
  nextTask: ["down"],
  preferences: ["mod", ","],
  help: ["mod", "/"],
} satisfies Record<string, Key[]>;

/** Projects 1–9 in sidebar order, like a browser's tabs: ⌘1…⌘9 (Ctrl+1…9 elsewhere). */
export const projectShortcut = (index: number): Key[] | undefined =>
  index < 9 ? ["mod", String(index + 1)] : undefined;

export interface ShortcutGroup {
  title: string;
  items: { label: string; keys: Key[][] }[];
}

/** Everything the keyboard can do, as shown in the shortcuts sheet. */
export const shortcutGroups: ShortcutGroup[] = [
  {
    title: t("General"),
    items: [
      { label: t("New task"), keys: [shortcuts.newTask] },
      { label: t("New project"), keys: [shortcuts.newProject] },
      { label: t("Search all projects"), keys: [shortcuts.search] },
      { label: t("Refresh"), keys: [shortcuts.reload] },
      { label: t("Preferences"), keys: [shortcuts.preferences] },
      { label: t("Keyboard shortcuts"), keys: [shortcuts.help] },
    ],
  },
  {
    title: t("Navigation"),
    items: [
      { label: t("Overview"), keys: [shortcuts.overview] },
      { label: t("Drafts"), keys: [shortcuts.drafts] },
      { label: t("Vaults of all projects"), keys: [shortcuts.notes] },
      {
        label: t("Projects 1 to 9 in the sidebar"),
        keys: [["mod", "1…9"]],
      },
      {
        label: t("Go to project by name"),
        keys: [shortcuts.switchProject],
      },
      { label: t("Project board"), keys: [shortcuts.board] },
      { label: t("Project Git history"), keys: [shortcuts.git] },
      { label: t("Project notes"), keys: [shortcuts.projectNotes] },
      {
        label: t("Show or hide the sidebar"),
        keys: [shortcuts.sidebar],
      },
      {
        label: t("Back and forward"),
        keys: [shortcuts.back, shortcuts.forward],
      },
    ],
  },
  {
    title: t("Open task|section"),
    items: [
      { label: t("Previous and next task"), keys: [["up"], ["down"]] },
      { label: t("Full page or sheet"), keys: [shortcuts.fullPage] },
      { label: t("Close the task"), keys: [["escape"]] },
    ],
  },
  {
    title: t("Board"),
    items: [
      { label: t("Open card details"), keys: [["enter"]] },
      { label: t("Pick up or drop the card"), keys: [["space"]] },
      { label: t("Choose the column"), keys: [["left"], ["right"]] },
      {
        label: t("Choose the position in the column"),
        keys: [["up"], ["down"]],
      },
      { label: t("Cancel the move"), keys: [["escape"]] },
    ],
  },
  {
    title: t("Editing"),
    items: [
      { label: t("Save from the title"), keys: [["enter"]] },
      { label: t("Read or edit the note"), keys: [["mod", "e"]] },
    ],
  },
  {
    title: t("Git and changes"),
    items: [
      { label: t("Step through commits"), keys: [["up"], ["down"]] },
      { label: t("Open the commit's changes"), keys: [["enter"]] },
      {
        label: t("Previous/next file"),
        keys: [
          ["alt", "up"],
          ["alt", "down"],
        ],
      },
      { label: t("Back to history"), keys: [["escape"]] },
    ],
  },
];
