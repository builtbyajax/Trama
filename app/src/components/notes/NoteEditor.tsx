import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import type { DocumentFile } from "../../lib/types";
import { NoteTools } from "./NoteTools";
import { store } from "../../lib/storage";
import { dualKey, followKey } from "./noteStorage";
import type { SaveState } from "./useNoteFile";
import { t } from "../../lib/i18n";
import { Segmented } from "../Segmented";

/** Where each line of a textarea starts, wrapping included: a hidden copy with the same
 * width and type lays the lines out one per element. */
function measureLines(box: HTMLTextAreaElement): number[] {
  const style = getComputedStyle(box);
  const mirror = document.createElement("div");
  for (const prop of [
    "font",
    "letterSpacing",
    "lineHeight",
    "tabSize",
    "paddingTop",
    "paddingLeft",
    "paddingRight",
    "boxSizing",
  ] as const)
    mirror.style[prop] = style[prop];
  Object.assign(mirror.style, {
    position: "absolute",
    visibility: "hidden",
    top: "0",
    left: "-9999px",
    width: `${box.clientWidth}px`,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
  });
  const lines = box.value.split("\n");
  for (const line of lines) {
    const row = document.createElement("div");
    row.textContent = line || "\u200b";
    mirror.appendChild(row);
  }
  document.body.appendChild(mirror);
  const tops = [...mirror.children].map(
    (row) => (row as HTMLElement).offsetTop,
  );
  mirror.remove();
  return tops;
}

/**
 * While editing side by side, the reader follows the editor's scroll and the other way round.
 * `area` is the editor's textarea.
 */
export function useEditorSync({
  reader,
  follow,
  editing,
  text,
}: {
  reader: RefObject<HTMLDivElement | null>;
  follow: boolean;
  editing: boolean;
  text: string;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const editorLines = useRef<{ key: string; tops: number[] }>({
    key: "",
    tops: [],
  });
  /** Top of each source line inside the editor, measured once per text and width. */
  const lineTops = (box: HTMLTextAreaElement) => {
    const key = `${box.clientWidth}|${box.value}`;
    if (editorLines.current.key !== key)
      editorLines.current = { key, tops: measureLines(box) };
    return editorLines.current.tops;
  };
  // The pane being scrolled by hand leads; the scroll it causes in the other one is not followed
  // back for a moment, or the two would keep nudging each other.
  const leader = useRef<{ side: "editor" | "reader"; until: number }>({
    side: "editor",
    until: 0,
  });
  /** Scrolls one pane so the block at the top of the other sits at its top too. Blocks are
   * matched by the line they start on, so images and tables never pull the two apart. */
  const sync = useCallback(
    (from: "editor" | "reader") => {
      const box = area.current;
      const view = reader.current;
      if (!follow || !box || !view || !view.clientHeight) return;
      const now = performance.now();
      if (leader.current.side !== from && now < leader.current.until) return;
      leader.current = { side: from, until: now + 120 };
      const tops = lineTops(box);
      const base = view.getBoundingClientRect().top - view.scrollTop;
      const points = [{ e: 0, r: 0 }];
      for (const el of view.querySelectorAll<HTMLElement>("[data-line]")) {
        const e = tops[Number(el.dataset.line)];
        const r = el.getBoundingClientRect().top - base - 24;
        const last = points[points.length - 1];
        if (e === undefined || e - 24 <= last.e || r <= last.r) continue;
        points.push({ e: e - 24, r });
      }
      const endE = box.scrollHeight - box.clientHeight;
      const endR = view.scrollHeight - view.clientHeight;
      const last = points[points.length - 1];
      if (endE > last.e && endR > last.r) points.push({ e: endE, r: endR });
      const [src, dst] =
        from === "editor" ? (["e", "r"] as const) : (["r", "e"] as const);
      const target = from === "editor" ? view : box;
      const at = (from === "editor" ? box : view).scrollTop;
      if (at >= (from === "editor" ? endE : endR) - 1) {
        target.scrollTop = from === "editor" ? endR : endE;
        return;
      }
      let i = 0;
      while (i < points.length - 2 && points[i + 1][src] <= at) i++;
      const a = points[i];
      const b = points[i + 1] ?? a;
      const part =
        b[src] > a[src]
          ? Math.min(1, Math.max(0, (at - a[src]) / (b[src] - a[src])))
          : 0;
      target.scrollTop = a[dst] + part * (b[dst] - a[dst]);
    },
    [follow],
  );
  const followEditor = useCallback(() => sync("editor"), [sync]);
  useEffect(() => {
    if (!editing) return;
    const frame = requestAnimationFrame(followEditor);
    return () => cancelAnimationFrame(frame);
  }, [editing, text, followEditor]);
  /** A double click in the reader puts the editor's cursor at the start of that block. */
  const jumpToSource = (target: HTMLElement) => {
    const box = area.current;
    const line = Number(
      target.closest<HTMLElement>("[data-line]")?.dataset.line ?? NaN,
    );
    if (!box || Number.isNaN(line)) return;
    const start =
      text.split("\n").slice(0, line).join("\n").length + (line ? 1 : 0);
    window.getSelection()?.removeAllRanges();
    box.focus({ preventScroll: true });
    box.setSelectionRange(start, start);
    box.scrollTop = Math.max(
      0,
      (lineTops(box)[line] ?? 0) - box.clientHeight / 3,
    );
  };

  return { area, sync, followEditor, jumpToSource };
}

/** ⌘E switches between reading and editing; esc leaves the editor from anywhere on it. */
export function useEditShortcuts(
  latest: RefObject<{ file: DocumentFile | null }>,
  editingRef: RefObject<boolean>,
  setEditing: Dispatch<SetStateAction<boolean>>,
) {
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || !latest.current.file) return;
      const mod = event.metaKey || event.ctrlKey;
      if (
        mod &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "e"
      ) {
        event.preventDefault();
        setEditing((v) => !v);
      } else if (
        event.key === "Escape" &&
        editingRef.current &&
        // A menu or list open over the editor closes first.
        !(event.target as Element).closest?.(
          "[role=menu], dialog, .popover-list, [aria-expanded=true]",
        )
      ) {
        event.preventDefault();
        setEditing(false);
      }
    };
    // Captured, so it runs before the window's own shortcuts take esc.
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
}

