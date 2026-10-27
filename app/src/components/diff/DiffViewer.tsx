import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { copyText } from "../../lib/api";
import { changeTitle, totals } from "../../lib/diff";
import type { FileDiff, GitCommit, Task } from "../../lib/types";
import { DiffBlocks, when } from "../git/parts";
import { Glyph } from "../BoardFilters";
import { Icon } from "../Icon";
import { DiffFile, splitFolder } from "./DiffFile";
import { t } from "../../lib/i18n";

/** Where the change comes from, for the head of the page. */
export interface DiffContext {
  project: string;
  commit?: GitCommit;
  task?: Task | null;
}

/**
 * The diff, in place of the history: on the left the files in a tree of folders that close, with a filter,
 * which the topbar's sidebar button hides; on the right the change and every file in one scroll,
 * each under a head that stays at the top while it is read. Both layouts wrap long lines. The
 * topbar names the change and its Back closes it.
 */
export function DiffViewer({
  title,
  files,
  initialFile,
  context,
  filesHidden,
  notify,
  onOpenTask,
  onClose,
}: {
  title: string;
  files: FileDiff[];
  initialFile?: string;
  context: DiffContext;
  filesHidden: boolean;
  notify: (text: string, error?: boolean) => void;
  onOpenTask: (task: Task) => void;
  onClose: () => void;
}) {
  const mainRef = useRef<HTMLElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(() =>
    Math.max(
      0,
      files.findIndex((f) => f.path === initialFile),
    ),
  );
  const [layout, setLayout] = useState<"side" | "inline">("side");
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [filter, setFilter] = useState("");
  const [closedFolders, setClosedFolders] = useState<Set<string>>(
    () => new Set(),
  );
  const sum = totals(files);
  const { commit, task } = context;

  const sectionOf = (i: number) =>
    mainRef.current?.querySelector<HTMLElement>(`[data-file="${i}"]`);
  // Files above may still change height as they render, so the jump settles on the next frames.
  const go = (i: number) => {
    const target = Math.min(files.length - 1, Math.max(0, i));
    setCurrent(target);
    const place = () => {
      const section = sectionOf(target);
      if (section && mainRef.current)
        mainRef.current.scrollTop = section.offsetTop;
    };
    place();
    requestAnimationFrame(() => {
      place();
      requestAnimationFrame(place);
    });
  };
  const goRef = useRef(go);
  goRef.current = go;
  const currentRef = useRef(current);
  currentRef.current = current;

  useEffect(() => {
    // The page takes focus: the arrows scroll it and no button opens ringed.
    mainRef.current?.focus({ preventScroll: true });
    if (initialFile) goRef.current(currentRef.current);
  }, []);
  // Keys act while the focus is in the diff, so a dialog opened over it keeps its own Escape.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      onClose();
    }
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      go(current + (e.key === "ArrowDown" ? 1 : -1));
    }
  };
  useEffect(() => {
    treeRef.current
      ?.querySelector(`[data-index="${current}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [current]);

  // The file being read is the last one whose head has reached the top; its head, stuck there
  // over the code, drops its rounded corners.
  const frame = useRef(0);
  const stuck = useRef<HTMLElement | null>(null);
  const onScroll = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const main = mainRef.current;
      if (!main) return;
      const top = main.scrollTop + 48;
      let index = 0;
      let reading: HTMLElement | null = null;
      for (const section of main.querySelectorAll<HTMLElement>("[data-file]")) {
        if (section.offsetTop > top) break;
        index = Number(section.dataset.file);
        reading = section;
      }
      setCurrent(index);
      const next =
        reading && main.scrollTop > reading.offsetTop ? reading : null;
      if (next !== stuck.current) {
        // A data attribute, since React rewrites the class when the file collapses.
        if (stuck.current) delete stuck.current.dataset.stuck;
        if (next) next.dataset.stuck = "";
        stuck.current = next;
      }
    });
  };

  const tree = useMemo(
    () => buildTree(files, filter.trim().toLowerCase()),
    [files, filter],
  );
  // A folder closed while filtering would hide the very files searched for.
  const filtering = filter.trim() !== "";
  const toggleFolder = (path: string) =>
    setClosedFolders((set) => {
      const next = new Set(set);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  const renderLevel = (entries: TreeEntry[], depth: number) => (
    <ul className="file-list" role={depth ? "group" : undefined}>
      {entries.map((entry) => {
        if ("file" in entry) {
          const { file, index } = entry;
          return (
            <li key={file.path}>
              <button
                type="button"
                data-index={index}
                aria-current={index === current || undefined}
                className={`file-item ${index === current ? "selected" : ""}`}
                style={{ "--depth": depth } as CSSProperties}
                title={`${changeTitle(file.change)}: ${file.path}`}
                onClick={() => go(index)}
              >
                <span
                  className={`change-dot ${file.change}`}
                  aria-hidden="true"
                />
                <span className="file-name truncate">
                  {splitFolder(file.path).name}
                </span>
                <span className="diff-stats">
                  <b>+{file.additions}</b>
                  <i>−{file.deletions}</i>
                </span>
              </button>
            </li>
          );
        }
        const open = filtering || !closedFolders.has(entry.path);
        const holdsCurrent = !open && entry.indexes.includes(current);
        return (
          <li key={entry.path}>
            <button
              type="button"
              className={`diff-folder ${holdsCurrent ? "holds-current" : ""}`}
              style={{ "--depth": depth } as CSSProperties}
              aria-expanded={open}
              title={entry.path}
              onClick={() => toggleFolder(entry.path)}
            >
              <span className={`tree-chevron ${open ? "open" : ""}`}>
                <Icon name="chevronRight" size={12} />
              </span>
              <span className="truncate">{entry.name}</span>
              {!open && (
                <span className="diff-folder-count">
                  {entry.indexes.length}
                </span>
              )}
            </button>
            {open && renderLevel(entry.entries, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  const copy = (value: string, done: string) =>
    void copyText(value)
      .then(() => notify(done))
      .catch(() => notify(t("Couldn't copy."), true));

  // Every file head carries the switch; it changes all files and keeps the clicked one in place.
  const switchLayout = (next: "side" | "inline", i: number) => {
    if (next === layout) return;
    const before = sectionOf(i)?.getBoundingClientRect().top;
    setLayout(next);
    setCurrent(i);
    requestAnimationFrame(() => {
      const after = sectionOf(i)?.getBoundingClientRect().top;
      if (before !== undefined && after !== undefined && mainRef.current)
        mainRef.current.scrollTop += after - before;
    });
  };
  const toggle = (i: number) =>
    setCollapsed((set) => {
      const next = new Set(set);
      if (!next.delete(i)) next.add(i);
      return next;
    });

  return (
    <div className="diff-screen" onKeyDown={onKeyDown}>
      <nav
        className="diff-files"
        aria-label={t("Changed files")}
        hidden={filesHidden}
      >
        <header className="diff-files-head">
          <div className="section-head">
            <h3>{t("Files")}</h3>
            <span className="section-count">{files.length}</span>
          </div>
          <label className="diff-filter">
            <Icon name="search" size={13} />
            <input
              type="text"
              value={filter}
              placeholder={t("Filter files")}
              aria-label={t("Filter files")}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
        </header>
        <div ref={treeRef} className="diff-tree scroll">
          {tree.length === 0 && (
            <p className="diff-tree-empty">
              {t("No files match “{0}”.", [filter.trim()])}
            </p>
          )}
          {renderLevel(tree, 0)}
        </div>
        <footer className="diff-files-foot">
          <kbd>⌥</kbd>
          <kbd>↑</kbd>
          <kbd>↓</kbd>
          <span>{t("switch files")}</span>
        </footer>
      </nav>
      <main
        ref={mainRef}
        className="diff-main scroll"
        tabIndex={-1}
        onScroll={onScroll}
      >
        <section className="diff-context">
          <div className="diff-context-top">
            <span className="diff-mark" aria-hidden="true" />
            <h1>{title}</h1>
            {commit && (
              <button
                type="button"
                className="button diff-hash"
                aria-label={t("Copy hash {0}", [commit.shortId])}
                onClick={() => copy(commit.id, t("Hash copied."))}
              >
                <Icon name="copy" size={12} />
                {commit.shortId}
              </button>
            )}
          </div>
          <div className="diff-meta">
            {commit && (
              <span>
                {commit.author}, {when(commit.date)}
              </span>
            )}
            {task && (
              <button
                type="button"
                className={`diff-task ${task.assignee}`}
                title={t("Open task")}
                onClick={() => onOpenTask(task)}
              >
                <Glyph who={task.assignee} profileId={task.agentProfileId} />
                <span className="truncate">{task.title}</span>
              </button>
            )}
            <span className="diff-totals">
              {files.length === 1
                ? t("1 file")
                : t("{0} files", [files.length])}
              <b>+{sum.additions}</b>
              <i>−{sum.deletions}</i>
              <DiffBlocks additions={sum.additions} deletions={sum.deletions} />
            </span>
          </div>
          {commit?.body.trim() && <CommitBody text={commit.body.trim()} />}
        </section>
        <div className="diff-sections">
          {files.length === 0 && (
            <div className="empty-state">{t("No changes available.")}</div>
          )}
          {files.map((file, i) => (
            <DiffFile
              key={file.path}
              file={file}
              index={i}
              layout={layout}
              collapsed={collapsed.has(i)}
              eager={i === current}
              root={mainRef}
              onToggle={() => toggle(i)}
              onLayout={(next) => switchLayout(next, i)}
              onCopy={() => copy(file.path, t("Path copied."))}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

/**
 * The commit message below the subject. A list of "- " lines shows as a list, the first item
 * until it is opened; other messages show their first three lines.
 */
function CommitBody({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const lines = text.split("\n").filter((line) => line.trim());
  const bullet = /^\s*[-*•]\s+/;
  const list = lines.every((line) => bullet.test(line));
  const shown = list ? 1 : 3;
  const long = lines.length > shown;
  return (
    <div className="diff-body">
      {list ? (
        <ul>
          {(open ? lines : lines.slice(0, shown)).map((line, i) => (
            <li key={i}>{line.replace(bullet, "")}</li>
          ))}
        </ul>
      ) : (
        <p>
          {open || !long ? text : text.split("\n").slice(0, shown).join("\n")}
        </p>
      )}
      {long && (
        <button
          type="button"
          className="diff-more"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? t("Show less") : t("Show full message")}
        </button>
      )}
    </div>
  );
}

type TreeFile = { file: FileDiff; index: number };
type TreeFolder = {
  name: string;
  path: string;
  entries: TreeEntry[];
  /** Every file below, for the count and the mark of a closed folder. */
  indexes: number[];
};
type TreeEntry = TreeFile | TreeFolder;

/**
 * The files as nested folders, in the order they come so the tree follows the scroll. A folder
 * holding only one folder joins it in one row, as `apps/server`.
 */
function buildTree(files: FileDiff[], query: string): TreeEntry[] {
  const root: TreeFolder = { name: "", path: "", entries: [], indexes: [] };
  files.forEach((file, index) => {
    if (query && !file.path.toLowerCase().includes(query)) return;
    const parts = file.path.split("/");
    let folder = root;
    for (const part of parts.slice(0, -1)) {
      const path = folder.path ? `${folder.path}/${part}` : part;
      let next = folder.entries.find(
        (e): e is TreeFolder => !("file" in e) && e.path === path,
      );
      if (!next) {
        next = { name: part, path, entries: [], indexes: [] };
        folder.entries.push(next);
      }
      next.indexes.push(index);
      folder = next;
    }
    folder.entries.push({ file, index });
  });
  const join = (entry: TreeEntry): TreeEntry => {
    if ("file" in entry) return entry;
    let folder = entry;
    while (folder.entries.length === 1 && !("file" in folder.entries[0])) {
      const only = folder.entries[0] as TreeFolder;
      folder = { ...only, name: `${folder.name}/${only.name}` };
    }
    return { ...folder, entries: folder.entries.map(join) };
  };
  return root.entries.map(join);
}
