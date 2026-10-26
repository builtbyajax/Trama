import { useEffect, useRef, useState, type RefObject } from "react";
import { changeLetter, changeTitle, pairLines } from "../../lib/diff";
import type { FileDiff } from "../../lib/types";
import { DiffBlocks } from "../git/parts";
import { Icon } from "../Icon";
import { DiffHunks } from "./DiffHunks";
import { t } from "../../lib/i18n";
import { Segmented } from "../Segmented";

/** `src/app/layout.tsx` → folder `src/app`, name `layout.tsx`. */
export function splitFolder(path: string) {
  const slash = path.lastIndexOf("/");
  return slash < 0
    ? { folder: "", name: path }
    : { folder: path.slice(0, slash), name: path.slice(slash + 1) };
}

const ROW = 20;

/** The height a file takes before it renders, so the scroll and the jumps land near the truth. */
function estimate(file: FileDiff, layout: "side" | "inline") {
  if (file.isBinary || file.hunks.length === 0) return 64;
  let rows = 0;
  for (const hunk of file.hunks)
    rows +=
      1 +
      (layout === "side" ? pairLines(hunk.lines).length : hunk.lines.length);
  return rows * ROW + 8;
}

/**
 * One file of the change: a head that sticks to the top while the file is read, then its hunks.
 * The hunks render only once the file comes near the screen, so a change with hundreds of files
 * opens at once.
 */
export function DiffFile({
  file,
  index,
  layout,
  collapsed,
  eager,
  root,
  onToggle,
  onLayout,
  onCopy,
}: {
  file: FileDiff;
  index: number;
  layout: "side" | "inline";
  collapsed: boolean;
  eager: boolean;
  root: RefObject<HTMLElement | null>;
  onToggle: () => void;
  onLayout: (layout: "side" | "inline") => void;
  onCopy: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(eager);
  useEffect(() => {
    if (near || !ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { root: root.current, rootMargin: "1200px 0px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [near, root]);
  useEffect(() => {
    if (eager) setNear(true);
  }, [eager]);
  const { folder, name } = splitFolder(file.path);
  return (
    <section
      ref={ref}
      className={`diff-file ${collapsed ? "collapsed" : ""}`}
      data-file={index}
    >
      <header className="diff-file-head">
        <button
          type="button"
          className="icon-button small diff-chevron"
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("Show file") : t("Collapse file")}
          onClick={onToggle}
        >
          <Icon name="chevronDown" size={12} />
        </button>
        <code
          className={`diff-letter ${file.change}`}
          title={changeTitle(file.change)}
        >
          {changeLetter(file.change)}
        </code>
        <code className="diff-path" title={file.path}>
          {/* Right-to-left truncation keeps the file name visible. */}
          {"\u200e"}
          {file.oldPath && <span>{`${file.oldPath} → `}</span>}
          {folder && <span>{`${folder}/`}</span>}
          {name}
          {"\u200e"}
        </code>
        {(file.change === "added" || file.change === "untracked") && (
          <span className="diff-new">{t("new")}</span>
        )}
        <span className="diff-file-stats">
          <span className="diff-stats">
            <b>+{file.additions}</b>
            <i>−{file.deletions}</i>
          </span>
          <DiffBlocks additions={file.additions} deletions={file.deletions} />
        </span>
        <Segmented
          size="small"
          label={t("Display mode")}
          options={[
            { value: "side", label: t("Side by side") },
            { value: "inline", label: t("Inline") },
          ]}
          value={layout}
          onChange={onLayout}
        />
        <button
          type="button"
          className="icon-button small"
          aria-label={t("Copy path")}
          data-tooltip={t("Copy path")}
          data-tooltip-align="end"
          onClick={onCopy}
        >
          <Icon name="copy" size={13} />
        </button>
      </header>
      {!collapsed && (
        <div
          className={`diff-file-body ${layout}`}
          style={near ? undefined : { height: estimate(file, layout) }}
        >
          {!near ? null : file.isBinary ? (
            <p className="diff-placeholder">
              {t("Binary file, or too large to preview.")}
            </p>
          ) : file.hunks.length === 0 ? (
            <p className="diff-placeholder">
              {file.change === "renamed"
                ? t("File renamed with no content changes.")
                : t("No text changes in this file.")}
            </p>
          ) : (
            <DiffHunks file={file} layout={layout} />
          )}
        </div>
      )}
    </section>
  );
}
