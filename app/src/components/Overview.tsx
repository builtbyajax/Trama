import { Fragment, useEffect, useMemo, useState } from "react";
import { errorMessage, handoffEvents } from "../lib/api";
import {
  DAY,
  holding,
  rank,
  rhythm,
  span,
  weave,
  weekDays,
  type Rhythm,
  type Segment,
  type Thread,
} from "../lib/handoffs";
import {
  ago,
  isAgentWorking,
  type Project,
  type Task,
  type TaskEvent,
} from "../lib/types";
import { Glyph } from "./BoardFilters";
import { projectColor } from "./Sidebar";
import { locale, t } from "../lib/i18n";

const VISIBLE = 10;
const seconds = () => Date.now() / 1000;

/**
 * Start page: who is holding the work now, each task's thread over the last 7 days as it passes
 * between you (blue) and the agent (purple), and how the week's rhythm compares with the last.
 */
export function Overview({
  projects,
  tasks,
  onOpenProject,
  onOpenTask,
}: {
  projects: Project[];
  tasks: Task[];
  onOpenProject: (id: string) => void;
  onOpenTask: (task: Task) => void;
}) {
  const [now, setNow] = useState(seconds);
  const [events, setEvents] = useState<TaskEvent[] | null>(null);
  const [failure, setFailure] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const days = useMemo(() => weekDays(now), [Math.floor(now / 3600)]);
  const since = days[0] - 7 * DAY;
  const revision = tasks.reduce((max, t) => Math.max(max, t.updatedAt), 0);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(seconds()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let live = true;
    handoffEvents(since)
      .then((list) => {
        if (!live) return;
        setEvents(list);
        setFailure("");
        setNow(seconds());
      })
      .catch((error) => live && setFailure(errorMessage(error)));
    return () => {
      live = false;
    };
  }, [since, revision, tasks.length]);

  const colorOf = (id: string) =>
    projectColor(projects.find((p) => p.id === id));
  const nameOf = (id: string) => projects.find((p) => p.id === id)?.name ?? "";
  const threads = useMemo(() => {
    if (!events) return [];
    const byTask = new Map<string, TaskEvent[]>();
    for (const event of events)
      byTask.set(event.taskId, [...(byTask.get(event.taskId) ?? []), event]);
    return tasks
      .filter((task) => byTask.has(task.id))
      .map((task) => weave(task, byTask.get(task.id) ?? []));
  }, [events, tasks]);
  const shown = threads
    .filter(
      (t) =>
        t.current ||
        (t.doneAt !== null && t.doneAt >= days[0]) ||
        t.segments.some((s) => (s.to ?? now) >= days[0]),
    )
    .sort((a, b) => {
      const [x, y] = [rank(a), rank(b)];
      return x[0] - y[0] || x[1] - y[1];
    });
  const visible = showAll ? shown : shown.slice(0, VISIBLE);
  const pace = useMemo(() => rhythm(threads, days, now), [threads, days, now]);

  const waiting = tasks.filter((t) => t.status === "review");
  const waitStart = (task: Task) =>
    threads.find((t) => t.task.id === task.id)?.current?.from ?? task.updatedAt;
  const waits = waiting.map((t) => now - waitStart(t));
  const working = tasks.filter(isAgentWorking);
  const queue = tasks
    .filter((t) => t.assignee === "agent" && t.status === "todo")
    .sort((a, b) => a.position - b.position);
  const youWorking = tasks.some(
    (t) =>
      t.assignee === "user" &&
      (t.status === "todo" || t.status === "inProgress"),
  );
  const agentSince = working.length
    ? Math.min(
        ...working.map(
          (task) =>
            threads.find((t) => t.task.id === task.id)?.current?.from ??
            task.updatedAt,
        ),
      )
    : now;
  const lastNews = Math.max(0, ...working.map((t) => t.updatedAt));

  const agentClause = working.length
    ? `${
        working.length === 1
          ? t("The agent is still on one task")
          : t("The agent is still on {0} tasks", [working.length])
      }${
        queue.length
          ? t(" and has {0} more in the queue.", [queue.length])
          : t(" and has nothing else queued after it.")
      }`
    : queue.length
      ? t("The agent has {0} queued, but isn't working right now.", [
          queue.length,
        ])
      : t("The agent has no task.");
  const oldest = Math.max(0, ...waits);
  const headline = waiting.length ? (
    <>
      {t("Today the work is stuck with")}{" "}
      <span className="you">{t("you")}</span>.
    </>
  ) : working.length ? (
    t("The agent is working and nothing is waiting for you.")
  ) : queue.length ? (
    t("The agent has tasks queued and is idle.")
  ) : youWorking ? (
    <>
      {t("Today the work is with")} <span className="you">{t("you")}</span>.
    </>
  ) : (
    t("Nothing in progress right now.")
  );
  const lede = waiting.length
    ? `${
        waiting.length === 1
          ? t("One task has been waiting for your review for {0}.", [
              span(oldest),
            ])
          : t(
              "{0} tasks are waiting for your review, and the oldest has been waiting for {1}.",
              [waiting.length, span(oldest)],
            )
      } ${agentClause}`
    : working.length || queue.length
      ? agentClause
      : youWorking
        ? t("The agent has no task. Hand it one when the briefing is ready.")
        : t("Create a task or hand one to the agent to get started.");

  const at = (time: number) =>
    Math.min(100, Math.max(0, ((time - days[0]) / (now - days[0])) * 100));
  const dayLabel = (start: number, i: number) =>
    i === 6
      ? t("today")
      : new Date(start * 1000)
          .toLocaleDateString(locale, { weekday: "short", day: "numeric" })
          .replace(".", "")
          .replace(",", "");

  return (
    <div className="page scroll">
      <div className="page-inner wide overview">
        <header className="ov-head">
          <p className="ov-date">
            {new Date(now * 1000).toLocaleDateString(locale, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <h1>{headline}</h1>
          <p className="ov-lede">{lede}</p>
        </header>

        <div className="ov-holders">
          <Holder
            tone="user"
            count={waiting.length}
            title={t("With you, waiting for review")}
            detail={
              waiting.length
                ? waiting.length === 1
                  ? t("waiting {0}", [span(waits[0] ?? 0)])
                  : t("{0} in total", [span(waits.reduce((a, b) => a + b, 0))])
                : t("nothing to review")
            }
            onOpen={
              waiting.length
                ? () =>
                    onOpenTask(
                      [...waiting].sort(
                        (a, b) => waitStart(a) - waitStart(b),
                      )[0],
                    )
                : undefined
            }
          />
          <Holder
            tone="agent"
            count={working.length}
            title={t("With the agent, working")}
            detail={
              working.length
                ? t("for {0}, last update {1}", [
                    span(now - agentSince),
                    ago(lastNews, now),
                  ])
                : t("none right now")
            }
            onOpen={working.length ? () => onOpenTask(working[0]) : undefined}
          />
          <Holder
            tone={queue.length ? "agent" : "idle"}
            count={queue.length}
            title={t("Agent's queue")}
            detail={
              queue.length
                ? t("next up is “{0}”", [queue[0].title])
                : working.length
                  ? t("it goes idle when it finishes")
                  : t("empty|queue")
            }
            onOpen={queue.length ? () => onOpenTask(queue[0]) : undefined}
          />
        </div>

        <section className="loom" aria-labelledby="loom-title">
          <div className="loom-bar">
            <h2 id="loom-title" className="block-title">
              {t("Last 7 days")}
            </h2>
            <p>
              {shown.length ? t("Click a thread to see where it went.") : ""}
            </p>
            <div className="loom-legend" aria-hidden="true">
              <span>
                <i className="line user" />
                {t("With you")}
              </span>
              <span>
                <i className="line agent" />
                {t("With the agent")}
              </span>
              <span>
                <i className="line user wait" />
                {t("Waiting for you")}
              </span>
            </div>
          </div>
          {failure ? (
            <p className="block-empty">
              {t("Couldn't read the tasks' history.")} {failure}
            </p>
          ) : events === null ? (
            <p className="block-empty">{t("Reading the history…")}</p>
          ) : !shown.length ? (
            <p className="block-empty">
              {t(
                "No tasks went through the board this week. When you or the agent work on a task, its thread shows up here.",
              )}
            </p>
          ) : (
            <div className="loom-grid scroll-x">
              <div className="loom-head" aria-hidden="true">
                <span />
                <span className="loom-days">
                  {days.map((start, i) =>
                    // Right after midnight today is a sliver; yesterday's label would touch "hoje".
                    i === 5 && at(days[6]) > 92 ? null : (
                      <span
                        key={start}
                        className={i === 6 ? "today" : undefined}
                        style={
                          i === 6
                            ? undefined
                            : { left: `${(at(start) + at(days[i + 1])) / 2}%` }
                        }
                      >
                        {dayLabel(start, i)}
                      </span>
                    ),
                  )}
                </span>
                <span className="loom-now">{t("Now")}</span>
              </div>
              {visible.map((thread) => {
                const { task } = thread;
                const state = holding(thread, now);
                const expanded = openId === task.id;
                return (
                  <Fragment key={task.id}>
                    <button
                      type="button"
                      className="loom-row"
                      aria-expanded={expanded}
                      aria-controls={`story-${task.id}`}
                      onClick={() => setOpenId(expanded ? null : task.id)}
                    >
                      <span className="loom-title">
                        <span className="truncate">{task.title}</span>
                        <small>
                          <span
                            className="swatch"
                            style={{
                              background: colorOf(task.projectId),
                            }}
                            aria-hidden="true"
                          />
                          <span className="truncate">
                            {nameOf(task.projectId)}
                          </span>
                        </small>
                      </span>
                      <Track thread={thread} days={days} at={at} now={now} />
                      <span className={`loom-state ${state.tone}`}>
                        <b>{state.title}</b>
                        <small>{state.detail}</small>
                      </span>
                    </button>
                    {expanded && (
                      <div className="loom-story" id={`story-${task.id}`}>
                        <ol>
                          {thread.steps.map((step, i) => (
                            <li key={i}>
                              <time>{ago(step.at, now)}</time>
                              {step.actor ? (
                                <Glyph who={step.actor} />
                              ) : (
                                <span
                                  className="glyph none"
                                  aria-hidden="true"
                                />
                              )}
                              <span>{step.text}</span>
                            </li>
                          ))}
                        </ol>
                        <div className="loom-actions">
                          <button
                            type="button"
                            className="button small"
                            onClick={() => onOpenProject(task.projectId)}
                          >
                            {t("View on board")}
                          </button>
                          <button
                            type="button"
                            className={`button small ${task.status === "review" ? "primary" : ""}`}
                            onClick={() => onOpenTask(task)}
                          >
                            {task.status === "review"
                              ? t("Review")
                              : t("Open task")}
                          </button>
                        </div>
                      </div>
                    )}
                  </Fragment>
                );
              })}
              {shown.length > VISIBLE && (
                <button
                  type="button"
                  className="loom-more"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll
                    ? t("Show less")
                    : t("Show all ({0})", [shown.length])}
                </button>
              )}
            </div>
          )}
        </section>

        {events && <Pace pace={pace} />}
      </div>
    </div>
  );
}

