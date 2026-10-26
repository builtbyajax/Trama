import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { usePopover } from "../../hooks/usePopover";
import type { MarkdownDocument } from "../../lib/markdown";
import { folderOf } from "../../lib/markdown";
import {
  ago,
  statusTitle,
  type DocumentFile,
  type Task,
  type TaskStatus,
} from "../../lib/types";
import { Glyph } from "../BoardFilters";
import { Icon } from "../Icon";
import { Markdown, type NoteContext } from "../Markdown";
import type { Rect } from "./textSearch";
import { locale, t } from "../../lib/i18n";

function Properties({ properties }: { properties: [string, string[]][] }) {
  const [open, setOpen] = useState(false);
  if (!properties.length) return null;
  return (
    <div className={`note-props ${open ? "open" : ""}`}>
      <button
        type="button"
        aria-expanded={open}
        className="note-props-head"
        onClick={() => setOpen(!open)}
      >
        <Icon name="chevronRight" size={12} />
        {t("Properties")}
        {!open && (
          <span className="note-props-summary">
            {properties.slice(0, 4).map(([key, values]) => (
              <span key={key} className="pill" title={key}>
                {values.join(", ") || key}
              </span>
            ))}
          </span>
        )}
      </button>
      {open && (
        <dl>
          {properties.map(([key, values]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>
                {values.length ? (
                  values.map((v, i) => (
                    <span key={i} className="pill">
                      {v}
                    </span>
                  ))
                ) : (
                  <span className="muted">{t("empty")}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Up to this many attached tasks show one by one; more fold into a single button. */
const inlineTasks = 2;
/** Work still moving first, then what waits, and the done tasks last. */
const statusRank: Record<TaskStatus, number> = {
  inProgress: 0,
  review: 1,
  todo: 2,
  backlog: 3,
  done: 4,
};
const byProgress = (a: Task, b: Task) =>
  statusRank[a.status] - statusRank[b.status] ||
  a.title.localeCompare(b.title, locale, { numeric: true });

/** The tasks of a note attached to many, behind one button that opens their list. */
function AttachedTasks({
  tasks,
  onOpenTask,
}: {
  tasks: Task[];
  onOpenTask: (task: Task) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const close = useCallback(() => setOpen(false), []);
  const { style, container } = usePopover(open, trigger, list, close, {
    minWidth: 440,
    maxHeight: 360,
  });
  const sorted = [...tasks].sort(byProgress);
  const done = tasks.filter((t) => t.status === "done").length;
  const label = t("{0} tasks", [tasks.length]);
  function pick(index: number) {
    setOpen(false);
    const task = sorted[index];
    if (task) onOpenTask(task);
  }
  function keyDown(event: KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        setActive(0);
        setOpen(true);
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (index + step + sorted.length) % sorted.length);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : sorted.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === "Tab") setOpen(false);
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`note-task ${open ? "active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-activedescendant={open ? `note-task-${active}` : undefined}
        data-tooltip={
          open ? undefined : t("{0} of {1} done", [done, tasks.length])
        }
        onClick={() => {
          trigger.current?.focus();
          setActive(0);
          setOpen((value) => !value);
        }}
        onKeyDown={keyDown}
      >
        <Icon name="clip" size={12} />
        {label}
      </button>
      {open &&
        container &&
        createPortal(
          <div
            ref={list}
            role="menu"
            aria-label={t("Tasks in this note, {0} of {1} done", [
              done,
              tasks.length,
            ])}
            className="popover-list menu-list note-task-list"
            style={style}
            onMouseDown={(event) => event.preventDefault()}
          >
            {sorted.map((task, index) => (
              <div
                key={task.id}
                id={`note-task-${index}`}
                role="menuitem"
                className={`popover-option ${index === active ? "active" : ""} ${task.status === "done" ? "done" : ""}`}
                onMouseMove={() => setActive(index)}
                onClick={() => pick(index)}
              >
                <Glyph who={task.assignee} />
                <span className="popover-label">{task.title}</span>
                <span className="note-task-status">
                  {statusTitle[task.status]}
                </span>
              </div>
            ))}
          </div>,
          container,
        )}
    </>
  );
}

/** A note read as a page: where it lives, the tasks it is attached to, its properties and text. */
export function NotePage({
  file,
  editing,
  doc,
  context,
  attachedTo,
  onOpenTask,
  onEdit,
}: {
  file: DocumentFile;
  editing: boolean;
  doc: MarkdownDocument;
  context: NoteContext;
  attachedTo: Task[];
  onOpenTask: (task: Task) => void;
  onEdit: () => void;
}) {
  return (
    <article className="note-page">
      {!editing && (
        <div className="note-where">
          {folderOf(file.path) && (
            <span className="note-where-path">
              <Icon name="folder" size={12} />
              {folderOf(file.path).split("/").join(" / ")}
            </span>
          )}
          <span>
            {t("Edited")} {ago(file.modified)}
          </span>
          {attachedTo.length > inlineTasks ? (
            <AttachedTasks tasks={attachedTo} onOpenTask={onOpenTask} />
          ) : (
            attachedTo.map((task) => (
              <button
                key={task.id}
                type="button"
                className="note-task"
                data-tooltip={t("Open the task")}
                onClick={() => onOpenTask(task)}
              >
                <Icon name="clip" size={12} />
                <Glyph who={task.assignee} />
                <span className="truncate">{task.title}</span>
              </button>
            ))
          )}
        </div>
      )}
      <Properties key={file.path} properties={doc.properties} />
      <Markdown doc={doc} context={context} />
      {!doc.blocks.length && (
        <p className="note-empty">
          {t("Empty note.")}{" "}
          <button type="button" className="link-button" onClick={onEdit}>
            {t("Write")}
          </button>
        </p>
      )}
    </article>
  );
}

/** The scrolling box that holds the page, or what stands in for it; the search flash draws on it. */
export function NoteReader({
  reader,
  flash,
  fileError,
  path,
  onScroll,
  onDoubleClick,
  onFlashEnd,
  children,
}: {
  reader: RefObject<HTMLDivElement | null>;
  flash: { at: number; rects: Rect[] } | null;
  fileError: string;
  path: string | null;
  onScroll?: () => void;
  onDoubleClick: (target: HTMLElement) => void;
  onFlashEnd: () => void;
  children: ReactNode;
}) {
  return (
    <div
      ref={reader}
      className="note-reader scroll"
      onScroll={onScroll}
      onDoubleClick={(event) => onDoubleClick(event.target as HTMLElement)}
    >
      {flash && (
        <div
          key={flash.at}
          className="find-flash"
          aria-hidden="true"
          onAnimationEnd={onFlashEnd}
        >
          {flash.rects.map((r, i) => (
            <span key={i} style={r} />
          ))}
        </div>
      )}
      {fileError ? (
        <div className="empty-state">
          <Icon name="warning" size={22} />
          <strong>{t("The note didn't open")}</strong>
          <p>{fileError}</p>
        </div>
      ) : !path ? (
        <div className="empty-state">
          <Icon name="notes" size={22} />
          <strong>{t("No note open")}</strong>
          <p>{t("Choose a note from the list or create a new one.")}</p>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
