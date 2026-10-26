import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { searchKey, usePopover } from "../../hooks/usePopover";
import { noteName } from "../../lib/markdown";
import { Icon, type IconName } from "../Icon";
import { resolveNote } from "../Markdown";
import { locale, t } from "../../lib/i18n";

/** What a line of Markdown is, as far as the toolbar can change it. */
export type Block =
  | "text"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "quote"
  | "list"
  | "numbered"
  | "todo";

const listKinds = new Set<Block>(["list", "numbered", "todo"]);

/** The block a line is, its indent and how long its mark is ("## ", "- [ ] ", "> "…). */
function parseLine(line: string): {
  kind: Block;
  indent: string;
  mark: number;
} {
  let m = /^(#{1,6})\s+/.exec(line);
  if (m)
    return { kind: `h${m[1].length}` as Block, indent: "", mark: m[0].length };
  m = /^>\s?/.exec(line);
  if (m) return { kind: "quote", indent: "", mark: m[0].length };
  m = /^(\s*)[-*+] \[[ xX]\]\s+/.exec(line);
  if (m) return { kind: "todo", indent: m[1], mark: m[0].length };
  m = /^(\s*)[-*+]\s+/.exec(line);
  if (m) return { kind: "list", indent: m[1], mark: m[0].length };
  m = /^(\s*)\d+[.)]\s+/.exec(line);
  if (m) return { kind: "numbered", indent: m[1], mark: m[0].length };
  return { kind: "text", indent: /^\s*/.exec(line)![0], mark: 0 };
}

function markOf(kind: Block, number: number) {
  if (kind === "text") return "";
  if (kind === "quote") return "> ";
  if (kind === "list") return "- ";
  if (kind === "todo") return "- [ ] ";
  if (kind === "numbered") return `${number}. `;
  return "#".repeat(Number(kind[1])) + " ";
}

/** The lines the selection touches; a selection ending at a line start leaves that line out. */
function linesOf(el: HTMLTextAreaElement) {
  const { value, selectionStart, selectionEnd } = el;
  const end =
    selectionEnd > selectionStart && value[selectionEnd - 1] === "\n"
      ? selectionEnd - 1
      : selectionEnd;
  const from = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const next = value.indexOf("\n", end);
  return { from, to: next === -1 ? value.length : next };
}

/** The block of the line under the caret. */
function blockAt(el: HTMLTextAreaElement): Block {
  const from = el.value.lastIndexOf("\n", el.selectionStart - 1) + 1;
  const end = el.value.indexOf("\n", from);
  return parseLine(el.value.slice(from, end === -1 ? undefined : end)).kind;
}

/**
 * Turns the selected lines into `kind`, or back into plain text when they all already are one.
 * The old mark is swapped, never stacked: a list item made a to-do loses its "- " first. Goes
 * through `insertText` so the text area keeps its own undo.
 */
export function setBlock(el: HTMLTextAreaElement, kind: Block) {
  el.focus();
  const { from, to } = linesOf(el);
  const { value, selectionStart, selectionEnd } = el;
  const lines = value.slice(from, to).split("\n");
  const parsed = lines.map(parseLine);
  const filled = parsed.filter((_, i) => lines.length === 1 || lines[i].trim());
  const target =
    kind !== "text" && filled.every((p) => p.kind === kind) ? "text" : kind;
  // A new numbered item carries on from the item above it.
  const above = value.slice(
    value.lastIndexOf("\n", from - 2) + 1,
    Math.max(0, from - 1),
  );
  let number =
    from > 0 ? (Number(/^\s*(\d+)[.)]\s/.exec(above)?.[1]) || 0) + 1 : 1;
  const next = lines.map((line, i) => {
    const p = parsed[i];
    if (lines.length > 1 && !line.trim()) return line;
    const rest = line.slice(p.mark || p.indent.length);
    const indent = listKinds.has(target) ? p.indent : "";
    return indent + markOf(target, number++) + rest;
  });
  const text = next.join("\n");
  if (text === value.slice(from, to)) return;
  el.setSelectionRange(from, to);
  document.execCommand("insertText", false, text);
  if (lines.length === 1) {
    // Keep the caret on the same words, after the new mark.
    const before = parsed[0].mark || parsed[0].indent.length;
    const after = text.length - (lines[0].length - before);
    const place = (at: number) =>
      from + Math.max(after, at - from - before + after);
    el.setSelectionRange(place(selectionStart), place(selectionEnd));
  } else el.setSelectionRange(from, from + text.length);
}

/**
 * Wraps the selection in `before`/`after`, or unwraps it when it already sits between them. With
 * nothing selected it writes `fallback` and selects it, ready to be typed over.
 */
