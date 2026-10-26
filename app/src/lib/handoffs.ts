import {
  ago,
  isDraft,
  statusTitle,
  type Task,
  type TaskAssignee,
  type TaskEvent,
  type TaskStatus,
} from "./types";
import { t } from "./i18n";

export const DAY = 86_400;

/**
 * Rebuilds who held each task over time from its creation, status and assignee events.
 * A task in review waits for you whoever delivered it; otherwise it is with its assignee,
 * and an agent task still "A fazer" sits in the agent's queue. Drafts and done tasks are
 * off the board, so they have no holder.
 */
export type Phase = "work" | "queue" | "wait";
export interface Segment {
  holder: TaskAssignee;
  phase: Phase;
  from: number;
  /** null while it still runs. */
  to: number | null;
}
export interface Step {
  at: number;
  actor: TaskAssignee | null;
  text: string;
}
export interface Thread {
  task: Task;
  segments: Segment[];
  steps: Step[];
  doneAt: number | null;
  /** The running segment, if the task is on the board now. */
  current: Segment | null;
}
type State = { status: TaskStatus; assignee: TaskAssignee };

const placeOf = ({
  status,
  assignee,
}: State): Pick<Segment, "holder" | "phase"> | null => {
  if (isDraft(status) || status === "done") return null;
  if (status === "review") return { holder: "user", phase: "wait" };
  if (assignee === "agent")
    return { holder: "agent", phase: status === "todo" ? "queue" : "work" };
  return { holder: "user", phase: "work" };
};

const other = (who: TaskAssignee): TaskAssignee =>
  who === "agent" ? "user" : "agent";

function describe(
  event: TaskEvent,
  before: State,
  after: State,
): string | null {
  const who = event.actor;
  const you = who === "user";
  const agent = who === "agent";
  if (event.kind === "created")
    return you
      ? t("You created the task")
      : agent
        ? t("The agent created the task")
        : t("Task created");
  if (event.kind === "assignee") {
    if (before.assignee === after.assignee) return null;
    if (after.assignee === "agent")
      return agent ? t("The agent took the task") : t("Handed to the agent");
    return agent
      ? t("The agent handed the task back to you")
      : t("You took the task");
  }
  if (before.status === after.status) return null;
  switch (after.status) {
    case "todo":
      if (isDraft(before.status))
        return you ? t("You added it to the board") : t("Joined the board");
      if (before.status === "review")
        return you
          ? t("You sent it back for changes")
          : t("Sent back for changes");
      return t("Back to “{0}”", [statusTitle.todo]);
    case "inProgress":
      return agent
        ? t("The agent started")
        : you
          ? t("You started")
          : t("Moved to “{0}”", [statusTitle.inProgress]);
    case "review":
      return agent
        ? t("The agent delivered for review")
        : you
          ? t("You moved it to review")
          : t("Reached review");
    case "done":
      return you
        ? t("You completed it")
        : agent
          ? t("The agent completed it")
          : t("Done|task");
    default:
      return t("Back to drafts");
  }
}

export function weave(task: Task, events: TaskEvent[]): Thread {
  const statuses = events.filter((e) => e.kind === "status" && e.value);
  const assignees = events.filter((e) => e.kind === "assignee" && e.value);
  // Events keep only the new value, so the starting state is inferred: a task whose first move
  // was onto "A fazer" began as a draft; otherwise it began there. One assignee change implies the
  // other assignee before it.
  let state: State = {
    status: statuses.length
      ? statuses[0].value === "todo"
        ? "preparing"
        : "todo"
      : task.status,
    assignee: assignees.length
      ? other(assignees[0].value as TaskAssignee)
      : task.assignee,
  };
  const created =
    events.find((e) => e.kind === "created")?.createdAt ?? task.createdAt;
  const segments: Segment[] = [];
  const steps: Step[] = [];
  let doneAt: number | null = null;
  const open = (at: number) => {
    const place = placeOf(state);
    const last = segments.at(-1);
    if (last && last.to === null) {
      if (place && last.holder === place.holder && last.phase === place.phase)
        return;
      last.to = at;
    }
    if (place) segments.push({ ...place, from: at, to: null });
  };
  open(created);
  for (const event of events) {
    const before = state;
    if (event.kind === "status" && event.value)
      state = { ...state, status: event.value as TaskStatus };
    else if (event.kind === "assignee" && event.value)
      state = { ...state, assignee: event.value as TaskAssignee };
    const text = describe(event, before, state);
    if (text) steps.push({ at: event.createdAt, actor: event.actor, text });
    open(event.createdAt);
    if (state.status === "done" && before.status !== "done")
      doneAt = event.createdAt;
  }
  if (!steps.length)
    steps.push({ at: created, actor: null, text: t("Task created") });
  // Tasks older than the activity log reach their current state with no event; trust the task.
  if (task.status === "done" && doneAt === null) {
    const last = segments.at(-1);
    if (last && last.to === null) last.to = task.updatedAt;
    doneAt = task.updatedAt;
  }
  const last = segments.at(-1);
  return {
    task,
    segments,
    steps,
    doneAt,
    current: last && last.to === null && !isDraft(task.status) ? last : null,
  };
}

