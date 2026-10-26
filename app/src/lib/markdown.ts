/**
 * Markdown of the notes folder as a tree of blocks and inline tokens, rendered by React
 * components (never as HTML). It covers what notes written by people and agents use: YAML
 * properties, headings, lists with to-dos and nesting, quotes and Obsidian callouts, tables,
 * fenced code, rules, links, [[wikilinks]] and images. Anything else stays as plain text.
 * Lines are counted from the start of the file, so a to-do can be ticked in the source.
 */
export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong" | "em" | "del" | "mark"; children: Inline[] }
  | { kind: "wiki"; target: string; heading: string | null; label: string }
  | { kind: "embed"; target: string; label: string }
  | { kind: "image"; src: string; alt: string }
  | { kind: "link"; href: string; children: Inline[] }
  | { kind: "tag"; text: string };

export interface ListItem {
  text: string;
  /** null for a plain item, otherwise the to-do state. */
  checked: boolean | null;
  /** Line of the item in the file, from 0. */
  line: number;
  children: Block[];
}
/** `line`: where the block starts in the file, from 0, so the reader can follow the editor. */
export type Block = { line?: number } & (
  | { kind: "heading"; level: number; text: string; id: string }
  | { kind: "paragraph"; text: string }
  | { kind: "rule" }
  | { kind: "code"; lang: string; text: string }
  | { kind: "quote"; children: Block[] }
  | {
      kind: "callout";
      type: string;
      title: string;
      children: Block[];
    }
  | { kind: "table"; head: string[]; align: Align[]; rows: string[][] }
  | { kind: "list"; ordered: boolean; start: number; items: ListItem[] }
);
export type Align = "left" | "center" | "right";

export interface Heading {
  id: string;
  level: number;
  text: string;
}
export interface MarkdownDocument {
  properties: [string, string[]][];
  blocks: Block[];
  headings: Heading[];
  words: number;
}

const isBlank = (line: string) => !line.trim();
const indentOf = (line: string) =>
  /^[ \t]*/.exec(line)![0].replace(/\t/g, "    ").length;
const FENCE = /^\s*(```|~~~)\s*([\w+#.-]*)/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_RULE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

const isTable = (lines: string[], i: number) =>
  lines[i].includes("|") &&
  i + 1 < lines.length &&
  lines[i + 1].includes("-") &&
  TABLE_RULE.test(lines[i + 1]);
const startsBlock = (lines: string[], i: number) => {
  const line = lines[i];
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    LIST.test(line) ||
    isTable(lines, i)
  );
};

function cells(row: string) {
  const trimmed = row.trim().replace(/^\|/, "").replace(/\|$/, "");
  // A pipe inside `code` or escaped as \| belongs to the cell.
  const out: string[] = [];
  let cell = "";
  let code = false;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (c === "\\" && trimmed[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (c === "`") {
      code = !code;
      cell += c;
    } else if (c === "|" && !code) {
      out.push(cell.trim());
      cell = "";
    } else cell += c;
  }
  out.push(cell.trim());
  return out;
}

function parseBlocks(lines: string[], offset: number): Block[] {
  const out: Block[] = [];
  let i = 0;
  let match: RegExpExecArray | null;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }
    const begin = offset + i;
    const add = (block: Block) => out.push({ ...block, line: begin });
    if ((match = FENCE.exec(line))) {
      const fence = match[1];
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(fence); i++)
        body.push(lines[i]);
      i++;
      add({ kind: "code", lang: match[2], text: body.join("\n") });
      continue;
    }
    if ((match = HEADING.exec(line))) {
      add({
        kind: "heading",
        level: match[1].length,
        text: match[2],
        id: "",
      });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      add({ kind: "rule" });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const start = i;
      const inner: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]))
        inner.push(QUOTE.exec(lines[i++])![1]);
      const callout = /^\[!([\w-]+)\][+-]?\s*(.*)$/.exec(inner[0]);
      add(
        callout
          ? {
              kind: "callout",
              type: callout[1].toLowerCase(),
              title: callout[2],
              children: parseBlocks(inner.slice(1), offset + start + 1),
            }
          : { kind: "quote", children: parseBlocks(inner, offset + start) },
      );
      continue;
    }
    if (isTable(lines, i)) {
      const head = cells(line);
      const align = cells(lines[i + 1]).map((c): Align =>
        c.startsWith(":") && c.endsWith(":")
          ? "center"
          : c.endsWith(":")
            ? "right"
            : "left",
      );
      const rows: string[][] = [];
      for (i += 2; i < lines.length && !isBlank(lines[i]); i++) {
        if (!lines[i].includes("|")) break;
        rows.push(cells(lines[i]));
      }
      add({ kind: "table", head, align, rows });
      continue;
    }
    if (LIST.test(line)) {
      const parsed = parseList(lines, i, offset);
      add(parsed.block);
      i = parsed.next;
      continue;
    }
    const text = [line.trim()];
    for (i++; i < lines.length; i++) {
      if (isBlank(lines[i]) || startsBlock(lines, i)) break;
      text.push(lines[i].trim());
    }
    add({ kind: "paragraph", text: text.join("\n") });
  }
  return out;
}

