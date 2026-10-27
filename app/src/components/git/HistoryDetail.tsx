import { useLayoutEffect, useRef, useState } from "react";
import {
  commitPr,
  type Front,
  type Fronts,
  type Reach,
} from "../../lib/fronts";
import { totals } from "../../lib/diff";
import {
  dateTime,
  statusTitle,
  type FileDiff,
  type GitCommit,
  type GitSnapshot,
  type PullRequest,
  type Task,
} from "../../lib/types";
import { Glyph } from "../BoardFilters";
import { Icon, StatusIcon } from "../Icon";
import {
  CommitPeek,
  FileRows,
  PendingRing,
  RefBadges,
  StateTags,
  frontTitle,
  unpushed,
  when,
} from "./parts";
import { t, type Key } from "../../lib/i18n";
import { isMac } from "../../lib/shortcuts";

export type Selected =
  | { kind: "working" }
  | { kind: "front"; front: Front }
  | {
      kind: "commit";
      commit: GitCommit;
      task: Task | null;
      front: Front | null;
    };

export interface DetailActions {
  onExpand: (files: FileDiff[], path?: string) => void;
  onOpenTask: (task: Task) => void;
  onSelect: (key: string) => void;
  onOpenPullRequest: (pr: PullRequest) => void;
  commitFiles: (id: string) => Promise<FileDiff[]>;
}

type Stop = {
  state: "done" | "here" | "skip" | "";
  name: string;
  caption: string;
};

/** This computer, named as its system does. */
const onThisComputer = () => (isMac ? t("On your Mac") : t("On your PC"));

/** `one` is the text for 1; `many` takes the count as {0}. */
const plural = (n: number, one: Key, many: Key) =>
  n === 1 ? t(one) : t(many, [n]);

function prStop(pr: PullRequest | null, inMain: boolean, main: string): Stop {
  if (pr?.state === "open")
    return {
      state: "here",
      name: t("Pull request"),
      caption: t("#{0} open", [pr.number]),
    };
  if (pr?.state === "merged")
    return {
      state: "done",
      name: t("Pull request"),
      caption: t("#{0} merged", [pr.number]),
    };
  if (pr)
    return {
      state: "",
      name: t("Pull request"),
      caption: t("#{0} closed", [pr.number]),
    };
  return inMain
    ? {
        state: "skip",
        name: t("Pull request"),
        caption: t("Straight to {0}", [main]),
      }
    : { state: "", name: t("Pull request"), caption: t("None open") };
}

/**
 * The places a change passes through on its way to main (this computer, a commit, the remote, a pull
 * request, main) and where the selected work is among them.
 */
