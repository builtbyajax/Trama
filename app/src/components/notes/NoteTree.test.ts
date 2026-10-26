import { describe, expect, it } from "vitest";
import { noteName } from "../../lib/markdown";
import { buildTree } from "./NoteTree";

const names = (entries: ReturnType<typeof buildTree>["entries"]) =>
  entries.map((entry) =>
    entry.kind === "folder" ? entry.folder.name : noteName(entry.note),
  );

describe("vault tree", () => {
  it("sorts folders and notes together with natural numeric names", () => {
    const tree = buildTree(
      [
        "10 - Histórico.md",
        "00 - Índice.md",
        "02 - Técnico/02 - Schema.md",
        "02 - Técnico/01 - MCP.md",
        "01 - Produto/00 - Visão.md",
      ],
      ["02 - Técnico", "01 - Produto"],
    );

    expect(names(tree.entries)).toEqual([
      "00 - Índice",
      "01 - Produto",
      "02 - Técnico",
      "10 - Histórico",
    ]);
    const technical = tree.entries.find(
      (entry) =>
        entry.kind === "folder" && entry.folder.name === "02 - Técnico",
    );
    expect(technical?.kind).toBe("folder");
    if (technical?.kind === "folder")
      expect(names(technical.folder.entries)).toEqual([
        "01 - MCP",
        "02 - Schema",
      ]);
  });
});