function parseList(lines: string[], start: number, offset: number) {
  const first = LIST.exec(lines[start])!;
  const base = indentOf(lines[start]);
  const ordered = /\d/.test(first[2]);
  const block: Extract<Block, { kind: "list" }> = {
    kind: "list",
    ordered,
    start: ordered ? parseInt(first[2], 10) : 1,
    items: [],
  };
  let i = start;
  while (i < lines.length) {
    if (isBlank(lines[i])) {
      // A blank line between two items keeps the list going.
      let j = i;
      while (j < lines.length && isBlank(lines[j])) j++;
      const next = j < lines.length ? LIST.exec(lines[j]) : null;
      if (next && indentOf(lines[j]) === base && /\d/.test(next[2]) === ordered)
        i = j;
      else break;
    }
    const match = LIST.exec(lines[i]);
    if (
      !match ||
      indentOf(lines[i]) !== base ||
      /\d/.test(match[2]) !== ordered
    )
      break;
    const pad = base + match[2].length + 1;
    const line = offset + i;
    let text = match[3];
    let checked: boolean | null = null;
    const todo = /^\[([ xX])\](?:\s+(.*))?$/.exec(text);
    if (todo) {
      checked = todo[1] !== " ";
      text = todo[2] ?? "";
    }
    i++;
    const sub: string[] = [];
    let subStart = i;
    while (i < lines.length) {
      const l = lines[i];
      if (isBlank(l)) {
        let j = i + 1;
        while (j < lines.length && isBlank(lines[j])) j++;
        if (j < lines.length && indentOf(lines[j]) > base) {
          if (!sub.length) subStart = i;
          sub.push("");
          i++;
          continue;
        }
        break;
      }
      if (indentOf(l) > base) {
        if (!sub.length) subStart = i;
        const spaces = l.replace(/^\t+/, (t) => "    ".repeat(t.length));
        sub.push(spaces.slice(Math.min(indentOf(l), pad)));
        i++;
        continue;
      }
      // A line without a marker continues the item's text.
      if (!sub.length && !startsBlock(lines, i)) {
        text += "\n" + l.trim();
        i++;
        continue;
      }
      break;
    }
    block.items.push({
      text,
      checked,
      line,
      children: sub.length ? parseBlocks(sub, offset + subStart) : [],
    });
  }
  return { block, next: i };
}

