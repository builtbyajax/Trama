import { locale, t } from "./i18n";
export type TaskStatus = "backlog" | "todo" | "inProgress" | "review" | "done";
export type TaskAssignee = "user" | "agent";
export interface Project {
  id: string;
  name: string;
  repositoryPath: string | null;
  /** Index into the project palette. */
  color: number;
  /** The project's notes folder (its vault), as an absolute path. */
  documentsFolder: string | null;
  /** A glyph from the project icon set; without one the project shows its initial. */
  icon: string | null;
  createdAt: number;
}
export interface TaskInput {
  projectId: string;
  title: string;
  /** The briefing, in Markdown: what the agent receives. */
  details: string;
  category: string;
  assignee: TaskAssignee;
  status: TaskStatus;
  agentSummary: string | null;
  repositoryBranch: string | null;
  commitHash: string | null;
  pullRequestUrl: string | null;
  pullRequestNumber: number | null;
  /** The project goal the task counts toward. */
  goalId: string | null;
}
export interface Task extends TaskInput {
  id: string;
  /** Order inside the task's column, ascending. */
  position: number;
  createdAt: number;
  updatedAt: number;
  /** When it was done and went to the Archive; null while it is on the board. */
  archivedAt: number | null;
  checksTotal: number;
  checksDone: number;
  messageCount: number;
  documentCount: number;
}
export interface TaskMessage {
  id: string;
  taskId: string;
  author: TaskAssignee;
  body: string;
  createdAt: number;
}
export interface TaskCheck {
  id: string;
  taskId: string;
  title: string;
  isComplete: boolean;
}
/** A private note of the person. The agent never reads or changes notes. */
export interface TaskNote {
  id: string;
  taskId: string;
  body: string;
  createdAt: number;
}
export type TaskEventKind =
  | "created"
  | "status"
  | "assignee"
  | "category"
  | "title"
  | "details"
  | "summary"
  | "branch"
  | "commit"
  | "pullRequest"
  | "document"
  | "documentRemoved"
  | "goal";
/** Something that happened to a task; `actor` is null for events older than the activity. */
export interface TaskEvent {
  id: string;
  taskId: string;
  actor: TaskAssignee | null;
  kind: TaskEventKind;
  value: string | null;
  createdAt: number;
}
/** A note attached to a task; `path` is relative to the project's notes folder. */
export interface TaskDocument {
  taskId: string;
  path: string;
  actor: TaskAssignee;
  createdAt: number;
}
export interface TaskDetails {
  task: Task;
  messages: TaskMessage[];
  checks: TaskCheck[];
  notes: TaskNote[];
  events: TaskEvent[];
  documents: TaskDocument[];
}
/** A note whose text matches a search, with the matching line. */
export interface DocumentHit {
  path: string;
  excerpt: string;
}
/** Markdown files and images of the notes folder, relative to it with `/` separators. */
export interface DocumentListing {
  root: string;
  notes: string[];
  images: string[];
  /** Every folder, including those without notes. */
  folders: string[];
  /** The notes changed last, newest first; `modified` in seconds. */
  recent: { path: string; modified: number }[];
}
export interface DocumentFile {
  path: string;
  text: string;
  /** What a save must name, so changes made outside the app are not overwritten. */
  version: string;
  modified: number;
}
export interface Category {
  projectId: string;
  name: string;
  taskCount: number;
}
export interface Snapshot {
  source: "database" | "missing";
  databasePath: string;
  projects: Project[];
  tasks: Task[];
  categories: Category[];
  documents: TaskDocument[];
  goals: Goal[];
}
/** What a group of a project's tasks is for; its progress is how many of them are done. */
export interface Goal {
  id: string;
  projectId: string;
  name: string;
  description: string;
  /** A day, `YYYY-MM-DD`. */
  targetDate: string | null;
  /** When the person concluded it. */
  completedAt: number | null;
  createdAt: number;
}
/** Done tasks over all of the goal's tasks, backlog included. */
export function goalProgress(goal: Goal, tasks: Task[]) {
  let total = 0;
  let done = 0;
  for (const task of tasks)
    if (task.goalId === goal.id) {
      total++;
      if (task.status === "done") done++;
    }
  return { total, done };
}
/** A database file; the app shows one at a time. */
export interface Workspace {
  /** Empty for the one Trama creates on its own: see `workspaceName`. */
  name: string;
  path: string;
  /** The file isn't where the list says. */
  missing: boolean;
  /** Index into the project palette, saved in the workspace's own file; none is the plain mark. */
  color: number | null;
  icon: string | null;
}
export interface Workspaces {
  active: string;
  /** `TRAMA_DB` chose the database, so it can't be switched. */
  pinned: boolean;
  /** Where Trama keeps its own database, offered for new workspaces. */
  defaultFolder: string;
  workspaces: Workspace[];
}
export interface SearchResult {
  id: string;
  kind: "task" | "message";
  projectId: string;
  taskId: string;
  title: string;
  excerpt: string;
}
export interface GitCommit {
  id: string;
  shortId: string;
  parents: string[];
  subject: string;
  body: string;
  author: string;
  date: number;
  refs: string[];
}
export interface GitBranch {
  name: string;
  commitId: string;
  upstream: string | null;
  aheadOfMain: number | null;
  behindMain: number | null;
}
export interface WorkingChange {
  path: string;
  oldPath: string | null;
  indexStatus: string;
  worktreeStatus: string;
  change: string;
  isStaged: boolean;
  isUntracked: boolean;
}
export interface GitSnapshot {
  root: string;
  currentBranch: string | null;
  mainBranch: string | null;
  branches: GitBranch[];
  commits: GitCommit[];
  workingChanges: WorkingChange[];
  webUrl: string | null;
}
export interface DiffLine {
  kind: "context" | "addition" | "deletion";
  oldNumber: number | null;
  newNumber: number | null;
  text: string;
  missingNewline: boolean;
}
export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  section: string;
  lines: DiffLine[];
}
export interface FileDiff {
  path: string;
  oldPath: string | null;
  change: string;
  isBinary: boolean;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}
