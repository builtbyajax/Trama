import { isArchived } from "./archive";
import { matchesPullRequest } from "./delivery";
import {
  byPosition,
  type GitCommit,
  type GitSnapshot,
  type Project,
  type PullRequest,
  type Task,
  type TaskStatus,
} from "./types";
import { t } from "./i18n";

/**
 * A line of work in the repository: a task with its branch, commits and PR, or a branch or PR
 * no task claims. `key` is "task:<id>", "branch:<name>" or "pr:<number>".
 */
export interface Front {
  key: string;
  task: Task | null;
  /** The task's branch or the branch itself; it may no longer exist (`gone`). */
  branch: string | null;
  gone: boolean;
  /** The commit the work ends at: the branch head or the task's recorded commit. */
  head: string | null;
  /** Commits that belong to this work, newest first, within the loaded history. */
  commits: GitCommit[];
  pr: PullRequest | null;
  /** Whether the work reached the integration branch and main; null when unknown. */
  inIntegration: boolean | null;
  inMain: boolean | null;
  /** Commits not in the integration branch yet; null when integrated or unknown. */
  ahead: number | null;
}
export interface FrontGroup {
  title: string;
  fronts: Front[];
}
export interface Fronts {
  /** The branch work is merged into first: develop when it exists, otherwise main. */
  integration: string | null;
  main: string | null;
  groups: FrontGroup[];
  /** The task each commit belongs to, for the timeline. */
  taskOf: Map<string, Task>;
  /** The PR each merge commit came from. */
  prOf: Map<string, PullRequest>;
}

const integrationNames = ["develop", "dev", "development"];
const groupOrder: [TaskStatus, string][] = [
  ["inProgress", t("In progress")],
  ["review", t("In review")],
  ["todo", t("To do")],
  ["done", t("Done|group")],
];
const limit = 60;

/** Every loaded commit reachable from `start`, itself included. */
function ancestors(byId: Map<string, GitCommit>, start: string | undefined) {
  const seen = new Set<string>();
  const pending = start ? [start] : [];
  while (pending.length) {
    const id = pending.pop()!;
    if (seen.has(id)) continue;
    const commit = byId.get(id);
    if (!commit) continue;
    seen.add(id);
    pending.push(...commit.parents);
  }
  return seen;
}

/**
 * Which loaded commits main already has and which a remote has, so each one can say whether it
 * was pushed and whether it got to main.
 */
export function reach(data: GitSnapshot) {
  const byId = new Map(data.commits.map((c) => [c.id, c]));
  const local = new Set(data.branches.map((b) => b.name));
  const main = data.branches.find((b) => b.name === data.mainBranch);
  const inMain = ancestors(byId, main?.commitId);
  const remoteHeads = data.commits.filter((c) =>
    c.refs.some((ref) => {
      const name = ref.replace("HEAD -> ", "");
      return (
        !ref.startsWith("tag: ") &&
        !local.has(name) &&
        name.includes("/") &&
        !name.endsWith("/HEAD")
      );
    }),
  );
  const pushed = new Set<string>();
  const pending = remoteHeads.map((c) => c.id);
  while (pending.length) {
    const id = pending.pop()!;
    if (pushed.has(id) || !byId.has(id)) continue;
    pushed.add(id);
    pending.push(...byId.get(id)!.parents);
  }
  return { inMain, pushed, hasRemote: remoteHeads.length > 0 };
}
export type Reach = ReturnType<typeof reach>;