function Holder({
  tone,
  count,
  title,
  detail,
  onOpen,
}: {
  tone: "user" | "agent" | "idle";
  count: number;
  title: string;
  detail: string;
  onOpen?: () => void;
}) {
  const body = (
    <>
      <span className="holder-count">{count}</span>
      <b>{title}</b>
      <small className="truncate">{detail}</small>
    </>
  );
  return onOpen ? (
    <button type="button" className={`holder ${tone}`} onClick={onOpen}>
      {body}
    </button>
  ) : (
    <div className={`holder ${count ? tone : "idle"}`}>{body}</div>
  );
}

function Track({
  thread,
  days,
  at,
  now,
}: {
  thread: Thread;
  days: number[];
  at: (time: number) => number;
  now: number;
}) {
  const visible = (s: Segment) => (s.to ?? now) > days[0];
  const segments = thread.segments.filter(visible);
  const live =
    thread.current?.holder === "agent" && thread.current.phase === "work";
  return (
    <span className="loom-track" aria-hidden="true">
      {days.slice(1).map((start) => (
        <i key={start} className="loom-day" style={{ left: `${at(start)}%` }} />
      ))}
      {segments.map((s, i) => {
        const from = at(s.from);
        const to = at(s.to ?? now);
        const long = s.phase === "wait" && (s.to ?? now) - s.from > DAY;
        return (
          <i
            key={i}
            className={`loom-line ${s.holder} ${s.phase} ${long ? "long" : ""}`}
            style={{ left: `${from}%`, width: `${Math.max(0.4, to - from)}%` }}
          />
        );
      })}
      {segments.map((s, i) => {
        const previous = thread.segments[thread.segments.indexOf(s) - 1];
        if (previous && previous.holder === s.holder) return null;
        if (s.from < days[0]) return null;
        return (
          <i
            key={`k${i}`}
            className={`loom-knot ${s.holder}`}
            style={{ left: `${at(s.from)}%` }}
          />
        );
      })}
      {thread.doneAt !== null && thread.doneAt >= days[0] && (
        <i
          className="loom-knot done"
          style={{ left: `${at(thread.doneAt)}%` }}
        />
      )}
      {live && <i className="loom-knot live" />}
    </span>
  );
}

