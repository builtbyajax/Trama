import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage, listDocuments, readDocument } from "../../lib/api";
import { noteName, parseMarkdown, slug, toggleTodo } from "../../lib/markdown";
import {
  type DocumentListing,
  type Task,
  type TaskDocument,
} from "../../lib/types";
import { Icon } from "../Icon";
import type { NoteContext } from "../Markdown";
import { ContextMenu } from "../Sidebar";
import {
  NoteAlert,
  NoteEditor,
  useEditorSync,
  useEditShortcuts,
} from "./NoteEditor";
import { NoteList, type List } from "./NoteList";
import { NoteMarks } from "./NoteMarks";
import { NotePage, NoteReader } from "./NotePage";
import { NoteTabs } from "./NoteTabs";
import { NameEntry } from "./NoteTree";
import { RemoveNote } from "./RemoveNote";
import { stored } from "../../lib/storage";
import { dualKey, followKey, lastKey, remember } from "./noteStorage";
import { useFindFlash } from "./useFindFlash";
import { useNoteFile } from "./useNoteFile";
import { useNoteMenus } from "./useNoteMenus";
import { useNoteTabs } from "./useNoteTabs";
import { useVaultActions } from "./useVaultActions";
import { t } from "../../lib/i18n";

/**
 * The project's notes folder. Beside it, the files, the notes changed last and those attached to
 * tasks; the notes open in tabs, each read as a page with its headings as marks on the left.
 * Editing (⌘E) is its own screen: the Markdown alone or beside the page it makes, saved on its
 * own. The files are read again when the window comes back to the front, so edits made elsewhere
 * show up. The list hides with the window's sidebar button (⌘B) and then slides out over the
 * note while the pointer rests on the project's mark in the rail; editing hides it until the
 * editor closes.
 */
