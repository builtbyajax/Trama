import { useEffect, useState, type MouseEvent } from "react";
import { errorMessage, revealLabel, revealPath } from "../../lib/api";
import { noteName } from "../../lib/markdown";
import type { MenuItem } from "../Sidebar";
import { t } from "../../lib/i18n";

/** The context menus of the notes: a note, a folder and a tab. */
export function useNoteMenus({
  root,
  tabs,
  path,
  setTabs,
  setEditing,
  open,
  closeTab,
  startCreating,
  startRenaming,
  confirmRemove,
  notify,
}: {
  root: string;
  tabs: string[];
  path: string | null;
  setTabs: (tabs: string[]) => void;
  setEditing: (editing: boolean) => void;
  open: (
    target: string,
    heading?: string | null,
    text?: string | null,
    newTab?: boolean,
  ) => Promise<void>;
  closeTab: (target: string) => Promise<void>;
  startCreating: (kind: "note" | "folder", folder?: string) => void;
  startRenaming: (target: string) => void;
  confirmRemove: (target: string, folder: boolean) => void;
  notify: (text: string, error?: boolean) => void;
}) {
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    label: string;
    items: MenuItem[];
    trigger: HTMLElement;
  } | null>(null);
  // The row a menu was opened from stays marked while the menu is open.
  useEffect(() => {
    const trigger = menu?.trigger;
    if (!trigger) return;
    trigger.dataset.menuOpen = "";
    return () => {
      delete trigger.dataset.menuOpen;
    };
  }, [menu?.trigger]);
  function noteMenu(event: MouseEvent<HTMLElement>, note: string) {
    event.preventDefault();
    setMenu({
      x: event.clientX,
      y: event.clientY,
      label: t("Actions for {0}", [noteName(note)]),
      trigger: event.currentTarget,
      items: [
        {
          label: t("Open"),
          icon: "file",
          onSelect: () => void open(note),
        },
        {
          label: t("Open in new tab"),
          icon: "external",
          hint: "⌘ clique",
          onSelect: () => void open(note, null, null, true),
        },
        {
          label: t("Edit"),
          icon: "pencil",
          onSelect: () => void open(note).then(() => setEditing(true)),
        },
        {
          label: t("Copy note link"),
          icon: "copy",
          onSelect: () =>
            void navigator.clipboard.writeText(`[[${noteName(note)}]]`).then(
              () => notify(t("Note link copied")),
              () => notify(t("Couldn't copy the link."), true),
            ),
        },
        {
          label: t("Rename"),
          icon: "rename",
          onSelect: () => startRenaming(note),
        },
        {
          label: revealLabel(),
          icon: "reveal",
          onSelect: () =>
            void revealPath(`${root}/${note}`).catch((e) =>
              notify(errorMessage(e), true),
            ),
        },
        {
          label: t("Delete…"),
          icon: "trash",
          danger: true,
          onSelect: () => confirmRemove(note, false),
        },
      ],
    });
  }
  function folderMenu(event: MouseEvent<HTMLElement>, folder: string) {
    event.preventDefault();
    setMenu({
      x: event.clientX,
      y: event.clientY,
      label: t("Actions for folder {0}", [folder.split("/").pop()]),
      trigger: event.currentTarget,
      items: [
        {
          label: t("New note here"),
          icon: "filePlus",
          onSelect: () => startCreating("note", folder),
        },
        {
          label: t("New folder here"),
          icon: "folderPlus",
          onSelect: () => startCreating("folder", folder),
        },
        {
          label: t("Rename"),
          icon: "rename",
          onSelect: () => startRenaming(folder),
        },
        {
          label: revealLabel(),
          icon: "reveal",
          onSelect: () =>
            void revealPath(`${root}/${folder}`).catch((e) =>
              notify(errorMessage(e), true),
            ),
        },
        {
          label: t("Delete…"),
          icon: "trash",
          danger: true,
          onSelect: () => confirmRemove(folder, true),
        },
      ],
    });
  }
  function tabMenu(event: MouseEvent<HTMLElement>, note: string) {
    event.preventDefault();
    setMenu({
      x: event.clientX,
      y: event.clientY,
      label: t("Tab {0}", [noteName(note)]),
      trigger: event.currentTarget,
      items: [
        {
          label: t("Close tab"),
          icon: "close",
          onSelect: () => void closeTab(note),
        },
        ...(tabs.length > 1
          ? [
              {
                label: t("Close others"),
                icon: "close" as const,
                onSelect: () => {
                  setTabs([note]);
                  if (note !== path) void open(note);
                },
              },
            ]
          : []),
        {
          label: revealLabel(),
          icon: "reveal",
          onSelect: () =>
            void revealPath(`${root}/${note}`).catch((e) =>
              notify(errorMessage(e), true),
            ),
        },
      ],
    });
  }

  return { menu, setMenu, noteMenu, folderMenu, tabMenu };
}
