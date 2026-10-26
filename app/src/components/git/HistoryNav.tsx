import {
  memo,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { Front, Fronts, Reach } from "../../lib/fronts";
import { commitGraph, type GraphRow, type Segment } from "../../lib/graph";
import type { FileDiff, GitCommit, GitSnapshot, Task } from "../../lib/types";
import { Glyph } from "../BoardFilters";
import { Icon } from "../Icon";
import { Select } from "../Select";
import {
  CommitPeek,
  PendingRing,
  RefBadges,
  StateTags,
  frontTitle,
  when,
} from "./parts";
import { t } from "../../lib/i18n";

const colors = [
  "#9ea3ff",
  "#4fd0b0",
  "#e6b566",
  "#e39ac1",
  "#6ba6f6",
  "#b39df3",
  "#6cbf8e",
];
const laneWidth = 12;
const maxLanes = 6;
const rowHeight = 46;
const middle = rowHeight / 2;
const cornerRadius = 6;
const color = (index: number) => colors[index % colors.length];
const laneX = (lane: number) => 10 + Math.min(lane, maxLanes - 1) * laneWidth;

const GraphCell = memo(function GraphCell({
  row,
  width,
  head,
}: {
  row: GraphRow;
  width: number;
  head: boolean;
}) {
  // A lane that changes column runs straight, turns once on a rounded corner and crosses at the
  // commit's height, so every bend in the graph has the same shape.
  const path = (s: Segment, from: number, to: number) => {
    const a = laneX(s.from),
      b = laneX(s.to);
    if (a === b) return `M${a} ${from}V${to}`;
    const dir = b > a ? 1 : -1;
    const r = Math.min(cornerRadius, Math.abs(b - a) / 2);
    const intoRow = `A${r} ${r} 0 0 ${dir > 0 ? 0 : 1} ${a + dir * r} ${middle}`;
    const outOfRow = `A${r} ${r} 0 0 ${dir > 0 ? 1 : 0} ${b} ${middle + r}`;
    if (from === middle)
      return `M${a} ${middle}H${b - dir * r}${outOfRow}V${to}`;
    if (to === middle) return `M${a} 0V${middle - r}${intoRow}H${b}`;
    return `M${a} 0V${middle - r}${intoRow}H${b - dir * r}${outOfRow}V${to}`;
  };
  const merge = row.outgoing.length > 1;
  return (
    <svg
      className="commit-graph"
      width={width}
      height={rowHeight}
      aria-hidden="true"
    >
      {row.passing.map((s, i) => (
        <path key={`p${i}`} d={path(s, 0, rowHeight)} stroke={color(s.color)} />
      ))}
      {row.incoming.map((s, i) => (
        <path key={`i${i}`} d={path(s, 0, middle)} stroke={color(s.color)} />
      ))}
      {row.outgoing.map((s, i) => (
        <path
          key={`o${i}`}
          d={path(s, middle, rowHeight)}
          stroke={color(s.color)}
        />
      ))}
      {head && (
        <circle
          cx={laneX(row.lane)}
          cy={middle}
          r={6}
          fill="var(--bg-canvas)"
          stroke={color(row.color)}
          strokeWidth={2}
        />
      )}
      <circle
        cx={laneX(row.lane)}
        cy={middle}
        r={head ? 2.5 : 3.5}
        fill={merge && !head ? "var(--bg-canvas)" : color(row.color)}
        stroke={color(row.color)}
      />
    </svg>
  );
});

/**
 * Left column of the history: a search, the local changes, the work still open and the whole
 * history as a graph, in one list that the arrows walk through. Enter opens the changes.
 */
export function HistoryNav({
  data,
  fronts,
  reach,
  open,
  commits,
  branch,
  query,
  selection,
  highlight,
  taskOf,
  reveal,
  tools,
  onQuery,
  onBranch,
  onSelect,
  onCommitMenu,
  onExpand,
  commitFiles,
}: {
  data: GitSnapshot;
  fronts: Fronts;
  reach: Reach;
  /** The work still open, already filtered by the search. */
  open: Front[];
  /** The history, already filtered by branch and search. */
  commits: GitCommit[];
  branch: string | null;
  query: string;
  selection: string;
  /** Commits of the selected line of work, marked in the graph. */
  highlight: Set<string>;
  taskOf: Map<string, Task>;
  /** Bumped to scroll the selection into view and focus it. */
  reveal: number;
  tools: ReactNode;
  onQuery: (query: string) => void;
  onBranch: (name: string | null) => void;
  onSelect: (key: string) => void;
  /** Right click on a commit. */
  onCommitMenu: (event: MouseEvent<HTMLElement>, commit: GitCommit) => void;
  onExpand: () => void;
  /** A commit's changed files, for the count in its card. */
  commitFiles: (id: string) => Promise<FileDiff[]>;
}) {
  const list = useRef<HTMLDivElement>(null);
  const graph = useMemo(() => commitGraph(commits), [commits]);
  const lanes = Math.min(
    maxLanes,
    Math.max(1, ...graph.map((row) => row.laneCount)),
  );
  const graphWidth = lanes * laneWidth + 8;
  const local = data.branches.map((b) => b.name);
  const working = data.workingChanges.length;
  const searching = query.trim() !== "";
  const showWorking = !searching || t("local changes").includes(query.trim());
  const keys = [
    ...(showWorking ? ["working"] : []),
    ...open.map((f) => f.key),
    ...commits.map((c) => `commit:${c.id}`),
  ];
  const tabStop = keys.includes(selection) ? selection : keys[0];
  const item = (key: string) =>
    list.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
  useEffect(() => {
    if (!reveal) return;
    const row = item(selection);
    row?.scrollIntoView({ block: "center" });
    row?.focus({ preventScroll: true });
  }, [reveal]);

  function move(event: KeyboardEvent<HTMLElement>, fromSearch: boolean) {
    const index = keys.indexOf(selection);
    const step =
      event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowUp"
          ? -1
          : fromSearch
            ? 0
            : event.key === "PageDown"
              ? 10
              : event.key === "PageUp"
                ? -10
                : event.key === "Home"
                  ? -keys.length
                  : event.key === "End"
                    ? keys.length
                    : 0;
    if (event.key === "Enter" && !fromSearch) {
      event.preventDefault();
      onExpand();
      return;
    }
    if (!step || !keys.length) return;
    event.preventDefault();
    const next =
      keys[
        Math.max(0, Math.min(keys.length - 1, (index < 0 ? -1 : index) + step))
      ];
    onSelect(next);
    const row = item(next);
    if (!fromSearch) row?.focus();
    row?.scrollIntoView({ block: "nearest" });
  }

  return (
    <nav className="history-nav" aria-label={t("History")}>
      <div className="history-tools">
        <label className="notes-search">
          <Icon name="search" size={13} />
          <input
            aria-label={t("Search commits, tasks or branches")}
            placeholder={t("Search commits, tasks or branches")}
            value={query}
            spellCheck={false}
            onChange={(event) => onQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.stopPropagation();
                onQuery("");
                return;
              }
              move(event, true);
            }}
          />
        </label>
        {tools}
      </div>
      <div
        ref={list}
        className="history-list scroll"
        onKeyDown={(event) => {
          if (event.target instanceof HTMLElement && event.target.dataset.key)
            move(event, false);
        }}
      >
        {showWorking && (
          <section className="history-section">
            <h3>{t("Now")}</h3>
            <button
              type="button"
              data-key="working"
              tabIndex={tabStop === "working" ? 0 : -1}
              className={`history-item ${selection === "working" ? "selected" : ""}`}
              aria-current={selection === "working" || undefined}
              onClick={() => onSelect("working")}
            >
              <span className="history-lead">
                <PendingRing clean={working === 0} />
              </span>
              <span className="history-main">
                <span className="history-title">{t("Local changes")}</span>
                <span className="history-sub">
                  <span className={`tag ${working ? "warn" : "muted"}`}>
                    {working === 0
                      ? t("Nothing pending")
                      : working === 1
                        ? t("1 uncommitted file")
                        : t("{0} uncommitted files", [working])}
                  </span>
                  {data.currentBranch && (
                    <code className="truncate">{data.currentBranch}</code>
                  )}
                </span>
              </span>
            </button>
          </section>
        )}
        {open.length > 0 && (
          <section className="history-section">
            <h3>
              {t("In progress")}{" "}
              <span className="history-count">{open.length}</span>
            </h3>
            {open.map((front) => (
              <button
                key={front.key}
                type="button"
                data-key={front.key}
                tabIndex={tabStop === front.key ? 0 : -1}
                className={`history-item ${selection === front.key ? "selected" : ""}`}
                aria-current={selection === front.key || undefined}
                onClick={() => onSelect(front.key)}
              >
                <span className="history-lead">
                  {front.task ? (
                    <Glyph who={front.task.assignee} />
                  ) : (
                    <Icon
                      name={
                        front.key.startsWith("pr:") ? "pullRequest" : "branch"
                      }
                      size={12}
                    />
                  )}
                </span>
                <span className="history-main">
                  <span
                    className={`history-title ${front.task || front.key.startsWith("pr:") ? "" : "mono"}`}
                  >
                    {frontTitle(front)}
                  </span>
                  <span className="history-sub">
                    <StateTags front={front} fronts={fronts} reach={reach} />
                  </span>
                </span>
              </button>
            ))}
          </section>
        )}
        <section className="history-section">
          <div className="history-section-head">
            <h3>
              {t("Timeline")}{" "}
              <span className="history-count">{commits.length}</span>
            </h3>
            <Select
              size="sm"
              className={`branch-filter ${branch ? "on" : ""}`}
              label={t("Branch")}
              value={branch ?? "*"}
              options={[
                { value: "*", label: t("All branches") },
                ...local.map((name) => ({ value: name, label: name })),
              ]}
              onChange={(value) => onBranch(value === "*" ? null : value)}
            />
          </div>
          {commits.length === 0 && (
            <p className="history-note">
              {searching
                ? t(
                    "No commits match “{0}”. Search by title, task, author or the first characters of the hash.",
                    [query.trim()],
                  )
                : t("The history shows up here after the first commit.")}
            </p>
          )}
          <div
            className="history-timeline"
            style={{ ["--graph" as string]: `${graphWidth}px` }}
          >
            {commits.map((c, index) => {
              const row = graph[index];
              const key = `commit:${c.id}`;
              const task = taskOf.get(c.id);
              return (
                <CommitPeek
                  key={c.id}
                  commit={c}
                  files={() => commitFiles(c.id)}
                  refs={
                    <RefBadges
                      refs={c.refs}
                      tint={color(row.color)}
                      local={local}
                      main={data.mainBranch}
                    />
                  }
                >
                  {(peek) => (
                    <button
                      {...peek}
                      type="button"
                      data-key={key}
                      tabIndex={tabStop === key ? 0 : -1}
                      className={`history-row ${selection === key ? "selected" : ""} ${highlight.has(c.id) ? "in-front" : ""} ${c.parents.length > 1 ? "merge" : ""}`}
                      aria-current={selection === key || undefined}
                      aria-label={`${c.subject}, ${c.author}, ${when(c.date)}`}
                      onClick={() => onSelect(key)}
                      onContextMenu={(event) => onCommitMenu(event, c)}
                      onDoubleClick={onExpand}
                    >
                      <GraphCell
                        row={row}
                        width={graphWidth}
                        head={c.refs.some((r) => r.startsWith("HEAD"))}
                      />
                      <span className="history-main">
                        <span className="history-title truncate">
                          {c.subject}
                        </span>
                        <span className="history-sub">
                          <RefBadges
                            refs={c.refs}
                            tint={color(row.color)}
                            local={local}
                            main={data.mainBranch}
                            limit={1}
                          />
                          {task ? (
                            <span className="history-task" title={task.title}>
                              <Glyph who={task.assignee} />
                              <span className="truncate">{task.title}</span>
                            </span>
                          ) : (
                            <span className="history-author truncate">
                              {c.author}
                            </span>
                          )}
                          <time>{when(c.date)}</time>
                        </span>
                      </span>
                    </button>
                  )}
                </CommitPeek>
              );
            })}
          </div>
        </section>
      </div>
    </nav>
  );
}
