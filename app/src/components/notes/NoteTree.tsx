import {
  Fragment,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { noteName } from "../../lib/markdown";
import type { TaskDocument } from "../../lib/types";
import { Icon } from "../Icon";
import { locale, t } from "../../lib/i18n";

/** Whether `path` is `target` or lies inside it, when `target` is a folder. */
export const under = (path: string, target: string) =>
  path === target || path.startsWith(`${target}/`);
/** `path` after `from` became `to`. */
export const moved = (path: string, from: string, to: string) =>
  under(path, from) ? to + path.slice(from.length) : path;

interface Folder {
  name: string;
  path: string;
  entries: TreeEntry[];
}
type TreeEntry =
  { kind: "folder"; folder: Folder } | { kind: "note"; note: string };

const collator = new Intl.Collator(locale, {
  numeric: true,
  sensitivity: "base",
});
const entryName = (entry: TreeEntry) =>
  entry.kind === "folder" ? entry.folder.name : noteName(entry.note);
const entryPath = (entry: TreeEntry) =>
  entry.kind === "folder" ? entry.folder.path : entry.note;
const compareEntries = (a: TreeEntry, b: TreeEntry) => {
  const aName = entryName(a);
  const bName = entryName(b);
  return (
    collator.compare(aName, bName) ||
    aName.localeCompare(bName, locale) ||
    (a.kind === b.kind ? 0 : a.kind === "folder" ? -1 : 1) ||
    entryPath(a).localeCompare(entryPath(b), locale)
  );
};

export function buildTree(notes: string[], folders: string[] = []): Folder {
  const root: Folder = { name: "", path: "", entries: [] };
  const entries = [
    ...folders.map((f) => ({ parts: [...f.split("/"), ""], note: null })),
    ...notes.map((n) => ({ parts: n.split("/"), note: n })),
  ];
  for (const { parts, note } of entries) {
    let node = root;
    parts.slice(0, -1).forEach((part, i) => {
      const path = parts.slice(0, i + 1).join("/");
      let next = node.entries.find(
        (entry): entry is Extract<TreeEntry, { kind: "folder" }> =>
          entry.kind === "folder" && entry.folder.path === path,
      )?.folder;
      if (!next) {
        next = { name: part, path, entries: [] };
        node.entries.push({ kind: "folder", folder: next });
      }
      node = next;
    });
    if (note) node.entries.push({ kind: "note", note });
  }
  const sort = (node: Folder) => {
    node.entries.sort(compareEntries);
    node.entries.forEach((entry) => {
      if (entry.kind === "folder") sort(entry.folder);
    });
  };
  sort(root);
  return root;
}

export function TreeRows({
  node,
  depth,
  path,
  closed,
  attached,
  onToggle,
  onOpen,
  onNoteMenu,
  onFolderMenu,
  onCreate,
  newEntry,
  renameEntry,
}: {
  node: Folder;
  depth: number;
  path: string | null;
  closed: Record<string, boolean>;
  attached: TaskDocument[];
  onToggle: (folder: string) => void;
  /** `newTab` when the note was ⌘-clicked. */
  onOpen: (note: string, newTab?: boolean) => void;
  onNoteMenu?: (event: MouseEvent<HTMLElement>, note: string) => void;
  onFolderMenu?: (event: MouseEvent<HTMLElement>, folder: string) => void;
  /** Offers a new note or folder inside each folder; absent where the tree is read-only. */
  onCreate?: (kind: "note" | "folder", folder: string) => void;
  /** The row naming a new entry, shown first inside its folder. */
  newEntry?: { folder: string; row: ReactNode };
  /** The row renaming a note or folder, shown in its place. */
  renameEntry?: {
    path: string;
    row: (folder: boolean, depth: number) => ReactNode;
  };
}) {
  function folderRow(folder: Folder) {
    const isClosed = closed[folder.path];
    return (
      <div key={folder.path} role="group" aria-label={folder.name}>
        {renameEntry?.path === folder.path ? (
          renameEntry.row(true, depth)
        ) : (
          <div className="tree-folder-row">
            <button
              type="button"
              className="tree-row folder"
              style={{ paddingLeft: 6 + depth * 14 }}
              aria-expanded={!isClosed}
              onClick={() => onToggle(folder.path)}
              onContextMenu={
                onFolderMenu && ((event) => onFolderMenu(event, folder.path))
              }
            >
              <span className={"tree-chevron " + (isClosed ? "" : "open")}>
                <Icon name="chevronRight" size={12} />
              </span>
              <span className="truncate">{folder.name}</span>
            </button>
            {onCreate && (
              <span className="tree-actions">
                <button
                  type="button"
                  className="icon-button small"
                  aria-label={t("New note in {0}", [folder.name])}
                  data-tooltip={t("New note here")}
                  onClick={() => onCreate("note", folder.path)}
                >
                  <Icon name="filePlus" size={13} />
                </button>
                <button
                  type="button"
                  className="icon-button small"
                  aria-label={t("New folder in {0}", [folder.name])}
                  data-tooltip={t("New folder here")}
                  onClick={() => onCreate("folder", folder.path)}
                >
                  <Icon name="folderPlus" size={13} />
                </button>
              </span>
            )}
          </div>
        )}
        {!isClosed && (
          <TreeRows
            node={folder}
            depth={depth + 1}
            path={path}
            closed={closed}
            attached={attached}
            onToggle={onToggle}
            onOpen={onOpen}
            onNoteMenu={onNoteMenu}
            onFolderMenu={onFolderMenu}
            onCreate={onCreate}
            newEntry={newEntry}
            renameEntry={renameEntry}
          />
        )}
      </div>
    );
  }

  function noteRow(note: string) {
    return renameEntry?.path === note ? (
      <Fragment key={note}>{renameEntry.row(false, depth)}</Fragment>
    ) : (
      <button
        key={note}
        type="button"
        className={"tree-row " + (note === path ? "on" : "")}
        // A note's icon sits where a folder beside it has its chevron, so notes never look nested.
        style={{ paddingLeft: 6 + depth * 14 }}
        aria-current={note === path ? "page" : undefined}
        onClick={(event) => onOpen(note, event.metaKey || event.ctrlKey)}
        onContextMenu={onNoteMenu && ((event) => onNoteMenu(event, note))}
      >
        <Icon name="file" size={13} />
        <span className="truncate">{noteName(note)}</span>
        {attached.some((d) => d.path === note) && (
          <span className="tree-clip" data-tooltip={t("Attached to a task")}>
            <Icon name="clip" size={12} />
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      {newEntry?.folder === node.path && newEntry.row}
      {node.entries.map((entry) =>
        entry.kind === "folder" ? folderRow(entry.folder) : noteRow(entry.note),
      )}
    </>
  );
}

/**
 * Names a note or folder in place, new or being renamed: ↩ keeps the name, esc gives up. Leaving
 * the field keeps a changed name and gives up on an empty or unchanged one.
 */
export function NameEntry({
  kind,
  depth,
  initial = "",
  onSubmit,
  onCancel,
}: {
  kind: "note" | "folder";
  depth: number;
  initial?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const done = useRef(false);
  const finish = (keep: boolean) => {
    if (done.current) return;
    done.current = true;
    if (keep && name.trim() && name.trim() !== initial) onSubmit(name.trim());
    else onCancel();
  };
  const label = kind === "note" ? t("Note name") : t("Folder name");
  return (
    <div className="tree-row tree-new" style={{ paddingLeft: 6 + depth * 14 }}>
      <Icon name={kind === "note" ? "file" : "folder"} size={13} />
      <input
        autoFocus
        aria-label={label}
        placeholder={label}
        value={name}
        spellCheck={false}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          if (initial) finish(true);
          else if (!name.trim()) finish(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && name.trim()) {
            event.preventDefault();
            // A name refused before can be tried again.
            done.current = false;
            finish(true);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            finish(false);
          }
        }}
      />
    </div>
  );
}