function stops(
  selected: Selected,
  data: GitSnapshot,
  fronts: Fronts,
  reach: Reach,
): Stop[] {
  const main = fronts.main ?? "main";
  const working = data.workingChanges.length;
  const mainStop = (reached: boolean, caption = t("Yes")): Stop =>
    reached
      ? { state: "done", name: t("On {0}", [main]), caption }
      : {
          state: "",
          name: t("On {0}", [main]),
          caption: t("Not yet"),
        };
  const sentStop = (commits: GitCommit[]): Stop => {
    if (!reach.hasRemote)
      return {
        state: "skip",
        name: t("Pushed"),
        caption: t("No remote repository"),
      };
    const local = unpushed(commits, reach) ?? 0;
    if (!local)
      return {
        state: "done",
        name: t("Pushed"),
        caption: t("On the remote"),
      };
    return {
      state: "here",
      name: t("Pushed"),
      caption:
        local === commits.length
          ? isMac
            ? t("Only on your Mac")
            : t("Only on your PC")
          : t("{0} of {1} on the remote", [
              commits.length - local,
              commits.length,
            ]),
    };
  };
  if (selected.kind === "working")
    return [
      {
        state: working ? "here" : "done",
        name: onThisComputer(),
        caption: working
          ? plural(working, "1 uncommitted file", "{0} uncommitted files")
          : t("Nothing pending"),
      },
      { state: "skip", name: "Commit", caption: "—" },
      { state: "skip", name: t("Pushed"), caption: "—" },
      { state: "skip", name: t("Pull request"), caption: "—" },
      { state: "skip", name: t("On {0}", [main]), caption: "—" },
    ];
  if (selected.kind === "front") {
    const { front } = selected;
    const here = working > 0 && front.branch === data.currentBranch;
    const n = front.commits.length;
    return [
      here
        ? {
            state: "here",
            name: onThisComputer(),
            caption: plural(
              working,
              "1 uncommitted file on this branch",
              "{0} uncommitted files on this branch",
            ),
          }
        : {
            state: "done",
            name: onThisComputer(),
            caption: t("Nothing pending"),
          },
      n
        ? {
            state: "done",
            name: "Commits",
            caption: plural(n, "1 commit", "{0} commits"),
          }
        : { state: "", name: "Commits", caption: t("None yet") },
      n
        ? sentStop(front.commits)
        : { state: "", name: t("Pushed"), caption: "—" },
      prStop(front.pr, Boolean(front.inMain), main),
      mainStop(Boolean(front.inMain)),
    ];
  }
  const { commit, front } = selected;
  const inMain = reach.inMain.has(commit.id);
  const found = commitPr(commit, front, fronts);
  const head = data.branches.find((b) => b.name === fronts.main)?.commitId;
  return [
    { state: "done", name: "Commit", caption: when(commit.date) },
    sentStop([commit]),
    found && !found.pr
      ? {
          state: "done",
          name: t("Pull request"),
          caption: t("#{0} merged", [found.number]),
        }
      : prStop(found?.pr ?? null, inMain, main),
    mainStop(inMain, commit.id === head ? t("Tip of {0}", [main]) : t("Yes")),
  ];
}

function Route({ list }: { list: Stop[] }) {
  return (
    <ol className="route" aria-label={t("Where it is")}>
      {list.map((stop) => (
        <li key={stop.name} className={`route-stop ${stop.state}`}>
          <span className="route-rail" aria-hidden="true">
            <span className="route-line before" />
            <span className="route-dot" />
            <span className="route-line after" />
          </span>
          <span className="route-name">{stop.name}</span>
          <span className="route-caption">{stop.caption}</span>
        </li>
      ))}
    </ol>
  );
}

