import { describe, it, expect } from "vitest";
import {
  parseMarkdown,
  parseInline,
  toggleTodo,
  joinPath,
  slug,
  noteName,
  folderOf,
} from "./markdown";
import {
  parseBriefing,
  serializeBriefing,
  briefingPreview,
  segments,
} from "./briefing";

describe("note Markdown", () => {
  it("keeps frontmatter, duplicate anchors and source line numbers", () => {
    const source =
      "---\ntags: [one, two]\n---\n# Ação\n# Ação\n- [ ] First\n  - [x] Nested\n\n```ts\n# not a heading\n```";
    const doc = parseMarkdown(source);
    expect(doc.properties).toEqual([["tags", ["one", "two"]]]);
    expect(doc.headings.map((h) => h.id)).toEqual(["acao", "acao-1"]);
    expect(doc.blocks).toContainEqual(
      expect.objectContaining({
        kind: "code",
        lang: "ts",
        text: "# not a heading",
      }),
    );
    const list = doc.blocks.find((b) => b.kind === "list");
    expect(list?.kind === "list" && list.items[0]).toMatchObject({
      checked: false,
      line: 5,
    });
    expect(toggleTodo(source, 6)).toContain("  - [ ] Nested");
    expect(toggleTodo(source, 99)).toBe(source);
    expect(toggleTodo(source, 3)).toBe(source);
  });
  it("keeps formatting, note links and HTML as data", () => {
    const tokens = parseInline(
      "**bold** `code` [[Folder/Note#Section|label]] ![alt](image.png) <script>hi</script>",
    );
    expect(tokens).toContainEqual({
      kind: "wiki",
      target: "Folder/Note",
      heading: "Section",
      label: "label",
    });
    expect(tokens).toContainEqual({
      kind: "image",
      src: "image.png",
      alt: "alt",
    });
    expect(
      tokens.some((t) => t.kind === "text" && t.text.includes("<script>")),
    ).toBe(true);
    expect(slug("Olá, ação!")).toBe("ola-acao");
    expect(noteName("Folder/Note.MD")).toBe("Note");
    expect(folderOf("Folder/Note.md")).toBe("Folder");
  });
  it.each([
    ["a/b", "../note.md", "a/note.md"],
    ["a", "%2E%2E/../secret", null],
    ["", "../../secret", null],
    ["a", "./A%20B.md", "a/A B.md"],
    ["a", "%ZZ", null],
  ])("resolves links safely (%s, %s)", (folder, link, expected) => {
    expect(joinPath(folder!, link!)).toBe(expected);
  });
});
describe("briefing editor", () => {
  it("roundtrips blocks without losing nested Markdown", () => {
    const source =
      "# Heading\n\nParagraph\n\n- Item\n- [x] Done\n- [ ] Pending\n\n> Quote\n\n```ts\nconst x = 1;\n```\n\n  - nested **raw**";
    const clean = (text: string) =>
      parseBriefing(text).map(({ id: _id, ...rest }) => rest);
    expect(clean(serializeBriefing(parseBriefing(source)))).toEqual(
      clean(source),
    );
    expect(briefingPreview(parseBriefing(source))).toEqual({
      text: "Heading",
      items: 3,
      more: true,
    });
    expect(serializeBriefing(parseBriefing(""))).toBe("");
  });
  it("only creates external links for HTTPS", () => {
    expect(
      segments("[safe](https://example.com) **bold** `code`"),
    ).toContainEqual({
      kind: "link",
      href: "https://example.com",
      text: "safe",
    });
    expect(segments("[bad](javascript:alert)")).toEqual([
      { kind: "plain", text: "[bad](javascript:alert)" },
    ]);
  });
});