export interface CommitDetails {
  fileDiffs: FileDiff[];
  diff: string;
}
export interface PullRequest {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  url: string;
  headBranch: string;
  baseBranch: string;
  reviewDecision: string | null;
  checks: string[];
  mergeCommit: string | null;
}
export interface PullRequests {
  items: PullRequest[];
  unavailable: string | null;
}
export type GitFocus =
  | { kind: "commit"; id: string }
  | { kind: "pr"; number: number }
  | { kind: "task"; id: string };
/** How the Board tab shows tasks: columns, or groups of rows. */
export type BoardView = "kanban" | "list";
/** The board's columns, left to right. Done tasks leave the board for the Archive. */
export const boardStatuses: TaskStatus[] = [
  "backlog",
  "todo",
  "inProgress",
  "review",
];
export const statusTitle: Record<TaskStatus, string> = {
  backlog: t("Backlog"),
  todo: t("To do"),
  inProgress: t("Working"),
  review: t("In review"),
  done: t("Done"),
};
export const isAgentWorking = (task: Task) =>
  task.assignee === "agent" && task.status === "inProgress";
export const dateTime = (value: number) =>
  new Date(value * 1000).toLocaleString(locale, {
    dateStyle: "short",
    timeStyle: "short",
  });
export const emptyInput = (
  projectId: string,
  status: TaskStatus = "todo",
  category = "Feature",
): TaskInput => ({
  projectId,
  title: "",
  details: "",
  category,
  assignee: "user",
  status,
  agentSummary: null,
  repositoryBranch: null,
  commitHash: null,
  pullRequestUrl: null,
  pullRequestNumber: null,
  goalId: null,
});

/** Column order: manual position first, newest update as the tie-breaker. */
export const byPosition = (a: Task, b: Task) =>
  a.position - b.position || b.updatedAt - a.updatedAt;

/** "now", "5 min ago", "2 h ago", "yesterday", "3 days ago", then a short date. */
export function ago(value: number, now = Date.now() / 1000) {
  const seconds = Math.max(0, now - value);
  if (seconds < 60) return t("now");
  if (seconds < 3600) return t("{0} min ago", [Math.floor(seconds / 60)]);
  const then = new Date(value * 1000);
  const today = new Date(now * 1000);
  const days = Math.round(
    (new Date(today.toDateString()).getTime() -
      new Date(then.toDateString()).getTime()) /
      86_400_000,
  );
  if (days === 0) return t("{0} h ago", [Math.floor(seconds / 3600)]);
  if (days === 1) return t("yesterday");
  if (days < 7) return t("{0} days ago", [days]);
  return then.toLocaleDateString(locale, { day: "numeric", month: "short" });
}