function AgentSummary({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  // "Mostrar tudo" only when the three lines actually cut the summary.
  useLayoutEffect(() => {
    const p = textRef.current;
    if (!p || open) return;
    const measure = () => setLong(p.scrollHeight > p.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(p);
    return () => observer.disconnect();
  }, [text, open]);
  return (
    <div className={`agent-summary ${open ? "open" : ""}`}>
      <span className="agent-summary-who">
        <Glyph who="agent" />
        {t("Agent's summary")}
      </span>
      <p ref={textRef}>{text}</p>
      {(long || open) && (
        <button
          type="button"
          className="agent-summary-more"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? t("Show less") : t("Show all")}
        </button>
      )}
    </div>
  );
}

/**
 * Right side of the history: what was selected, where it is on the way to main and the files it
 * changed, as a list to scan; the changed text opens over the whole window.
 */
export function HistoryDetail({
  selected,
  data,
  fronts,
  reach,
  files,
  actions,
}: {
  selected: Selected;
  data: GitSnapshot;
  fronts: Fronts;
  reach: Reach;
  files: { value?: FileDiff[]; error: string; loading: boolean };
  actions: DetailActions;
}) {
  const list = files.value ?? [];
  const sum = totals(list);
  let mark, title, action, meta, summary;
  let label = t("in the commit");
  if (selected.kind === "working") {
    mark = (
      <span className="detail-mark">
        <PendingRing clean={data.workingChanges.length === 0} />
      </span>
    );
    title = t("Local changes");
    label = t("uncommitted");
    meta = (
      <span>
        {data.currentBranch ? (
          <>
            {t("Not committed yet on")} <code>{data.currentBranch}</code>
          </>
        ) : (
          t("Detached HEAD, not committed yet")
        )}
      </span>
    );
  } else if (selected.kind === "front") {
    const { front } = selected;
    const task = front.task;
    mark = (
      <span className="detail-mark">
        {task ? (
          <Glyph who={task.assignee} profileId={task.agentProfileId} />
        ) : (
          <Icon
            name={front.key.startsWith("pr:") ? "pullRequest" : "branch"}
            size={14}
          />
        )}
      </span>
    );
    title = frontTitle(front);
    label =
      front.commits.length > 1
        ? t("added up on the branch")
        : t("in the commit");
    action = task ? (
      <button
        type="button"
        className="button small"
        onClick={() => actions.onOpenTask(task)}
      >
        {t("Open task")}
      </button>
    ) : front.pr ? (
      <button
        type="button"
        className="button small"
        onClick={() => actions.onOpenPullRequest(front.pr!)}
      >
        <Icon name="external" size={13} />
        {t("Open on GitHub")}
      </button>
    ) : null;
    meta = (
      <>
        {task && (
          <span className="front-status">
            <StatusIcon status={task.status} size={13} />
            {statusTitle[task.status]}
          </span>
        )}
        <StateTags front={front} fronts={fronts} reach={reach} />
        {front.commits.length > 0 && (
          <span>
            {plural(
              front.commits.length,
              "1 commit marked in the timeline",
              "{0} commits marked in the timeline",
            )}
          </span>
        )}
      </>
    );
    if (task?.agentSummary) summary = <AgentSummary text={task.agentSummary} />;
  } else {
    const { commit, task } = selected;
    const merge = commit.parents.length > 1;
    mark = (
      <CommitPeek
        commit={commit}
        files={() => actions.commitFiles(commit.id)}
        refs={
          <RefBadges
            refs={commit.refs}
            tint="#9ea3ff"
            local={data.branches.map((b) => b.name)}
            main={data.mainBranch}
          />
        }
      >
        {(peek) => (
          <span
            {...peek}
            className={`detail-mark commit-mark ${reach.inMain.has(commit.id) ? "main" : ""} ${merge ? "merge" : ""}`}
          >
            <i />
          </span>
        )}
      </CommitPeek>
    );
    title = commit.subject;
    meta = (
      <>
        <span title={dateTime(commit.date)}>
          {commit.author}, {when(commit.date)}
        </span>
        {task && (
          <button
            type="button"
            className="detail-task"
            onClick={() => actions.onSelect(`task:${task.id}`)}
          >
            <Glyph who={task.assignee} profileId={task.agentProfileId} />
            <span className="truncate">{task.title}</span>
          </button>
        )}
      </>
    );
  }
  return (
    <section className="history-detail" aria-label={t("Details")}>
      <header className="detail-head">
        <div className="detail-top">
          {mark}
          <h2>{title}</h2>
          {action}
        </div>
        <div className="detail-meta">{meta}</div>
        <Route list={stops(selected, data, fronts, reach)} />
        {summary}
      </header>
      <div className="detail-files scroll">
        <div className="detail-files-head">
          <strong>
            {files.loading
              ? t("Files")
              : plural(list.length, "1 file", "{0} files")}
          </strong>
          {!files.loading && list.length > 0 && (
            <>
              <span>{label}</span>
              <span className="diff-stats">
                <b>+{sum.additions}</b>
                <i>−{sum.deletions}</i>
              </span>
              <button
                type="button"
                className="button small"
                data-tooltip={t("Files next to the changed text  ↵")}
                onClick={() => actions.onExpand(list)}
              >
                <Icon name="expand" size={13} />
                {t("Expand")}
              </button>
            </>
          )}
        </div>
        {files.error ? (
          <p className="form-error" role="alert">
            {files.error}
          </p>
        ) : files.loading ? (
          <p className="section-empty">{t("Loading files…")}</p>
        ) : list.length ? (
          <FileRows
            files={list}
            onOpen={(path) => actions.onExpand(list, path)}
          />
        ) : (
          <p className="section-empty">
            {selected.kind === "working"
              ? t("No local changes.")
              : selected.kind === "front" && selected.front.commits.length === 0
                ? selected.front.gone
                  ? t("The branch {0} no longer exists in the repository.", [
                      selected.front.branch,
                    ])
                  : t("No commits of its own in the loaded history.")
                : t("No files changed.")}
          </p>
        )}
      </div>
    </section>
  );
}
