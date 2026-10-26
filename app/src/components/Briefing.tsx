import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { searchKey } from "../hooks/usePopover";
import { openUrl } from "../lib/api";
import {
  block,
  parseBriefing,
  segments,
  serializeBriefing,
  type Block,
  type BlockType,
} from "../lib/briefing";
import { AutoTextarea } from "./AutoTextarea";
import { Icon } from "./Icon";
import { t } from "../lib/i18n";

/** Inline Markdown of one line: bold, code and links (opened outside the app). */
export function Inline({
  text,
  links = true,
}: {
  text: string;
  links?: boolean;
}) {
  return (
    <>
      {segments(text).map((s, i) =>
        s.kind === "bold" ? (
          <strong key={i}>{s.text}</strong>
        ) : s.kind === "code" ? (
          <code key={i} className="inline-code">
            {s.text}
          </code>
        ) : s.kind === "link" && links ? (
          <a
            key={i}
            href={s.href}
            onClick={(event) => {
              event.preventDefault();
              void openUrl(s.href).catch(() => undefined);
            }}
          >
            {s.text}
          </a>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function Marker({
  block: b,
  onToggle,
}: {
  block: Block;
  onToggle?: () => void;
}) {
  if (b.type === "li")
    return <span className="blk-bullet" aria-hidden="true" />;
  if (b.type === "quote")
    return <span className="blk-bar" aria-hidden="true" />;
  if (b.type !== "todo") return null;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={Boolean(b.done)}
      aria-label={b.text || t("Empty item")}
      className={`blk-check ${b.done ? "on" : ""}`}
      disabled={!onToggle}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
    >
      {b.done && <Icon name="check" size={11} />}
    </button>
  );
}

const blockClass = (b: Block) =>
  `blk blk-${b.type}${b.type === "h" ? ` blk-h${b.level ?? 2}` : ""}${b.done ? " done" : ""}`;

const kinds: {
  type: BlockType;
  level?: number;
  label: string;
  icon: string;
  hint: string;
}[] = [
  { type: "p", label: t("Text"), icon: "Aa", hint: "" },
  { type: "h", level: 2, label: t("Heading"), icon: "H", hint: "##" },
  { type: "li", label: t("List"), icon: "•", hint: "-" },
  { type: "todo", label: t("Checklist"), icon: "[ ]", hint: "[]" },
  { type: "quote", label: t("Quote"), icon: "“", hint: ">" },
  { type: "code", label: t("Code"), icon: "</>", hint: "```" },
];
// Typed at the start of a paragraph, these turn it into another block.
const prefixes: [string, BlockType, number?][] = [
  ["- ", "li"],
  ["* ", "li"],
  ["[] ", "todo"],
  ["[ ] ", "todo"],
  ["### ", "h", 3],
  ["## ", "h", 2],
  ["# ", "h", 1],
  ["> ", "quote"],
  ["```", "code"],
];
const placeholder = (b: Block) =>
  b.type === "h"
    ? t("Heading")
    : b.type === "p"
      ? t("Write, or type / for blocks")
      : b.type === "code"
        ? t("Code")
        : t("Item");

/**
 * Block editor for the briefing, in the spirit of Notion: each block shows its formatting and
 * turns into plain Markdown text when focused. Enter splits a block, Backspace at the start
 * merges it or turns it back into text, arrows move between blocks and `/` opens the block menu.
 * Every change is emitted as Markdown.
 */
export function BriefingEditor({
  value,
  onChange,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  // Opened from "Editar": writing continues in an empty block at the end.
  const [initial] = useState(() => {
    const parsed = parseBriefing(value);
    if (!autoFocus) return { blocks: parsed, editing: null };
    const last = parsed[parsed.length - 1];
    if (last && last.type === "p" && !last.text)
      return { blocks: parsed, editing: last.id };
    const fresh = block();
    return { blocks: [...parsed, fresh], editing: fresh.id };
  });
  const [blocks, setBlocks] = useState(initial.blocks);
  const [editing, setEditing] = useState<string | null>(initial.editing);
  const caret = useRef<number | null>(null);
  const [slash, setSlash] = useState<{ id: string; active: number } | null>(
    null,
  );
  const emitted = useRef(value);
  useEffect(() => {
    // Only a change from elsewhere (the agent, another window) reloads the blocks.
    if (value === emitted.current) return;
    emitted.current = value;
    setBlocks(parseBriefing(value));
    setEditing(null);
    setSlash(null);
  }, [value]);
  function edit(id: string | null, at: number | null = null) {
    caret.current = at;
    setEditing(id);
  }
  function commit(next: Block[], focus?: string, at: number | null = null) {
    setBlocks(next);
    if (focus !== undefined) edit(focus, at);
    const markdown = serializeBriefing(next);
    if (markdown !== emitted.current) {
      emitted.current = markdown;
      onChange(markdown);
    }
  }
  const patch = (
    id: string,
    change: Partial<Block>,
    at: number | null = null,
  ) =>
    commit(
      blocks.map((b) => (b.id === id ? { ...b, ...change } : b)),
      id,
      at,
    );
  const query = (b: Block) => searchKey(b.text.slice(1));
  const menu = (b: Block) =>
    kinds.filter((k) => !query(b) || searchKey(k.label).includes(query(b)));
  function transform(b: Block, kind: (typeof kinds)[number]) {
    setSlash(null);
    patch(
      b.id,
      { type: kind.type, text: "", done: false, level: kind.level, lang: "" },
      0,
    );
  }
  function change(b: Block, event: ChangeEvent<HTMLTextAreaElement>) {
    const text = event.target.value;
    if (b.type !== "code" && text.includes("\n")) {
      // Pasted lines become blocks of their own.
      const pasted = parseBriefing(text);
      const index = blocks.indexOf(b);
      if (pasted.length && b.type !== "p")
        pasted[0] = { ...pasted[0], type: b.type, done: b.done };
      const next = [...blocks];
      next.splice(index, 1, ...(pasted.length ? pasted : [block()]));
      const last = next[index + Math.max(0, pasted.length - 1)];
      return commit(next, last.id, last.text.length);
    }
    if (b.type === "p" && !b.text && text.startsWith("/"))
      setSlash({ id: b.id, active: 0 });
    else if (slash?.id === b.id && !text.startsWith("/")) setSlash(null);
    if (b.type === "p")
      for (const [prefix, type, level] of prefixes)
        if (text.startsWith(prefix)) {
          setSlash(null);
          return patch(
            b.id,
            { type, level, text: text.slice(prefix.length) },
            0,
          );
        }
    patch(b.id, { text }, event.target.selectionStart);
  }
  function keyDown(b: Block, event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    const index = blocks.indexOf(b);
    const { selectionStart: start, selectionEnd: end } = event.currentTarget;
    const open = slash?.id === b.id ? menu(b) : [];
    if (open.length) {
      const active = Math.min(slash!.active, open.length - 1);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setSlash({
          id: b.id,
          active: (active + step + open.length) % open.length,
        });
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        transform(b, open[active]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setSlash(null);
        return;
      }
    }
    if (
      event.key === "Enter" &&
      b.type !== "code" &&
      !event.metaKey &&
      !event.ctrlKey
    ) {
      event.preventDefault();
      const listy = b.type === "li" || b.type === "todo";
      if (listy && !b.text) return patch(b.id, { type: "p" }, 0);
      const next = [...blocks];
      const fresh = block(listy ? b.type : "p", b.text.slice(end));
      next.splice(index, 1, { ...b, text: b.text.slice(0, start) }, fresh);
      return commit(next, fresh.id, 0);
    }
    if (event.key === "Backspace" && start === 0 && end === 0) {
      if (b.type !== "p") {
        if (b.type === "code" && b.text) return;
        event.preventDefault();
        return patch(b.id, { type: "p" }, 0);
      }
      const previous = blocks[index - 1];
      if (previous && previous.type !== "code") {
        event.preventDefault();
        const next = blocks.filter((x) => x !== b);
        next[index - 1] = { ...previous, text: previous.text + b.text };
        return commit(next, previous.id, previous.text.length);
      }
      return;
    }
    if (event.key === "ArrowUp" && start === 0 && end === 0 && index > 0) {
      event.preventDefault();
      return edit(blocks[index - 1].id);
    }
    if (
      event.key === "ArrowDown" &&
      start === b.text.length &&
      index < blocks.length - 1
    ) {
      event.preventDefault();
      return edit(blocks[index + 1].id, 0);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.blur();
    }
  }
  function focus(event: FocusEvent<HTMLTextAreaElement>) {
    const at = caret.current ?? event.currentTarget.value.length;
    event.currentTarget.setSelectionRange(at, at);
  }
  function blur(b: Block) {
    setSlash(null);
    setEditing((current) => (current === b.id ? null : current));
    // An empty slash command leaves nothing behind.
    if (b.text === "/")
      commit(blocks.map((x) => (x.id === b.id ? { ...x, text: "" } : x)));
  }
  function append() {
    const last = blocks[blocks.length - 1];
    if (last && last.type === "p" && !last.text) return edit(last.id, 0);
    const fresh = block();
    setBlocks([...blocks, fresh]);
    edit(fresh.id, 0);
  }
  return (
    <div className="briefing-doc briefing-editor">
      {blocks.map((b) => {
        const open = slash?.id === b.id ? menu(b) : [];
        const active = Math.min(slash?.active ?? 0, open.length - 1);
        return (
          <div key={b.id} className={blockClass(b)}>
            <Marker block={b} onToggle={() => patch(b.id, { done: !b.done })} />
            {editing === b.id ? (
              <AutoTextarea
                autoFocus
                aria-label={t("Briefing")}
                className="blk-input"
                spellCheck={b.type !== "code"}
                maxRows={400}
                value={b.text}
                placeholder={placeholder(b)}
                onChange={(event) => change(b, event)}
                onKeyDown={(event) => keyDown(b, event)}
                onFocus={focus}
                onBlur={() => blur(b)}
              />
            ) : (
              <div
                className={`blk-text ${b.text ? "" : "empty"}`}
                tabIndex={0}
                data-placeholder={placeholder(b)}
                onFocus={() => edit(b.id)}
              >
                {b.type === "code" ? (
                  <pre>{b.text}</pre>
                ) : (
                  <Inline text={b.text} links={false} />
                )}
              </div>
            )}
            {open.length > 0 && (
              <div
                className="slash-menu"
                role="listbox"
                aria-label={t("Turn into")}
              >
                <span className="slash-title">{t("Turn into")}</span>
                {open.map((kind, i) => (
                  <div
                    key={kind.label}
                    role="option"
                    aria-selected={i === active}
                    className={`popover-option ${i === active ? "active" : ""}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      transform(b, kind);
                    }}
                  >
                    <span className="slash-icon">{kind.icon}</span>
                    <span className="popover-label">{kind.label}</span>
                    <span className="slash-hint">{kind.hint}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className="briefing-append" onClick={append}>
        {blocks.length ? t("Keep writing") : t("Write the briefing")}
        <span> {t("· type / for blocks")}</span>
      </button>
    </div>
  );
}