export function wrap(
  el: HTMLTextAreaElement,
  before: string,
  after = before,
  fallback = "texto",
) {
  el.focus();
  const { value, selectionStart: start, selectionEnd: end } = el;
  const selected = value.slice(start, end);
  const outer =
    value.slice(start - before.length, start) === before &&
    value.slice(end, end + after.length) === after &&
    // Italic's "*" is not the inner half of a bold "**".
    !(before === "*" && value[start - 2] === "*" && value[start - 3] !== "*");
  if (outer && selected) {
    el.setSelectionRange(start - before.length, end + after.length);
    document.execCommand("insertText", false, selected);
    el.setSelectionRange(start - before.length, end - before.length);
    return;
  }
  const inner =
    selected.length >= before.length + after.length &&
    selected.startsWith(before) &&
    selected.endsWith(after);
  if (inner) {
    const bare = selected.slice(before.length, selected.length - after.length);
    document.execCommand("insertText", false, bare);
    el.setSelectionRange(start, start + bare.length);
    return;
  }
  const body = selected || fallback;
  document.execCommand("insertText", false, before + body + after);
  el.setSelectionRange(
    start + before.length,
    start + before.length + body.length,
  );
}

// Toolbar buttons leave the focus, and the selection, in the text.
const keepFocus = (event: MouseEvent) => event.preventDefault();

/**
 * Formatting for the note editor: marks for the words (bold, italic, code), the kind of line
 * (heading level, quote, the three lists) and a link to another note of the vault. Line buttons
 * light up for the line under the caret and turn it back into text when pressed again.
 */
export function NoteTools({
  area,
  notes,
  path,
}: {
  area: RefObject<HTMLTextAreaElement | null>;
  /** Every note of the vault, by path. */
  notes: string[];
  /** The note being edited. */
  path: string;
}) {
  const [block, setBlockState] = useState<Block>("text");
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const read = () => setBlockState(blockAt(el));
    read();
    const events = ["keyup", "mouseup", "input", "focus", "select"] as const;
    events.forEach((name) => el.addEventListener(name, read));
    return () => events.forEach((name) => el.removeEventListener(name, read));
  }, [area]);

  function apply(kind: Block) {
    if (!area.current) return;
    setBlock(area.current, kind);
    setBlockState(blockAt(area.current));
  }
  const inline = (before: string, label: string, icon: IconName) => (
    <button
      type="button"
      aria-label={label}
      data-tooltip={label}
      onMouseDown={keepFocus}
      onClick={() => area.current && wrap(area.current, before)}
    >
      <Icon name={icon} size={15} />
    </button>
  );
  const line = (kind: Block, label: string, icon: IconName) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={block === kind}
      className={block === kind ? "on" : ""}
      data-tooltip={label}
      onMouseDown={keepFocus}
      onClick={() => apply(kind)}
    >
      <Icon name={icon} size={15} />
    </button>
  );
  return (
    <>
      {inline("**", t("Bold"), "bold")}
      {inline("*", t("Italic"), "italic")}
      {inline("`", t("Code"), "code")}
      <span className="note-tools-rule" aria-hidden="true" />
      <HeadingMenu block={block} onChoose={apply} area={area} />
      {line("quote", t("Quote"), "quote")}
      <span className="note-tools-rule" aria-hidden="true" />
      {line("list", t("List"), "list")}
      {line("numbered", t("Numbered list"), "listNumbered")}
      {line("todo", t("Checklist"), "todo")}
      <span className="note-tools-rule" aria-hidden="true" />
      <NoteLinkMenu area={area} notes={notes} path={path} />
    </>
  );
}

const headings: { kind: Block; label: string }[] = [
  { kind: "text", label: t("Text") },
  { kind: "h1", label: t("Heading 1") },
  { kind: "h2", label: t("Heading 2") },
  { kind: "h3", label: t("Heading 3") },
];

/** The heading level of the line, as a small menu that also turns it back into text. */
function HeadingMenu({
  block,
  onChoose,
  area,
}: {
  block: Block;
  onChoose: (kind: Block) => void;
  area: RefObject<HTMLTextAreaElement | null>;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const close = useCallback(() => setOpen(false), []);
  const { style, container } = usePopover(open, trigger, popup, close, {
    minWidth: 150,
  });
  const level = block[0] === "h" ? Number(block[1]) : 0;
  const current = Math.max(
    0,
    headings.findIndex((h) => h.kind === block),
  );
  function choose(index: number) {
    setOpen(false);
    // Choosing the level the line already has leaves it as it is.
    if (headings[index].kind !== block) onChoose(headings[index].kind);
  }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive(current);
        setOpen(true);
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => Math.max(0, Math.min(headings.length - 1, i + step)));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(active);
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
        className={`note-heading ${level ? "on" : ""}`}
        aria-label={level ? t("Heading {0}", [level]) : t("Heading")}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-tooltip={open ? undefined : t("Heading")}
        onMouseDown={keepFocus}
        onKeyDown={keyDown}
        onClick={() => {
          if (open) return setOpen(false);
          setActive(current);
          setOpen(true);
        }}
      >
        <Icon name="heading" size={15} />
        {level > 0 && <span className="note-heading-level">{level}</span>}
        <Icon name="chevronDown" size={10} />
      </button>
      {open &&
        container &&
        createPortal(
          <div
            ref={popup}
            role="listbox"
            aria-label={t("Line type")}
            className="popover-list note-heading-menu"
            style={style}
            onMouseDown={keepFocus}
          >
            {headings.map((h, index) => (
              <div
                key={h.kind}
                role="option"
                aria-selected={h.kind === block}
                className={`popover-option ${h.kind} ${index === active ? "active" : ""}`}
                onMouseMove={() => setActive(index)}
                onClick={() => {
                  choose(index);
                  area.current?.focus();
                }}
              >
                <span className="popover-label">{h.label}</span>
                {h.kind === block && <Icon name="check" size={13} />}
              </div>
            ))}
          </div>,
          container,
        )}
    </>
  );
}

