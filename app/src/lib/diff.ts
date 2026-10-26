import type { DiffLine, FileDiff } from "./types";
import { t } from "./i18n";

export interface DiffPair {
  left: DiffLine | null;
  right: DiffLine | null;
}

/** Aligns deletions with the additions that replace them for the side-by-side view. */
export function pairLines(lines: DiffLine[]): DiffPair[] {
  const pairs: DiffPair[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].kind === "context") {
      pairs.push({ left: lines[i], right: lines[i] });
      i++;
      continue;
    }
    const deletions: DiffLine[] = [];
    const additions: DiffLine[] = [];
    while (i < lines.length && lines[i].kind === "deletion")
      deletions.push(lines[i++]);
    while (i < lines.length && lines[i].kind === "addition")
      additions.push(lines[i++]);
    for (let j = 0; j < Math.max(deletions.length, additions.length); j++)
      pairs.push({ left: deletions[j] ?? null, right: additions[j] ?? null });
  }
  return pairs;
}

/** Character range of `text` that differs from `other` (common prefix and suffix removed). */
export function changedRange(text: string, other: string) {
  const chars = Array.from(text);
  const otherChars = Array.from(other);
  let start = 0;
  while (
    start < chars.length &&
    start < otherChars.length &&
    chars[start] === otherChars[start]
  )
    start++;
  let end = chars.length;
  let otherEnd = otherChars.length;
  while (
    end > start &&
    otherEnd > start &&
    chars[end - 1] === otherChars[otherEnd - 1]
  ) {
    end--;
    otherEnd--;
  }
  return {
    before: chars.slice(0, start).join(""),
    changed: chars.slice(start, end).join(""),
    after: chars.slice(end).join(""),
  };
}

export const changeLetter = (change: string) =>
  ({
    added: "A",
    deleted: "D",
    renamed: "R",
    copied: "C",
    untracked: "U",
  })[change] ?? "M";

export const changeTitle = (change: string) =>
  ({
    added: t("Added"),
    deleted: t("Deleted"),
    renamed: t("Renamed"),
    copied: t("Copied"),
    untracked: t("Untracked"),
  })[change] ?? t("Modified");

export const totals = (files: FileDiff[]) =>
  files.reduce(
    (sum, file) => ({
      additions: sum.additions + file.additions,
      deletions: sum.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  );

/** Splits a path into its folder (dimmed) and file name (emphasized). */
export function splitPath(path: string) {
  const index = path.lastIndexOf("/");
  return index < 0
    ? { folder: "", name: path }
    : { folder: path.slice(0, index + 1), name: path.slice(index + 1) };
}