/** "45 min", "9 h", "2 d 12 h". */
export function span(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return t("{0} min", [minutes]);
  const hours = Math.round(seconds / 3600);
  if (hours < 24) return t("{0} h", [hours]);
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? t("{0} d {1} h", [days, rest]) : t("{0} d", [days]);
}

const average = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export interface Rhythm {
  /** Seconds a delivery waited for you, averaged, this week and the week before. */
  review: number | null;
  reviewBefore: number | null;
  reviewDays: (number | null)[];
  /** Seconds from the agent starting to delivering. */
  agent: number | null;
  agentBefore: number | null;
  agentDays: (number | null)[];
  delivered: number;
  returned: number;
  lastReturned: Task | null;
}

/** Week-over-week rhythm over closed segments; `days` are the starts of the last 7 days. */
export function rhythm(threads: Thread[], days: number[], now: number): Rhythm {
  const weekStart = days[0];
  const before = weekStart - 7 * DAY;
  const dayOf = (at: number) => {
    let index = -1;
    days.forEach((start, i) => {
      if (at >= start) index = i;
    });
    return index;
  };
  const reviews: { at: number; length: number }[] = [];
  const work: { at: number; length: number }[] = [];
  let delivered = 0;
  let returned = 0;
  let lastReturned: { task: Task; at: number } | null = null;
  for (const thread of threads) {
    thread.segments.forEach((segment, i) => {
      const next = thread.segments[i + 1];
      if (segment.to === null) return;
      const length = segment.to - segment.from;
      if (segment.phase === "wait") {
        reviews.push({ at: segment.to, length });
        if (segment.to >= weekStart && next?.holder === "agent") {
          returned++;
          if (!lastReturned || segment.to > lastReturned.at)
            lastReturned = { task: thread.task, at: segment.to };
        }
      }
      if (
        segment.holder === "agent" &&
        segment.phase === "work" &&
        next?.phase === "wait"
      ) {
        work.push({ at: segment.to, length });
        if (segment.to >= weekStart) delivered++;
      }
    });
  }
  const within = (list: typeof reviews, from: number, to: number) =>
    list.filter((x) => x.at >= from && x.at < to).map((x) => x.length);
  const perDay = (list: typeof reviews) =>
    days.map((_, i) =>
      average(
        list
          .filter((x) => x.at <= now && dayOf(x.at) === i)
          .map((x) => x.length),
      ),
    );
  return {
    review: average(within(reviews, weekStart, now + 1)),
    reviewBefore: average(within(reviews, before, weekStart)),
    reviewDays: perDay(reviews),
    agent: average(within(work, weekStart, now + 1)),
    agentBefore: average(within(work, before, weekStart)),
    agentDays: perDay(work),
    delivered,
    returned,
    lastReturned: (lastReturned as { task: Task } | null)?.task ?? null,
  };
}

/** Start of each of the last 7 days, today last. */
export function weekDays(now: number) {
  const today = new Date(now * 1000);
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - i));
    return day.getTime() / 1000;
  });
}

/** Where a thread stands now, in the column at the end of its row. */
export function holding(thread: Thread, now: number) {
  const { current, task, doneAt } = thread;
  if (!current)
    return {
      tone: "done",
      title: statusTitle.done,
      detail: doneAt ? ago(doneAt, now) : "",
    };
  const since = span(now - current.from);
  if (current.phase === "wait")
    return now - current.from > DAY
      ? {
          tone: "late",
          title: t("Stuck with you"),
          detail: t("{0} ago", [since]),
        }
      : {
          tone: "user",
          title: t("Waiting for you"),
          detail: t("{0} ago", [since]),
        };
  if (current.holder === "agent")
    return current.phase === "queue"
      ? {
          tone: "agent",
          title: t("Agent's queue"),
          detail: t("{0} ago", [since]),
        }
      : {
          tone: "agent",
          title: t("With the agent"),
          detail: t("{0} ago", [since]),
        };
  return {
    tone: "user",
    title: t("With you"),
    detail:
      task.status === "inProgress"
        ? t("in progress")
        : t("to do for {0}", [since]),
  };
}

/** Waiting on you first (oldest first), then the agent, then you, then what ended. */
export const rank = (thread: Thread) => {
  const c = thread.current;
  if (!c) return [4, -(thread.doneAt ?? 0)];
  if (c.phase === "wait") return [0, c.from];
  if (c.holder === "agent") return [c.phase === "work" ? 1 : 2, c.from];
  return [3, c.from];
};
