import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { searchKey, usePopover } from "../../hooks/usePopover";
import {
  attachDocument,
  detachDocument,
  errorMessage,
  listDocuments,
  readDocument,
} from "../../lib/api";
import { noteName, parseMarkdown } from "../../lib/markdown";
import {
  ago,
  dateTime,
  type DocumentListing,
  type Project,
  type Task,
  type TaskDocument,
} from "../../lib/types";
import { Glyph } from "../BoardFilters";
import { Icon } from "../Icon";
import { Markdown } from "../Markdown";
import { Modal } from "../Modal";
import { locale, t } from "../../lib/i18n";

/**
 * Notes attached to a task, by the agent (through MCP) or by the person. Each one opens for a
 * quick read over the task, or in the Notes tab to edit.
 */
export function TaskDocuments({
  task,
  project,
  documents,
  onChanged,
  onOpenNote,
}: {
  task: Task;
  project?: Project;
  documents: TaskDocument[];
  onChanged: () => void;
  onOpenNote: (path: string) => void;
}) {
  const [viewing, setViewing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [listing, setListing] = useState<DocumentListing | null>(null);
  const [picking, setPicking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const root = project?.documentsFolder ?? null;
  useEffect(() => {
    if (!root || (!picking && !viewing)) return;
    let active = true;
    listDocuments(task.projectId).then(
      (l) => active && setListing(l),
      (e) => active && setError(errorMessage(e)),
    );
    return () => {
      active = false;
    };
  }, [root, task.projectId, picking, viewing]);
  return (
    <section className="task-docs" aria-labelledby="task-docs-title">
      <header className="briefing-head">
        <h2 id="task-docs-title" className="caps">
          {t("Attached notes")}
        </h2>
        {documents.length > 0 && (
          <span className="briefing-note">{documents.length}</span>
        )}
        {root && (
          <span className="briefing-actions">
            <button
              ref={trigger}
              type="button"
              className="link-button muted"
              aria-haspopup="listbox"
              aria-expanded={picking}
              onClick={() => setPicking((v) => !v)}
            >
              <Icon name="plus" size={12} />
              {t("Attach note")}
            </button>
          </span>
        )}
      </header>
      {documents.length === 0 ? (
        <p className="briefing-empty">
          {root
            ? t(
                "No notes. The agent attaches plans and reports through MCP, or you attach a note from the folder here.",
              )
            : t(
                "Choose the project's notes folder in the Notes tab to attach notes.",
              )}
        </p>
      ) : (
        <ul className="doc-list">
          {documents.map((d) => (
            <li key={d.path} className={`doc ${d.actor}`}>
              <div className="doc-row">
                <span className="doc-text">
                  <span className="doc-name truncate">{noteName(d.path)}</span>
                  <span className="doc-path truncate">{d.path}</span>
                </span>
                <span className="doc-by" title={dateTime(d.createdAt)}>
                  <Glyph who={d.actor} />
                  {d.actor === "agent" ? t("Agent") : t("You")},{" "}
                  {ago(d.createdAt)}
                </span>
                <button
                  type="button"
                  className="icon-button small"
                  aria-label={t("View {0}", [noteName(d.path)])}
                  data-tooltip={t("View the note")}
                  disabled={!root}
                  onClick={() => setViewing(d.path)}
                >
                  <Icon name="eye" size={14} />
                </button>
                <button
                  type="button"
                  className="icon-button small"
                  aria-label={t("Open {0} in Notes", [noteName(d.path)])}
                  data-tooltip={t("Open in Notes to edit")}
                  disabled={!root}
                  onClick={() => onOpenNote(d.path)}
                >
                  <Icon name="expand" size={13} />
                </button>
                <button
                  type="button"
                  className="icon-button small danger-hover"
                  aria-label={t("Remove the attachment {0}", [
                    noteName(d.path),
                  ])}
                  data-tooltip={t("Remove attachment (the file stays)")}
                  data-tooltip-align="end"
                  onClick={() =>
                    void detachDocument(task, d.path).then(
                      () => onChanged(),
                      (e) => setError(errorMessage(e)),
                    )
                  }
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {viewing && (
        <Modal
          title={noteName(viewing)}
          className="doc-viewer"
          onClose={() => setViewing(null)}
        >
          <Peek
            projectId={task.projectId}
            path={viewing}
            listing={listing}
            onOpenNote={(path) => {
              setViewing(null);
              onOpenNote(path);
            }}
          />
          <footer className="doc-viewer-foot">
            <span className="doc-path truncate">{viewing}</span>
            <button
              type="button"
              className="button"
              onClick={() => {
                const path = viewing;
                setViewing(null);
                onOpenNote(path);
              }}
            >
              <Icon name="expand" size={13} />
              {t("Open in Notes")}
            </button>
          </footer>
        </Modal>
      )}
      {picking && (
        <Picker
          trigger={trigger}
          listing={listing}
          taken={documents.map((d) => d.path)}
          onClose={() => setPicking(false)}
          onPick={(path) => {
            setPicking(false);
            void attachDocument(task, path).then(
              () => {
                setError("");
                onChanged();
              },
              (e) => setError(errorMessage(e)),
            );
          }}
        />
      )}
    </section>
  );
}

function Peek({
  projectId,
  path,
  listing,
  onOpenNote,
}: {
  projectId: string;
  path: string;
  listing: DocumentListing | null;
  onOpenNote: (path: string) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    readDocument(projectId, path).then(
      (file) => active && setText(file.text),
      (e) => active && setError(errorMessage(e)),
    );
    return () => {
      active = false;
    };
  }, [projectId, path]);
  const doc = useMemo(
    () => (text === null ? null : parseMarkdown(text)),
    [text],
  );
  if (error) return <p className="doc-peek form-error">{error}</p>;
  if (!doc) return <p className="doc-peek muted">{t("Reading…")}</p>;
  return (
    <div className="doc-peek scroll">
      <Markdown
        doc={doc}
        context={{
          projectId,
          path,
          notes: listing?.notes ?? [],
          images: listing?.images ?? [],
          onOpenNote: (target) => onOpenNote(target),
        }}
      />
    </div>
  );
}

function Picker({
  trigger,
  listing,
  taken,
  onClose,
  onPick,
}: {
  trigger: RefObject<HTMLButtonElement | null>;
  listing: DocumentListing | null;
  taken: string[];
  onClose: () => void;
  onPick: (path: string) => void;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // The button sits at the sheet's right edge, so the list opens towards the left, inside it.
  const { style, container } = usePopover(true, trigger, popup, onClose, {
    minWidth: 320,
    align: "end",
  });
  const key = searchKey(query);
  // The project's own notes come first.
  const options = (listing?.notes ?? [])
    .filter((n) => !taken.includes(n))
    .filter((n) => !key || searchKey(noteName(n)).includes(key))
    .sort((a, b) => a.localeCompare(b, locale))
    .slice(0, 200);
  useEffect(() => {
    popup.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => Math.max(0, Math.min(options.length - 1, i + step)));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (options[active]) onPick(options[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      trigger.current?.focus();
    }
  }
  if (!container) return null;
  return createPortal(
    <div ref={popup} className="popover-list doc-picker" style={style}>
      <input
        autoFocus
        role="combobox"
        aria-label={t("Search notes by name")}
        aria-expanded
        aria-controls="doc-picker-list"
        autoComplete="off"
        spellCheck={false}
        placeholder={t("Search notes by name…")}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={keyDown}
      />
      <div
        id="doc-picker-list"
        role="listbox"
        aria-label={t("Notes")}
        className="scroll"
        onMouseDown={(event) => event.preventDefault()}
      >
        {options.map((n, i) => (
          <div
            key={n}
            role="option"
            aria-selected={i === active}
            data-index={i}
            className={`popover-option doc-option ${i === active ? "active" : ""}`}
            onMouseMove={() => setActive(i)}
            onClick={() => onPick(n)}
          >
            <Icon name="file" size={13} />
            <span className="doc-text">
              <span className="truncate">{noteName(n)}</span>
              <span className="doc-path truncate">{n}</span>
            </span>
          </div>
        ))}
        {!listing ? (
          <p className="popover-empty">{t("Reading the notes folder…")}</p>
        ) : (
          options.length === 0 && (
            <p className="popover-empty">
              {key ? t("No notes with that name.") : t("No notes to attach.")}
            </p>
          )
        )}
      </div>
    </div>,
    container,
  );
}
