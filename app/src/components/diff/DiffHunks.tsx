import { memo, type CSSProperties } from "react";
import { changedRange, pairLines } from "../../lib/diff";
import type { DiffLine, FileDiff } from "../../lib/types";
import { Icon } from "../Icon";
import { t } from "../../lib/i18n";

const sign = (line: DiffLine | null) =>
  line?.kind === "addition" ? "+" : line?.kind === "deletion" ? "−" : " ";

function Text({
  line,
  counterpart,
}: {
  line: DiffLine | null;
  counterpart?: DiffLine | null;
}) {
  if (!line) return <code />;
  const paired =
    counterpart && line.kind !== "context" && counterpart.kind !== "context"
      ? changedRange(line.text, counterpart.text)
      : null;
  // Marks only a part of a line that was edited; a line rewritten from scratch stays plain.
  const range =
    paired &&
    (paired.before || paired.after) &&
    paired.changed.length <= line.text.length * 0.8
      ? paired
      : null;
  return (
    <code>
      {range ? (
        <>
          {range.before}
          <mark>{range.changed}</mark>
          {range.after}
        </>
      ) : (
        line.text
      )}
      {line.missingNewline && (
        <span className="newline-note" title={t("No newline at end of file")}>
          {" "}
          ↵
        </span>
      )}
    </code>
  );
}

function Cell({
  line,
  side,
  counterpart,
}: {
  line: DiffLine | null;
  side: "old" | "new";
  counterpart: DiffLine | null;
}) {
  return (
    <div className={`diff-cell ${line?.kind ?? "blank"}`}>
      <span className="line-number">
        {side === "old" ? line?.oldNumber : line?.newNumber}
      </span>
      <span className="line-sign">{sign(line)}</span>
      <Text line={line} counterpart={counterpart} />
    </div>
  );
}

/** Hunks of one file; the gutter width follows the largest line number. */
export const DiffHunks = memo(function DiffHunks({
  file,
  layout,
}: {
  file: FileDiff;
  layout: "side" | "inline";
}) {
  const largest = Math.max(
    1,
    ...file.hunks.map((h) =>
      Math.max(h.oldStart + h.oldCount, h.newStart + h.newCount),
    ),
  );
  const style = {
    "--num-w": `${String(largest).length + 2}ch`,
  } as CSSProperties;
  return (
    <div className="diff-hunks" style={style}>
      {file.hunks.map((hunk, hi) => {
        const pairs = pairLines(hunk.lines);
        const counterpart = new Map<DiffLine, DiffLine | null>();
        for (const pair of pairs)
          if (pair.left !== pair.right) {
            if (pair.left) counterpart.set(pair.left, pair.right);
            if (pair.right) counterpart.set(pair.right, pair.left);
          }
        // The lines the diff leaves out before this hunk: above the first one, or since the last.
        const previous = file.hunks[hi - 1];
        const skipped = previous
          ? hunk.oldStart - (previous.oldStart + previous.oldCount)
          : hunk.oldStart - 1;
        return (
          <section key={hi} className="diff-hunk">
            {(skipped > 0 || hunk.section) && (
              <div className="hunk-gap">
                <span>
                  <Icon name="expand" size={11} />
                  {skipped > 0 &&
                    (previous
                      ? skipped === 1
                        ? t("1 unchanged line")
                        : t("{0} unchanged lines", [skipped])
                      : skipped === 1
                        ? t("1 unchanged line above")
                        : t("{0} unchanged lines above", [skipped]))}
                  {hunk.section && <code>{hunk.section}</code>}
                </span>
              </div>
            )}
            {layout === "side"
              ? pairs.map((pair, li) => (
                  <div className="diff-pair" key={li}>
                    <Cell
                      line={pair.left}
                      side="old"
                      counterpart={pair.left === pair.right ? null : pair.right}
                    />
                    <Cell
                      line={pair.right}
                      side="new"
                      counterpart={pair.left === pair.right ? null : pair.left}
                    />
                  </div>
                ))
              : hunk.lines.map((line, li) => (
                  <div key={li} className={`diff-inline ${line.kind}`}>
                    <span className="gutter">
                      <span className="line-number">{line.oldNumber}</span>
                      <span className="line-number">{line.newNumber}</span>
                      <span className="line-sign">{sign(line)}</span>
                    </span>
                    <Text
                      line={line}
                      counterpart={counterpart.get(line) ?? null}
                    />
                  </div>
                ))}
          </section>
        );
      })}
    </div>
  );
});
