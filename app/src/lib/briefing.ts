/**
 * The briefing is stored as Markdown, which is what the agent reads. The editor works on blocks:
 * one per line (paragraph, heading, bullet, to-do, quote) plus fenced code. Lines it does not
 * recognise stay as paragraphs with their original text, so saving never loses Markdown.
 */
export type BlockType = "p" | "h" | "li" | "todo" | "quote" | "code";
export interface Block {
  id: string;
  type: BlockType;
  text: string;
  /** To-do state. */
  done?: boolean;
  /** Heading level, 1 to 3. */
  level?: number;
  /** Language after the opening fence of a code block. */
  lang?: string;
}

let counter = 0;
export const blockId = () => `b${++counter}`;
export const block = (type: BlockType = "p", text = ""): Block => ({
  id: blockId(),
  type,
  text,
  ...(type === "h" ? { level: 2 } : {}),
});

export function parseBriefing(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++)
        body.push(lines[i]);
      blocks.push({
        id: blockId(),
        type: "code",
        text: body.join("\n"),
        lang: line.slice(3).trim(),
      });
      continue;
    }
    if (!line.trim()) continue;
    let match: RegExpExecArray | null;
    if ((match = /^(#{1,3}) +(.*)$/.exec(line)))
      blocks.push({
        id: blockId(),
        type: "h",
        text: match[2],
        level: match[1].length,
      });
    else if ((match = /^[-*] \[([ xX])\] ?(.*)$/.exec(line)))
      blocks.push({
        id: blockId(),
        type: "todo",
        text: match[2],
        done: match[1] !== " ",
      });
    else if ((match = /^[-*] (.*)$/.exec(line)))
      blocks.push({ id: blockId(), type: "li", text: match[1] });
    else if ((match = /^> ?(.*)$/.exec(line)))
      blocks.push({ id: blockId(), type: "quote", text: match[1] });
    else blocks.push({ id: blockId(), type: "p", text: line });
  }
  return blocks;
}

const markdownLine = (b: Block) => {
  switch (b.type) {
    case "h":
      return `${"#".repeat(b.level ?? 2)} ${b.text}`;
    case "li":
      return `- ${b.text}`;
    case "todo":
      return `- [${b.done ? "x" : " "}] ${b.text}`;
    case "quote":
      return `> ${b.text}`;
    case "code":
      return `\`\`\`${b.lang ?? ""}\n${b.text}\n\`\`\``;
    default:
      return b.text;
  }
};
const family = (type: BlockType) =>
  type === "li" || type === "todo" ? "list" : type;

export function serializeBriefing(blocks: Block[]): string {
  let out = "";
  let previous: Block | undefined;
  for (const b of blocks) {
    if (b.type === "p" && !b.text.trim()) continue;
    if (previous)
      out +=
        family(previous.type) === family(b.type) &&
        b.type !== "p" &&
        b.type !== "h" &&
        b.type !== "code"
          ? "\n"
          : "\n\n";
    out += markdownLine(b);
    previous = b;
  }
  return out;
}

export type Segment =
  | { kind: "plain" | "bold" | "code"; text: string }
  | { kind: "link"; text: string; href: string };

/** Inline Markdown the briefing renders: **bold**, `code` and [links](https://…). */
export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  for (const part of text.split(
    /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https:\/\/[^)\s]+\))/,
  )) {
    if (!part) continue;
    const link = /^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/.exec(part);
    if (link) out.push({ kind: "link", text: link[1], href: link[2] });
    else if (part.startsWith("**") && part.length > 4)
      out.push({ kind: "bold", text: part.slice(2, -2) });
    else if (part.startsWith("`") && part.length > 2)
      out.push({ kind: "code", text: part.slice(1, -1) });
    else out.push({ kind: "plain", text: part });
  }
  return out;
}

/** What the collapsed briefing shows: the first text and how many list items follow. */
export function briefingPreview(blocks: Block[]) {
  const first = blocks.find((b) => b.type !== "code" && b.text.trim());
  return {
    text: first?.text ?? "",
    items: blocks.filter((b) => b.type === "li" || b.type === "todo").length,
    more: blocks.length > 1,
  };
}