function Pace({ pace }: { pace: Rhythm }) {
  const reviewNote =
    pace.review === null
      ? t("No deliveries were reviewed this week.")
      : pace.agent !== null && pace.review > pace.agent
        ? t(
            "Review is this week's bottleneck. Deliveries wait for you longer than the agent takes to make them.",
          )
        : t(
            "From when the task reaches review until you complete it or send it back.",
          );
  return (
    <section className="pace" aria-label={t("This week's pace")}>
      <Measure
        title={t("Until you review a delivery")}
        value={pace.review}
        before={pace.reviewBefore}
        days={pace.reviewDays}
        tone="review"
        note={reviewNote}
      />
      <Measure
        title={t("The agent per task")}
        value={pace.agent}
        before={pace.agentBefore}
        days={pace.agentDays}
        tone="agent"
        note={
          pace.agent === null
            ? t("The agent didn't deliver anything this week.")
            : t("From when the agent starts until it delivers for review.")
        }
      />
      <div className="measure">
        <h3>{t("Sent back for changes|group")}</h3>
        <span className="measure-value">
          {pace.delivered
            ? t("{0} of {1}", [pace.returned, pace.delivered])
            : t("None")}
          {pace.delivered > 0 && <small>{t("deliveries")}</small>}
        </span>
        <p>
          {pace.lastReturned
            ? t("The most recent was “{0}”.", [pace.lastReturned.title])
            : pace.delivered
              ? t("No deliveries went back to the agent this week.")
              : t("The agent hasn't delivered anything this week yet.")}
        </p>
      </div>
    </section>
  );
}

function Measure({
  title,
  value,
  before,
  days,
  tone,
  note,
}: {
  title: string;
  value: number | null;
  before: number | null;
  days: (number | null)[];
  tone: "review" | "agent";
  note: string;
}) {
  const top = Math.max(1, ...days.map((d) => d ?? 0));
  return (
    <div className="measure">
      <h3>{title}</h3>
      <span className="measure-value">
        {value === null ? t("No data") : span(value)}
        {before !== null && (
          <small>
            {t("last week,")} {span(before)}
          </small>
        )}
      </span>
      <span className={`spark ${tone}`} aria-hidden="true">
        {days.map((d, i) => (
          <i
            key={i}
            className={
              before !== null && d !== null && d > before ? "high" : ""
            }
            style={{
              height: `${d === null ? 0 : Math.max(12, (d / top) * 100)}%`,
            }}
          />
        ))}
      </span>
      <p>{note}</p>
    </div>
  );
}