export function NotesView({
  projectId,
  root,
  documents,
  tasks,
  revision,
  openRequest,
  treeHidden,
  onTreeHidden,
  treePeek,
  onTreeHover,
  onTreeLeave,
  onTreePeekEnd,
  onOpenTask,
  onChanged,
  notify,
}: {
  projectId: string;
  /** The project's notes folder. */
  root: string;
  documents: TaskDocument[];
  tasks: Task[];
  revision: number;
  /** A note to open, asked from elsewhere (a task's attachment, a search in every vault). */
  openRequest: {
    path: string;
    at: number;
    find?: string;
    edit?: boolean;
  } | null;
  treeHidden: boolean;
  /** `forEditing` when the editor hides it, which is not kept for next time. */
  onTreeHidden: (hidden: boolean, forEditing?: boolean) => void;
  /** The hidden tree shown for a moment over the note; "leaving" while it slides away. */
  treePeek: "off" | "on" | "leaving";
  onTreeHover: () => void;
  onTreeLeave: () => void;
  onTreePeekEnd: () => void;
  onOpenTask: (task: Task) => void;
  /** A rename or deletion that may have changed the tasks' attachments. */
  onChanged: () => void;
  notify: (text: string, error?: boolean) => void;
}) {
  const [listing, setListing] = useState<DocumentListing | null>(null);
  const [listError, setListError] = useState("");
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  // Edit screen: the text with the page beside it, or the text alone.
  const [dual, setDual] = useState(() => stored(dualKey) !== "off");
  const { tabs, setTabs } = useNoteTabs(projectId, listing);
  const [list, setList] = useState<List>("files");
  // While editing side by side, the reader follows the editor's scroll.
  const [follow, setFollow] = useState(() => stored(followKey) !== "off");
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [treeOpen, setTreeOpen] = useState(false);
  // Whether the tree was hidden before editing, to put it back when the editor closes.
  const treeBeforeEdit = useRef<boolean | null>(null);
  useEffect(() => {
    if (editing) {
      treeBeforeEdit.current ??= treeHidden;
      onTreeHidden(true, true);
    } else if (treeBeforeEdit.current !== null) {
      onTreeHidden(treeBeforeEdit.current);
      treeBeforeEdit.current = null;
    }
    // Only entering and leaving the editor move the tree.
  }, [editing]);
  const reader = useRef<HTMLDivElement>(null);
  const {
    path,
    setPath,
    file,
    setFile,
    fileError,
    setFileError,
    draft,
    setDraft,
    save,
    setSave,
    saveError,
    setSaveError,
    timer,
    latest,
    loadFile,
    flush,
    change,
  } = useNoteFile(projectId);
  const { setFind, flash, setFlash } = useFindFlash(reader, file);

  const loadList = useCallback(async () => {
    try {
      const loaded = await listDocuments(projectId);
      setListing((current) =>
        JSON.stringify(current) === JSON.stringify(loaded) ? current : loaded,
      );
      setListError("");
    } catch (e) {
      setListError(errorMessage(e));
    }
  }, [projectId]);
  useEffect(() => {
    void loadList();
  }, [loadList, root, revision]);
  useEffect(() => {
    const again = () => {
      void loadList();
      if (latest.current.path) void loadFile(latest.current.path);
    };
    window.addEventListener("focus", again);
    return () => window.removeEventListener("focus", again);
  }, [loadList, loadFile]);

  const notes = useMemo(() => listing?.notes ?? [], [listing]);
  const open = useCallback(
    async (
      target: string,
      heading: string | null = null,
      text: string | null = null,
      newTab = false,
    ) => {
      const from = latest.current.path;
      if (!(await flush())) {
        notify(
          t("Save or discard your changes before opening another note."),
          true,
        );
        return;
      }
      setTreeOpen(false);
      // A note opens in its tab when it has one, else in place of the current note.
      setTabs((current) => {
        if (current.includes(target)) return current;
        const at = from ? current.indexOf(from) : -1;
        if (newTab || at < 0) return [...current, target];
        return current.map((t, i) => (i === at ? target : t));
      });
      if (target !== latest.current.path) {
        latest.current = { file: null, draft: null, path: target };
        setPath(target);
        setFile(null);
        setDraft(null);
        setSave("saved");
        setSaveError("");
        setFileError("");
        remember(projectId, target);
        reader.current?.scrollTo({ top: 0 });
      }
      await loadFile(target);
      if (text) setFind({ path: target, text, at: Date.now() });
      if (heading)
        requestAnimationFrame(() =>
          reader.current
            ?.querySelector(`#${CSS.escape(slug(heading))}`)
            ?.scrollIntoView({ block: "start" }),
        );
    },
    [flush, loadFile, notify, projectId],
  );

  // First note: the one asked for, else the last one read here, else the first in the tree.
  // Closing every tab later leaves the page empty.
  const started = useRef(false);
  useEffect(() => {
    if (!listing || path || started.current) return;
    started.current = true;
    const last = stored(lastKey(projectId));
    const first =
      (last && notes.includes(last) && last) ||
      notes.find((n) => /(^|\/)(readme|index|leia-me)\.md$/i.test(n)) ||
      notes[0];
    if (first) void open(first);
  }, [listing, notes, path, open, projectId]);
  async function closeTab(target: string) {
    const at = tabs.indexOf(target);
    const rest = tabs.filter((t) => t !== target);
    if (target !== path) {
      setTabs(rest);
      return;
    }
    if (!(await flush())) {
      notify(t("Save or discard your changes before closing the note."), true);
      return;
    }
    setTabs(rest);
    const next = rest[Math.max(0, at - 1)];
    if (next) {
      void open(next);
      return;
    }
    latest.current = { file: null, draft: null, path: null };
    setPath(null);
    setFile(null);
    setEditing(false);
  }
  const {
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
  } = useVaultActions({
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
  });
  const { menu, setMenu, noteMenu, folderMenu, tabMenu } = useNoteMenus({
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
  });
  useEditShortcuts(latest, editingRef, setEditing);
  const handled = useRef<number | null>(null);
  useEffect(() => {
    if (!openRequest || handled.current === openRequest.at) return;
    handled.current = openRequest.at;
    const edit = openRequest.edit;
    void open(openRequest.path, null, openRequest.find ?? null).then(
      () => edit && setEditing(true),
    );
  }, [openRequest, open]);

  const text = draft ?? file?.text ?? "";
  const doc = useMemo(() => parseMarkdown(text), [text]);
  const { area, sync, followEditor, jumpToSource } = useEditorSync({
    reader,
    follow,
    editing,
    text,
  });
  const context: NoteContext = {
    projectId,
    path: path ?? "",
    notes: listing?.notes ?? [],
    images: listing?.images ?? [],
    onOpenNote: (target, heading) => void open(target, heading),
    onToggle: file ? (line) => change(toggleTodo(text, line)) : undefined,
    onError: (message) => notify(message, true),
  };
  const attachedTo = path
    ? documents
        .filter((d) => d.path === path)
        .map((d) => tasks.find((t) => t.id === d.taskId))
        .filter((t): t is Task => Boolean(t))
    : [];

  const newEntry = creating && {
    folder: creating.folder,
    row: (
      <NameEntry
        kind={creating.kind}
        depth={creating.folder ? creating.folder.split("/").length : 0}
        onSubmit={(name) => void create(name)}
        onCancel={() => setCreating(null)}
      />
    ),
  };
  const renameEntry = renaming && {
    path: renaming,
    row: (folder: boolean, depth: number) => (
      <NameEntry
        key={renaming}
        kind={folder ? "folder" : "note"}
        depth={depth}
        initial={folder ? renaming.split("/").pop() : noteName(renaming)}
        onSubmit={(name) => void rename(renaming, name)}
        onCancel={() => setRenaming(null)}
      />
    ),
  };
  if (listError && !listing)
    return (
      <div className="empty-state">
        <Icon name="warning" size={22} />
        <strong>{t("The notes folder didn't open")}</strong>
        <p>{listError}</p>
        <button className="button" onClick={() => void loadList()}>
          {t("Try again")}
        </button>
      </div>
    );
  const discard = () => {
    setDraft(null);
    setSave("saved");
    setSaveError("");
    latest.current.draft = null;
    latest.current.file = null;
    setFile(null);
    if (path) void loadFile(path);
  };
  const keepMine = () => {
    if (!path) return;
    // Keep this text: take the version on disk as the base and save over it.
    void readDocument(projectId, path).then((disk) => {
      latest.current.file = disk;
      setFile(disk);
      void flush();
    });
  };
  const readerBox = (
    <NoteReader
      reader={reader}
      flash={flash}
      fileError={fileError}
      path={path}
      onScroll={
        editing && dual
          ? () => requestAnimationFrame(() => sync("reader"))
          : undefined
      }
      onDoubleClick={(target) => {
        if (editing && follow) jumpToSource(target);
      }}
      onFlashEnd={() => setFlash(null)}
    >
      {file && (
        <NotePage
          file={file}
          editing={editing}
          doc={doc}
          context={context}
          attachedTo={attachedTo}
          onOpenTask={onOpenTask}
          onEdit={() => setEditing(true)}
        />
      )}
    </NoteReader>
  );
  return (
    <div
      className={`notes ${editing ? "editing" : ""} ${treeHidden ? "tree-hidden" : ""}`}
    >
      <NoteList
        projectId={projectId}
        listing={listing}
        notes={notes}
        documents={documents}
        tasks={tasks}
        path={path}
        query={query}
        onQuery={setQuery}
        list={list}
        onList={setList}
        closed={closed}
        onToggleFolder={(folder) =>
          setClosed((c) => ({ ...c, [folder]: !c[folder] }))
        }
        creating={creating}
        newEntry={newEntry || undefined}
        renameEntry={renameEntry || undefined}
        treeOpen={treeOpen}
        treeHidden={treeHidden}
        treePeek={treePeek}
        onTreeHover={onTreeHover}
        onTreeLeave={onTreeLeave}
        onTreePeekEnd={onTreePeekEnd}
        onOpen={open}
        onNoteMenu={noteMenu}
        onFolderMenu={folderMenu}
        onCreate={startCreating}
      />
      {treeOpen && (
        <button
          type="button"
          className="notes-scrim"
          aria-label={t("Close notes list")}
          tabIndex={-1}
          onClick={() => setTreeOpen(false)}
        />
      )}
      <section
        className="note-pane"
        aria-label={path ? noteName(path) : t("Note")}
      >
        <NoteTabs
          tabs={tabs}
          path={path}
          file={file}
          editing={editing}
          save={save}
          root={root}
          onShowTree={() => setTreeOpen((v) => !v)}
          onOpen={(t) => void open(t)}
          onClose={(t) => void closeTab(t)}
          onMenu={tabMenu}
          onEdit={() => setEditing(true)}
          notify={notify}
        />
        <NoteAlert
          save={save}
          saveError={saveError}
          onRetry={() => void flush()}
          onDiscard={discard}
          onKeep={keepMine}
        />
        {editing && file ? (
          <NoteEditor
            area={area}
            notes={notes}
            path={file.path}
            text={text}
            dual={dual}
            follow={follow}
            onDual={setDual}
            onFollow={setFollow}
            onChange={change}
            onFlush={() => void flush()}
            onDone={() => setEditing(false)}
            onScroll={() => requestAnimationFrame(followEditor)}
          >
            {readerBox}
          </NoteEditor>
        ) : (
          <div className="note-read">
            {readerBox}
            {file && (
              <NoteMarks
                key={file.path}
                headings={doc.headings.filter((h) => h.level <= 3)}
                reader={reader}
              />
            )}
          </div>
        )}
      </section>
      {removing && (
        <RemoveNote
          removing={removing}
          notes={notes}
          documents={documents}
          busy={busy}
          error={removeError}
          onClose={() => setRemoving(null)}
          onConfirm={() => void remove(removing.path)}
        />
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={menu.label}
          items={menu.items}
          onClose={(restoreFocus) => {
            if (restoreFocus) menu.trigger.focus();
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}