export function buildFronts(
  data: GitSnapshot,
  prs: PullRequest[],
  project: Project,
  projectTasks: Task[],
): Fronts {
  const byId = new Map(data.commits.map((c) => [c.id, c]));
  const order = new Map(data.commits.map((c, i) => [c.id, i]));
  const heads = new Map(data.branches.map((b) => [b.name, b.commitId]));
  const names = data.branches.map((b) => b.name);
  const main = data.mainBranch;
  const integration =
    integrationNames.find((name) => heads.has(name)) ?? main ?? null;
  const mainSet = ancestors(byId, main ? heads.get(main) : undefined);
  const integrationSet =
    integration === main
      ? mainSet
      : ancestors(byId, integration ? heads.get(integration) : undefined);
  const sorted = (ids: Iterable<string>) =>
    [...ids]
      .filter((id) => byId.has(id))
      .sort((a, b) => order.get(a)! - order.get(b)!)
      .map((id) => byId.get(id)!);

  /**
   * The commits a branch added. Before it is integrated that is exactly what the integration
   * branch lacks. After, Git no longer knows where it began, so the first-parent line is walked
   * back until a merge, another branch's head or main: the usual shape of a short-lived branch.
   */
  function branchCommits(name: string, head: string) {
    if (!byId.has(head)) return { commits: [], ahead: null };
    if (name === main) {
      const line: GitCommit[] = [];
      for (
        let c = byId.get(head);
        c && line.length < 15;
        c = byId.get(c.parents[0])
      )
        line.push(c);
      return { commits: line, ahead: null };
    }
    const base = name === integration ? mainSet : integrationSet;
    if (!base.has(head)) {
      const own = [...ancestors(byId, head)].filter((id) => !base.has(id));
      return { commits: sorted(own).slice(0, limit), ahead: own.length };
    }
    const others = new Set(
      data.branches
        .filter((b) => b.name !== name && b.commitId !== head)
        .map((b) => b.commitId),
    );
    const stopAtMain = !mainSet.has(head);
    const line: GitCommit[] = [];
    for (let c = byId.get(head); c && line.length < limit;) {
      if (
        c.id !== head &&
        (c.parents.length > 1 ||
          others.has(c.id) ||
          (stopAtMain && mainSet.has(c.id)))
      )
        break;
      line.push(c);
      c = byId.get(c.parents[0]);
    }
    return { commits: line, ahead: null };
  }

  function relations(head: string | null, branch: string | null) {
    const known = Boolean(head && byId.has(head));
    const info = branch ? data.branches.find((b) => b.name === branch) : null;
    const inMain =
      info && info.aheadOfMain !== null
        ? info.aheadOfMain === 0
        : known
          ? mainSet.has(head!)
          : branch === main && Boolean(info)
            ? true
            : null;
    const inIntegration =
      integration === main ? inMain : known ? integrationSet.has(head!) : null;
    return { inMain, inIntegration };
  }

  const prFor = (match: (pr: PullRequest) => boolean) => {
    const found = prs.filter(match);
    return found.find((p) => p.state === "open") ?? found[0] ?? null;
  };
  const taskOf = new Map<string, Task>();
  const claimed = new Set<string>();
  const claimedPrs = new Set<number>();
  const taskFronts: Front[] = [];
  const tasks = projectTasks
    .filter(
      (t) =>
        (t.repositoryBranch ||
          t.commitHash ||
          t.pullRequestNumber ||
          t.pullRequestUrl) &&
        !isArchived(t, project, names),
    )
    .sort(byPosition);
  for (const task of tasks) {
    const branch = task.repositoryBranch;
    const branchHead = branch ? heads.get(branch) : undefined;
    // On develop or main itself the branch says nothing about the task: only its commit does.
    const shared = branch === integration || branch === main;
    const found =
      branch && branchHead && !shared
        ? branchCommits(branch, branchHead)
        : { commits: [], ahead: null };
    let commits = found.commits;
    const hash = task.commitHash?.toLowerCase();
    const recorded = hash
      ? data.commits.find((c) => c.id.startsWith(hash))
      : undefined;
    if (recorded && !commits.includes(recorded))
      commits = sorted([...commits.map((c) => c.id), recorded.id]);
    const head = (shared ? null : branchHead) ?? recorded?.id ?? null;
    const pr = prFor((p) => matchesPullRequest(task, p));
    if (branch && branchHead && !shared) claimed.add(branch);
    if (pr) claimedPrs.add(pr.number);
    for (const c of commits) {
      const current = taskOf.get(c.id);
      if (!current || (current.status === "done" && task.status !== "done"))
        taskOf.set(c.id, task);
    }
    taskFronts.push({
      key: `task:${task.id}`,
      task,
      branch,
      gone: Boolean(branch && !branchHead),
      head,
      commits,
      pr,
      ...relations(head, branchHead && !shared ? branch : null),
      ahead: found.ahead,
    });
  }
  const groups: FrontGroup[] = groupOrder
    .map(([status, title]) => ({
      title,
      fronts: taskFronts.filter((f) => f.task!.status === status),
    }))
    .filter((g) => g.fronts.length > 0);

  // Branches and PRs no task claims: integration and main first, then by latest commit.
  const rank = (name: string) =>
    name === integration
      ? -2
      : name === main
        ? -1
        : (order.get(heads.get(name)!) ?? 1e9);
  const loose: Front[] = data.branches
    .filter((b) => !claimed.has(b.name))
    .sort((a, b) => rank(a.name) - rank(b.name))
    .map((b) => {
      const found = branchCommits(b.name, b.commitId);
      const pr = prFor((p) => p.headBranch === b.name);
      if (pr) claimedPrs.add(pr.number);
      return {
        key: `branch:${b.name}`,
        task: null,
        branch: b.name,
        gone: false,
        head: b.commitId,
        commits: found.commits,
        pr,
        ...relations(b.commitId, b.name),
        ahead: found.ahead,
      };
    });
  for (const pr of prs)
    if (pr.state === "open" && !claimedPrs.has(pr.number))
      loose.push({
        key: `pr:${pr.number}`,
        task: null,
        branch: pr.headBranch,
        gone: false,
        head: null,
        commits: [],
        pr,
        inIntegration: null,
        inMain: null,
        ahead: null,
      });
  if (loose.length) groups.push({ title: t("No task"), fronts: loose });
  const prOf = new Map<string, PullRequest>();
  for (const pr of prs)
    if (pr.state === "merged" && pr.mergeCommit) prOf.set(pr.mergeCommit, pr);
  return { integration, main, groups, taskOf, prOf };
}