/**
 * A link to another note: a search over the vault's notes that writes `[[Name]]` where the
 * caret is. Selected words become the link's label and start the search. A name no note has
 * still makes a link, the way Obsidian leaves one for a note to be written later.
 */
function NoteLinkMenu({
  area,
  notes,
  path,
}: {
  area: RefObject<HTMLTextAreaElement | null>;
  notes: string[];
  path: string;
}) {
  const listId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const range = useRef<[number, number]>([0, 0]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState("");
  const [active, setActive] = useState(0);
  const close = useCallback(() => setOpen(false), []);
  const { style, container } = usePopover(open, trigger, popup, close, {
    minWidth: 300,
    maxHeight: 340,
  });
  const key = searchKey(query.trim());
  const found = notes
    .filter((n) => n !== path && searchKey(noteName(n)).includes(key))
    .sort(
      (a, b) =>
        Number(!searchKey(noteName(a)).startsWith(key)) -
          Number(!searchKey(noteName(b)).startsWith(key)) ||
        noteName(a).localeCompare(noteName(b), locale),
    )
    .slice(0, 60);
  const exact = found.some((n) => searchKey(noteName(n)) === key);
  // The last row writes the typed name as is, for a note that does not exist yet.
  const options: (string | null)[] = [
    ...found,
    ...(key && !exact ? [null] : []),
  ];
  useEffect(() => {
    if (open)
      popup.current
        ?.querySelector(`[data-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function show() {
    const el = area.current;
    if (!el) return;
    range.current = [el.selectionStart, el.selectionEnd];
    const selected = el.value.slice(el.selectionStart, el.selectionEnd);
    const words = selected.includes("\n") ? "" : selected.trim();
    setLabel(words);
    setQuery(words);
    setActive(0);
    setOpen(true);
  }
  function back() {
    const el = area.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(...range.current);
  }
  function choose(index: number) {
    if (index >= options.length) return;
    const option = options[index];
    const name = option ? noteName(option) : query.trim();
    // A bare name when it leads to this note, the path when another note shares the name.
    const target =
      option && resolveNote(name, path, notes) !== option
        ? option.replace(/\.(md|markdown)$/i, "")
        : name;
    setOpen(false);
    back();
    const shown =
      label && searchKey(label) !== searchKey(target) ? `|${label}` : "";
    document.execCommand("insertText", false, `[[${target}${shown}]]`);
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => Math.max(0, Math.min(options.length - 1, i + step)));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      back();
    } else if (event.key === "Tab") setOpen(false);
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={open ? "on" : ""}
        aria-label={t("Link to another note")}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-tooltip={open ? undefined : t("Link to another note")}
        onMouseDown={keepFocus}
        onClick={() => (open ? setOpen(false) : show())}
      >
        <Icon name="noteLink" size={15} />
      </button>
      {open &&
        container &&
        createPortal(
          <div
            ref={popup}
            className="popover-list category-menu note-link-menu"
            style={style}
          >
            <input
              autoFocus
              role="combobox"
              aria-label={t("Find in note")}
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={
                active < options.length ? `${listId}-o${active}` : undefined
              }
              autoComplete="off"
              spellCheck={false}
              placeholder={t("Search notes…")}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={keyDown}
            />
            <div
              id={listId}
              role="listbox"
              aria-label={t("Notes")}
              className="scroll"
              onMouseDown={keepFocus}
            >
              {options.map((option, index) => {
                const folder = option?.includes("/")
                  ? option.slice(0, option.lastIndexOf("/"))
                  : "";
                return (
                  <div
                    key={option ?? "\0new"}
                    id={`${listId}-o${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={index === active}
                    className={`popover-option ${index === active ? "active" : ""}`}
                    onMouseMove={() => setActive(index)}
                    onClick={() => choose(index)}
                  >
                    {option ? (
                      <>
                        <span className="popover-label">
                          {noteName(option)}
                        </span>
                        {folder && (
                          <span className="note-link-folder">{folder}</span>
                        )}
                      </>
                    ) : (
                      <span className="popover-label">
                        {t("Link to “")}
                        {query.trim()}”
                        <span className="note-link-folder">
                          {t("note doesn't exist yet")}
                        </span>
                      </span>
                    )}
                  </div>
                );
              })}
              {options.length === 0 && (
                <p className="popover-empty">
                  {t(
                    "No other notes in this vault. Type a name to create the link.",
                  )}
                </p>
              )}
            </div>
          </div>,
          container,
        )}
    </>
  );
}
