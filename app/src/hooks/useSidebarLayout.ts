import { useEffect, useRef, useState } from "react";
import { useStoredState } from "./useStoredState";

const sidebarKey = "trama.sidebar.v1";
const notesTreeKey = "trama.notes.tree.v1";
const historyListKey = "trama.git.list.v1";
const diffFilesKey = "trama.diff.files.v1";

/**
 * Which side panel is hidden and how it peeks back. On a project's Notes tab (`rail`) the
 * sidebar stays as a rail of icons and the notes list is the panel that hides; the button, ⌘B
 * and the hover reveal then act on the list. The history (`rail` "git") keeps the rail too, and
 * the button and ⌘B hide its list of changes and commits; with a diff open (`rail` "diff"),
 * its list of files.
 *
 * A hidden panel still slides out over the content while the pointer rests on its button or the
 * window's left edge, and stays while the pointer is over it. On the Notes tab the hidden notes
 * list does the same from the project's mark in the rail, after a short rest so the pointer
 * passing by on its way elsewhere leaves it closed. "leaving" keeps it on screen while it
 * slides away; coming back mid-slide reverses it.
 */
export function useSidebarLayout(rail: "notes" | "git" | "diff" | null) {
  const [sidebarHidden, setSidebarHidden] = useStoredState(
    sidebarKey,
    (saved) => saved === "hidden" || saved === "compact",
    (hidden) => (hidden ? "hidden" : "visible"),
  );
  const [notesTreeHidden, setNotesTreeHidden] = useStoredState(
    notesTreeKey,
    (saved) => saved === "hidden",
    (hidden) => (hidden ? "hidden" : "visible"),
  );
  const [historyHidden, setHistoryHidden] = useStoredState(
    historyListKey,
    (saved) => saved === "hidden",
    (hidden) => (hidden ? "hidden" : "visible"),
  );
  const [diffFilesHidden, setDiffFilesHidden] = useStoredState(
    diffFilesKey,
    (saved) => saved === "hidden",
    (hidden) => (hidden ? "hidden" : "visible"),
  );
  const [peek, setPeek] = useState<"off" | "on" | "leaving">("off");
  const peekTimer = useRef<number | undefined>(undefined);
  const showPeek = () => {
    window.clearTimeout(peekTimer.current);
    if (rail === "notes" ? notesTreeHidden : !rail && sidebarHidden)
      setPeek("on");
  };
  const showPeekSoon = () => {
    window.clearTimeout(peekTimer.current);
    if (peek !== "off") showPeek();
    else peekTimer.current = window.setTimeout(showPeek, 150);
  };
  const closePeek = () =>
    setPeek((current) =>
      current === "off" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "off"
        : "leaving",
    );
  const hidePeek = () => {
    window.clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(closePeek, 280);
  };
  const endPeek = () =>
    setPeek((current) => (current === "leaving" ? "off" : current));
  useEffect(() => setPeek("off"), [sidebarHidden, notesTreeHidden, rail]);
  // Editing hides the list only for a while, so that change is never saved.
  const hideNotesTree = (hidden: boolean, forEditing = false) =>
    setNotesTreeHidden(hidden, !forEditing);
  const toggleSidebar = () => {
    setPeek("off");
    if (rail === "notes") hideNotesTree(!notesTreeHidden);
    else if (rail === "git") setHistoryHidden((v) => !v);
    else if (rail === "diff") setDiffFilesHidden((v) => !v);
    else setSidebarHidden((v) => !v);
  };
  return {
    sidebarHidden,
    notesTreeHidden,
    hideNotesTree,
    historyHidden,
    diffFilesHidden,
    toggleSidebar,
    peek,
    showPeek,
    showPeekSoon,
    closePeek,
    hidePeek,
    endPeek,
  };
}