/** Where the work stands, in a few words, for the list and the detail head. */
export function frontState(front: Front, fronts: Fronts) {
  if (front.gone)
    return front.task?.status === "done"
      ? { label: t("Branch removed"), tone: "muted" }
      : { label: t("Branch doesn't exist"), tone: "warn" };
  if (!front.task && front.branch && front.branch === fronts.main)
    return { label: t("Main"), tone: "muted" };
  if (!front.task && front.branch && front.branch === fronts.integration)
    return front.ahead
      ? {
          label: t("{0} ahead of {1}", [front.ahead, fronts.main]),
          tone: "progress",
        }
      : { label: t("Same as {0}", [fronts.main]), tone: "muted" };
  if (front.inMain) return { label: t("In {0}", [fronts.main]), tone: "ok" };
  if (front.inIntegration && fronts.integration !== fronts.main)
    return { label: t("In {0}", [fronts.integration]), tone: "ok" };
  if (front.ahead)
    return {
      label:
        front.ahead === 1
          ? t("1 new commit")
          : t("{0} new commits", [front.ahead]),
      tone: "progress",
    };
  if (front.pr) return { label: `PR #${front.pr.number}`, tone: "progress" };
  return null;
}

/** The PR number GitHub writes in the subject: "(#28)" after a squash, "Merge pull request #28" for
 *  a merge commit. Only a fallback when the PR list doesn't name the commit. */
const subjectPr = (subject: string) =>
  Number(
    (subject.match(/\(#(\d+)\)\s*$/) ??
      subject.match(/^Merge pull request #(\d+)\b/))?.[1],
  ) || null;

/**
 * The PR a commit came from: the one GitHub merged it with, the one of its branch or task, or the
 * number in its subject, which has no PR details.
 */
export function commitPr(
  commit: GitCommit,
  front: Front | null,
  fronts: Fronts,
): { pr: PullRequest | null; number: number } | null {
  const pr = fronts.prOf.get(commit.id);
  if (pr) return { pr, number: pr.number };
  const number = subjectPr(commit.subject);
  if (number) return { pr: null, number };
  return front?.pr ? { pr: front.pr, number: front.pr.number } : null;
}
