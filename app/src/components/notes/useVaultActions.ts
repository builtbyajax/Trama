import {
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  createDocument,
  createDocumentFolder,
  errorMessage,
  renameDocument,
  trashDocument,
} from "../../lib/api";
import type { DocumentFile } from "../../lib/types";
import type { List } from "./NoteList";
import { moved, under } from "./NoteTree";
import { remember } from "./noteStorage";
import { t } from "../../lib/i18n";

/**
 * Creating, renaming and deleting notes and folders. The tabs, the open folders and the note on
 * screen follow what changed.
 */
export function useVaultActions({
  projectId,
  tabs,
  setTabs,
  setClosed,
  setQuery,
  setList,
  setPath,
  setFile,
  setDraft,
  setSave,
  setEditing,
  latest,
  timer,
  flush,
  open,
  loadList,
  onChanged,
  notify,
}: {
  projectId: string;
  tabs: string[];
  setTabs: Dispatch<SetStateAction<string[]>>;
  setClosed: Dispatch<SetStateAction<Record<string, boolean>>>;
  setQuery: (query: string) => void;
  setList: (list: List) => void;
  setPath: (path: string | null) => void;
  setFile: Dispatch<SetStateAction<DocumentFile | null>>;
  setDraft: (draft: string | null) => void;
  setSave: (save: "saved") => void;
  setEditing: (editing: boolean) => void;
  latest: MutableRefObject<{
    file: DocumentFile | null;
    draft: string | null;
    path: string | null;
  }>;
  timer: MutableRefObject<number | undefined>;
  flush: () => Promise<boolean>;
  open: (
    target: string,
    heading?: string | null,
    text?: string | null,
    newTab?: boolean,
  ) => Promise<void>;
  loadList: () => Promise<void>;
  onChanged: () => void;
  notify: (text: string, error?: boolean) => void;
}) {
  // A note or folder being named in the tree, inside `folder` ("" is the vault itself).
  const [creating, setCreating] = useState<{
    kind: "note" | "folder";
    folder: string;
  } | null>(null);
  // The note or folder being renamed in the tree.
  const [renaming, setRenaming] = useState<string | null>(null);
  // The note or folder waiting for the move to the trash to be confirmed.
  const [removing, setRemoving] = useState<{
    path: string;
    folder: boolean;
  } | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [busy, setBusy] = useState(false);

  function startCreating(kind: "note" | "folder", folder = "") {
    setQuery("");
    setList("files");
    if (folder) setClosed((c) => ({ ...c, [folder]: false }));
    setRenaming(null);
    setCreating({ kind, folder });
  }
  function startRenaming(target: string) {
    setQuery("");
    setList("files");
    setCreating(null);
    // The folders around it open, so its row is on screen.
    const parts = target.split("/");
    setClosed((c) => {
      const next = { ...c };
      for (let i = 1; i < parts.length; i++)
        next[parts.slice(0, i).join("/")] = false;
      return next;
    });
    setRenaming(target);
  }
  async function rename(target: string, name: string) {
    const current = latest.current.path;
    if (current && under(current, target) && !(await flush())) {
      notify(t("Save or discard your changes before renaming."), true);
      return;
    }
    try {
      const next = await renameDocument(projectId, target, name);
      setRenaming(null);
      if (next === target) return;
      // Tabs, open folders and the note on screen follow the new path.
      setTabs((ts) => ts.map((t) => moved(t, target, next)));
      setClosed((c) =>
        Object.fromEntries(
          Object.entries(c).map(([k, v]) => [moved(k, target, next), v]),
        ),
      );
      if (current && under(current, target)) {
        const to = moved(current, target, next);
        latest.current = { ...latest.current, path: to };
        setPath(to);
        setFile((f) => f && { ...f, path: to });
        remember(projectId, to);
      }
      await loadList();
      onChanged();
    } catch (e) {
      notify(errorMessage(e), true);
    }
  }
  function confirmRemove(target: string, folder: boolean) {
    setRemoveError("");
    setRemoving({ path: target, folder });
  }
  async function remove(target: string) {
    const current = latest.current.path;
    const showing = current !== null && under(current, target);
    // Pending edits are saved first, so they go to the trash with the note.
    if (showing && !(await flush())) {
      notify(t("Save or discard your changes before deleting."), true);
      return;
    }
    setBusy(true);
    try {
      await trashDocument(projectId, target);
    } catch (e) {
      setRemoveError(errorMessage(e));
      return;
    } finally {
      setBusy(false);
    }
    setRemoving(null);
    const rest = tabs.filter((t) => !under(t, target));
    setTabs(rest);
    if (showing) {
      window.clearTimeout(timer.current);
      latest.current = { file: null, draft: null, path: null };
      setPath(null);
      setFile(null);
      setDraft(null);
      setSave("saved");
      setEditing(false);
      const at = tabs.indexOf(current);
      const next = rest[Math.max(0, Math.min(at, rest.length) - 1)] ?? rest[0];
      if (next) void open(next);
    }
    await loadList();
    onChanged();
  }
  async function create(name: string) {
    if (!creating) return;
    const target = creating.folder ? `${creating.folder}/${name}` : name;
    try {
      if (creating.kind === "note") {
        const made = await createDocument(projectId, target);
        setCreating(null);
        await loadList();
        await open(made.path, null, null, true);
        setEditing(true);
      } else {
        await createDocumentFolder(projectId, target);
        setCreating(null);
        await loadList();
      }
    } catch (e) {
      notify(errorMessage(e), true);
    }
  }

  return {
    creating,
    setCreating,
    renaming,
    setRenaming,
    removing,
    setRemoving,
    removeError,
    busy,
    startCreating,
    startRenaming,
    rename,
    confirmRemove,
    remove,
    create,
  };
}