function parseProperties(source: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(source);
  if (!match) return { properties: [], body: source, offset: 0 };
  const properties: [string, string[]][] = [];
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([^\s:#][^:]*):\s*(.*)$/.exec(line);
    if (pair) {
      const value = pair[2].trim();
      const list = /^\[(.*)\]$/.exec(value);
      properties.push([
        pair[1].trim(),
        list
          ? list[1]
              .split(",")
              .map((v) => unquote(v.trim()))
              .filter(Boolean)
          : value
            ? [unquote(value)]
            : [],
      ]);
    } else {
      // "  - item" lines continue the previous key as a list.
      const item = /^\s*-\s+(.*)$/.exec(line);
      if (item && properties.length)
        properties[properties.length - 1][1].push(unquote(item[1].trim()));
    }
  }
  return {
    properties,
    body: source.slice(match[0].length),
    offset: match[0].split("\n").length - 1,
  };
}
const unquote = (v: string) => v.replace(/^(["'])(.*)\1$/, "$2");

export const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "") || "secao";

/** The text a reader sees, without Markdown marks. */
export const plainText = (text: string) =>
  text
    .replace(
      /!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g,
      (_, a, b) => b ?? a,
    )
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~=]/g, "");

export function parseMarkdown(source: string): MarkdownDocument {
  const normalized = source.replace(/\r\n?/g, "\n");
  const { properties, body, offset } = parseProperties(normalized);
  const blocks = parseBlocks(body.split("\n"), offset);
  const headings: Heading[] = [];
  const used = new Map<string, number>();
  const walk = (list: Block[]) => {
    for (const b of list)
      if (b.kind === "heading") {
        const base = slug(plainText(b.text));
        const n = used.get(base) ?? 0;
        used.set(base, n + 1);
        b.id = n ? `${base}-${n}` : base;
        headings.push({ id: b.id, level: b.level, text: plainText(b.text) });
      } else if (b.kind === "quote" || b.kind === "callout") walk(b.children);
  };
  walk(blocks);
  const words = body
    .replace(/```[\s\S]*?```/g, "")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return { properties, blocks, headings, words };
}

const patterns: [Inline["kind"] | "url", RegExp][] = [
  // A run of n backticks opens a span closed by the same run, so `` ` `` can show a backtick.
  ["code", /(`+)(?!`)([\s\S]*?[^`])\1(?!`)/],
  ["embed", /!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/],
  ["wiki", /\[\[([^\]|#]+)?(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/],
  ["image", /!\[([^\]]*)\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/],
  ["link", /\[((?:[^\][]|\[[^\]]*\])+)\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/],
  ["url", /\bhttps?:\/\/[^\s<>()]*[^\s<>().,;:!?'"]/],
  ["strong", /\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*|__(?=\S)([\s\S]+?)(?<=\S)__/],
  ["del", /~~(?=\S)([\s\S]+?)(?<=\S)~~/],
  ["mark", /==(?=\S)([\s\S]+?)(?<=\S)==/],
  [
    "em",
    /(?<![\w*])\*(?=[^\s*])([\s\S]+?)(?<=[^\s*])\*(?!\*)|(?<![\w_])_(?=\S)([\s\S]+?)(?<=\S)_(?![\w_])/,
  ],
  ["tag", /(?<![\w/#&])#([\p{L}_][\p{L}\p{N}_/-]*)/u],
];

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest) {
    let best: {
      kind: (typeof patterns)[number][0];
      m: RegExpExecArray;
    } | null = null;
    for (const [kind, re] of patterns) {
      const m = re.exec(rest);
      if (m && (!best || m.index < best.m.index)) best = { kind, m };
    }
    if (!best) {
      out.push({ kind: "text", text: rest });
      break;
    }
    const { kind, m } = best;
    if (m.index) out.push({ kind: "text", text: rest.slice(0, m.index) });
    switch (kind) {
      case "code":
        out.push({ kind, text: m[2].replace(/^ (.*) $/s, "$1") });
        break;
      case "embed":
        out.push({ kind, target: m[1].trim(), label: m[2] ?? m[1].trim() });
        break;
      case "wiki": {
        const target = (m[1] ?? "").trim();
        const heading = m[2]?.trim() ?? null;
        out.push({
          kind,
          target,
          heading,
          label: m[3] ?? (target || heading || ""),
        });
        break;
      }
      case "image":
        out.push({ kind, alt: m[1], src: m[2] });
        break;
      case "link":
        out.push({ kind, href: m[2], children: parseInline(m[1]) });
        break;
      case "url":
        out.push({
          kind: "link",
          href: m[0],
          children: [{ kind: "text", text: m[0] }],
        });
        break;
      case "tag":
        out.push({ kind, text: m[1] });
        break;
      default:
        out.push({
          kind: kind as "strong",
          children: parseInline(m[1] ?? m[2]),
        });
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

/** Flips the to-do on `line` of the file. */
export function toggleTodo(source: string, line: number): string {
  const lines = source.split("\n");
  if (line < 0 || line >= lines.length) return source;
  lines[line] = lines[line].replace(
    /^(\s*(?:[-*+]|\d{1,9}[.)])\s+)\[([ xX])\]/,
    (_, lead, mark) => `${lead}[${mark === " " ? "x" : " "}]`,
  );
  return lines.join("\n");
}

/** File name without the extension: how notes are named in links and lists. */
export const noteName = (path: string) =>
  path
    .split("/")
    .pop()!
    .replace(/\.(md|markdown)$/i, "");

/** Folder part of a path, "" at the root. */
export const folderOf = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

/** Joins a link relative to a note's folder, resolving `.` and `..`; null when it leaves. */
export function joinPath(folder: string, link: string): string | null {
  const parts = folder ? folder.split("/") : [];
  for (const part of decodeURI(link).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}
