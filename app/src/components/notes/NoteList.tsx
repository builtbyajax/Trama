import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { searchKey } from "../../hooks/usePopover";
import { searchDocuments } from "../../lib/api";
import { folderOf, noteName } from "../../lib/markdown";
import {
  ago,
  type DocumentHit,
  type DocumentListing,
  type Task,
  type TaskDocument,
} from "../../lib/types";
import { Icon } from "../Icon";
import { buildTree, TreeRows } from "./NoteTree";
import { Highlight } from "./textSearch";
import { locale, t } from "../../lib/i18n";

export type List = "files" | "recent" | "attached";
const lists: [List, string][] = [
  ["files", t("Files")],
  ["recent", t("Recent")],
  ["attached", t("Attached")],
];

/**
 * The notes' side list: the search box, the files as a tree, the notes changed last and those
 * attached to tasks.
 */
export function NoteList({
  projectId,
  listing,
  notes,
  documents,
  tasks,
  path,
  query,
  onQuery,
  list,
  onList,
  closed,
  onToggleFolder,
  creating,
  newEntry,
  renameEntry,
  treeOpen,
  treeHidden,
  treePeek,
  onTreeHover,
  onTreeLeave,
  onTreePeekEnd,
  onOpen,
  onNoteMenu,
  onFolderMenu,
  onCreate,
}: {
  projectId: string;
  listing: DocumentListing | null;
  notes: string[];
  documents: TaskDocument[];
  tasks: Task[];
  path: string | null;
  query: string;
  onQuery: (query: string) => void;
  list: List;
  onList: (list: List) => void;
  closed: Record<string, boolean>;
  onToggleFolder: (folder: string) => void;
  creating: { kind: "note" | "folder"; folder: string } | null;
  newEntry?: { folder: string; row: ReactNode };
  renameEntry?: {
    path: string;
    row: (folder: boolean, depth: number) => ReactNode;
  };
  treeOpen: boolean;
  treeHidden: boolean;
  treePeek: "off" | "on" | "leaving";
  onTreeHover: () => void;
  onTreeLeave: () => void;
  onTreePeekEnd: () => void;
  /** `newTab` when the note was ⌘-clicked. */
  onOpen: (
    note: string,
    heading?: string | null,
    text?: string | null,
    newTab?: boolean,
  ) => void;
  onNoteMenu: (event: MouseEvent<HTMLElement>, note: string) => void;
  onFolderMenu: (event: MouseEvent<HTMLElement>, folder: string) => void;
  onCreate: (kind: "note" | "folder", folder?: string) => void;
}) {
  const [hits, setHits] = useState<DocumentHit[] | null>(null);
  // Text search runs in Rust after a short pause; names are matched here at once.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setHits(null);
      return;
    }
    let active = true;
    const timer = window.setTimeout(
      () =>
        void searchDocuments(projectId, text).then(
          (found) => active && setHits(found),
          () => active && setHits([]),
        ),
      180,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [projectId, query]);
  const named = query.trim()
    ? notes.filter((n) => searchKey(noteName(n)).includes(searchKey(query)))
    : null;
  const inText = (hits ?? []).filter((h) => !named?.includes(h.path));
  const folders = useMemo(() => listing?.folders ?? [], [listing]);
  const tree = useMemo(() => buildTree(notes, folders), [notes, folders]);
  const attachedNotes = [...new Set(documents.map((d) => d.path))]
    .filter((n) => notes.includes(n))
    .map((n) => ({
      path: n,
      tasks: documents
        .filter((d) => d.path === n)
        .map((d) => tasks.find((t) => t.id === d.taskId))
        .filter((t): t is Task => Boolean(t)),
    }))
    .sort((x, y) => noteName(x.path).localeCompare(noteName(y.path), locale));
  const noteRow = (note: string, detail: ReactNode, when?: string) => (
    <button
      key={note}
      type="button"
      className={`tree-row two ${note === path ? "on" : ""}`}
      aria-current={note === path ? "page" : undefined}
      onClick={(event) =>
        onOpen(note, null, null, event.metaKey || event.ctrlKey)
      }
      onContextMenu={(event) => onNoteMenu(event, note)}
    >
      <Icon name="file" size={13} />
      <span className="tree-two">
        <span className="truncate">{noteName(note)}</span>
        {detail && <small className="truncate">{detail}</small>}
      </span>
      {when && <span className="tree-when">{when}</span>}
    </button>
  );
  return (
    <nav
      className={`notes-tree ${treeOpen ? "open" : ""} ${treeHidden && treePeek !== "off" ? `peek ${treePeek === "leaving" ? "leaving" : ""}` : ""}`}
      aria-label={t("Notes")}
      onMouseEnter={treeHidden ? onTreeHover : undefined}
      onMouseLeave={treeHidden ? onTreeLeave : undefined}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget) onTreePeekEnd();
      }}
    >
      <label className="notes-search">
        <Icon name="search" size={13} />
        <input
          aria-label={t("Search notes")}
          placeholder={t("Search notes")}
          value={query}
          spellCheck={false}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              if (named?.[0]) onOpen(named[0]);
              else if (inText[0]) onOpen(inText[0].path, null, query.trim());
            }
            if (event.key === "Escape" && query) {
              event.stopPropagation();
              onQuery("");
            }
          }}
        />
      </label>
      {!query.trim() && (
        <div className="notes-lists" role="tablist" aria-label={t("Lists")}>
          {lists.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={list === key}
              className={list === key ? "on" : ""}
              onClick={() => onList(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="notes-list scroll">
        {query.trim() || list === "files" ? (
          <>
            {named ? (
              named.length || inText.length ? (
                <>
                  {named.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`tree-row ${n === path ? "on" : ""}`}
                      aria-current={n === path ? "page" : undefined}
                      onClick={(event) =>
                        onOpen(n, null, null, event.metaKey || event.ctrlKey)
                      }
                      onContextMenu={(event) => onNoteMenu(event, n)}
                    >
                      <Icon name="file" size={13} />
                      <span className="truncate">{noteName(n)}</span>
                      <span className="tree-folder truncate">
                        {n.slice(0, n.lastIndexOf("/") + 1).replace(/\/$/, "")}
                      </span>
                    </button>
                  ))}
                  {inText.length > 0 && (
                    <p className="tree-label">{t("In the text")}</p>
                  )}
                  {inText.map((hit) => (
                    <button
                      key={hit.path}
                      type="button"
                      className={`tree-row hit ${hit.path === path ? "on" : ""}`}
                      aria-current={hit.path === path ? "page" : undefined}
                      onClick={(event) =>
                        onOpen(
                          hit.path,
                          null,
                          query.trim(),
                          event.metaKey || event.ctrlKey,
                        )
                      }
                      onContextMenu={(event) => onNoteMenu(event, hit.path)}
                    >
                      <span className="tree-hit-name">
                        <Icon name="file" size={13} />
                        <span className="truncate">{noteName(hit.path)}</span>
                      </span>
                      <span className="tree-excerpt">
                        <Highlight text={hit.excerpt} query={query} />
                      </span>
                    </button>
                  ))}
                </>
              ) : (
                <p className="tree-empty">
                  {hits === null && query.trim().length >= 2
                    ? t("Searching…")
                    : t("No notes with that name or text.")}
                </p>
              )
            ) : notes.length || folders.length || creating ? (
              <TreeRows
                node={tree}
                depth={0}
                path={path}
                closed={closed}
                attached={documents}
                onToggle={onToggleFolder}
                onOpen={(n, newTab) => onOpen(n, null, null, newTab)}
                onNoteMenu={onNoteMenu}
                onFolderMenu={onFolderMenu}
                onCreate={onCreate}
                newEntry={newEntry}
                renameEntry={renameEntry}
              />
            ) : listing ? (
              <p className="tree-empty">{t("No .md notes in this folder.")}</p>
            ) : (
              <p className="tree-empty">{t("Reading the folder…")}</p>
            )}
          </>
        ) : list === "recent" ? (
          listing?.recent.length ? (
            listing.recent.map((r) =>
              noteRow(r.path, folderOf(r.path), ago(r.modified)),
            )
          ) : (
            <p className="tree-empty">{t("No notes yet.")}</p>
          )
        ) : attachedNotes.length ? (
          attachedNotes.map((n) =>
            noteRow(
              n.path,
              <span className="tree-task">
                {n.tasks.map((t) => t.title).join(", ")}
              </span>,
            ),
          )
        ) : (
          <p className="tree-empty">
            {t("No notes attached to a task in this project.")}
          </p>
        )}
      </div>
      <div className="notes-foot">
        <button
          type="button"
          className="button small"
          onClick={() => onCreate("note")}
        >
          <Icon name="filePlus" size={14} />
          {t("New note")}
        </button>
        <button
          type="button"
          className="button small"
          onClick={() => onCreate("folder")}
        >
          <Icon name="folderPlus" size={14} />
          {t("New folder")}
        </button>
      </div>
    </nav>
  );
}