/** Warns that the note changed outside the app or could not be saved, with the way out. */
export function NoteAlert({
  save,
  saveError,
  onRetry,
  onDiscard,
  onKeep,
}: {
  save: SaveState;
  saveError: string;
  onRetry: () => void;
  onDiscard: () => void;
  onKeep: () => void;
}) {
  if (save !== "conflict" && save !== "error") return null;
  return (
    <div className="note-alert" role="alert">
      <span>
        {save === "conflict"
          ? t("This note was changed outside Trama while you were editing.")
          : t("Couldn't save: {0}", [saveError])}
      </span>
      {save === "error" && (
        <button className="button small" onClick={onRetry}>
          {t("Try again")}
        </button>
      )}
      <button className="button small" onClick={onDiscard}>
        {t("Discard and reload")}
      </button>
      {save === "conflict" && (
        <button className="button small" onClick={onKeep}>
          {t("Keep my text")}
        </button>
      )}
    </div>
  );
}

/** The editor: the formatting bar and the Markdown, with the page beside it when `dual`. */
export function NoteEditor({
  area,
  notes,
  path,
  text,
  dual,
  follow,
  onDual,
  onFollow,
  onChange,
  onFlush,
  onDone,
  onScroll,
  children,
}: {
  area: RefObject<HTMLTextAreaElement | null>;
  notes: string[];
  path: string;
  text: string;
  dual: boolean;
  follow: boolean;
  onDual: (dual: boolean) => void;
  onFollow: (follow: boolean) => void;
  onChange: (text: string) => void;
  onFlush: () => void;
  onDone: () => void;
  onScroll: () => void;
  /** The page shown beside the text. */
  children: ReactNode;
}) {
  function editorKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && !event.shiftKey && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === "s") onFlush();
      else if (key === "e") onDone();
      else return;
      event.preventDefault();
      event.stopPropagation();
    } else if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      document.execCommand("insertText", false, "  ");
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onDone();
    }
  }

  return (
    <div className="note-edit">
      <div className="note-tools" role="toolbar" aria-label={t("Formatting")}>
        <NoteTools area={area} notes={notes} path={path} />
        <span className="note-tools-space" />
        {dual && (
          <button
            type="button"
            className={`note-follow ${follow ? "on" : ""}`}
            aria-pressed={follow}
            data-tooltip={
              follow
                ? t(
                    "The text and the page scroll together. Double-click part of the page to jump to it in the text.",
                  )
                : t("Each side scrolls on its own")
            }
            data-tooltip-align="end"
            onClick={() => {
              const next = !follow;
              onFollow(next);
              store(followKey, next ? "on" : "off");
            }}
          >
            {t("Scroll together")}
          </button>
        )}
        <Segmented
          size="small"
          className="note-view"
          label={t("View")}
          options={[
            { value: false, label: t("Text only") },
            { value: true, label: t("Side by side") },
          ]}
          value={dual}
          onChange={(value) => {
            onDual(value);
            store(dualKey, value ? "on" : "off");
          }}
        />
        <button
          type="button"
          className="button small primary note-done"
          onClick={onDone}
        >
          {t("Complete")}
          <kbd className="button-kbd">{t("esc")}</kbd>
        </button>
      </div>
      <div className={`note-edit-body ${dual ? "dual" : ""}`}>
        <textarea
          ref={area}
          className="note-input scroll"
          aria-label={t("Note text in Markdown")}
          spellCheck
          autoFocus
          value={text}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={editorKey}
          onScroll={onScroll}
          onBlur={onFlush}
        />
        {dual && children}
      </div>
    </div>
  );
}
