import { useEffect, useState, type ReactNode } from "react";
import {
  isAgentWorking,
  statusTitle,
  type Goal,
  type Task,
  type TaskStatus,
} from "../lib/types";
import { Glyph } from "./BoardFilters";
import { goalDay } from "./Goals";
import { Icon, StatusIcon } from "./Icon";
import { t } from "../lib/i18n";

const DAY = 86_400;
const WEEK = 7 * DAY;
const seconds = () => Date.now() / 1000;
/** The goal bar's segments, from done to the work not started. */
const barOrder: TaskStatus[] = [
  "done",
  "review",
  "inProgress",
  "todo",
  "backlog",
];
const OUTSIDE = 4;
const DELIVERIES = 5;

/**
 * The project's first tab: what is with the agent, what waits for your review and what was done
 * this week, then each open goal's progress by stage, the work outside goals and recent deliveries.
 */
export function ProjectPage({
  tasks,
  goals,
  onOpenTask,
  onOpenGoal,
  onShowConcluded,
}: {
  /** The project's tasks, done ones included. */
  tasks: Task[];
  goals: Goal[];
  onOpenTask: (task: Task) => void;
  /** Opens the board on a goal; "" is the tasks without one. */
  onOpenGoal: (goalId: string) => void;
  onShowConcluded: () => void;
}) {
  const [now, setNow] = useState(seconds);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(seconds()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const recent = (a: Task, b: Task) => b.updatedAt - a.updatedAt;
  const withAgent = tasks.filter(isAgentWorking).sort(recent);
  const inReview = tasks
    .filter((task) => task.status === "review")
    .sort(recent);
  const doneWeek = tasks
    .filter((task) => task.status === "done" && task.updatedAt >= now - WEEK)
    .sort(recent);
  const open = goals.filter((goal) => goal.completedAt === null);
  const concluded = goals.length - open.length;
  const nameOf = (id: string | null) =>
    goals.find((goal) => goal.id === id)?.name;
  const busiest = topGoal(doneWeek);
  const outside = tasks
    .filter((task) => task.goalId === null && task.status !== "done")
    .sort((a, b) => order(a) - order(b) || recent(a, b));
  const deliveries = tasks
    .filter(
      (task) =>
        task.status === "done" &&
        (task.pullRequestNumber !== null || task.commitHash !== null),
    )
    .sort(recent)
    .slice(0, DELIVERIES);

  const taskLine = (task: Task, label?: string) => (
    <li key={task.id}>
      <button
        type="button"
        className="project-task"
        onClick={() => onOpenTask(task)}
      >
        <Glyph who={task.assignee} />
        <span className="truncate">
          {label ? `${label}: ${task.title}` : task.title}
        </span>
      </button>
    </li>
  );

  return (
    <div className="page scroll project-page">
      <div className="page-inner wide">
        <section className="project-panels" aria-label={t("Right now")}>
          <Panel
            title={t("With the agent now")}
            count={withAgent.length}
            empty={t("The agent isn't working on anything.")}
          >
            {withAgent.slice(0, 2).map((task) => taskLine(task))}
          </Panel>
          <Panel
            title={t("Waiting for your review")}
            count={inReview.length}
            empty={t("Nothing waiting for review.")}
          >
            {inReview.slice(0, 2).map((task) => taskLine(task))}
          </Panel>
          <Panel
            title={t("Done in the last 7 days")}
            count={doneWeek.length}
            empty={t("Nothing done this week.")}
          >
            {busiest && nameOf(busiest.goalId) && (
              <li className="project-note">
                {busiest.count === 1
                  ? t("1 of them in {0}", [nameOf(busiest.goalId)])
                  : t("{0} of them in {1}", [
                      busiest.count,
                      nameOf(busiest.goalId),
                    ])}
              </li>
            )}
          </Panel>
        </section>

        <div className="project-columns">
          <section className="project-goals" aria-labelledby="project-goals">
            <div className="project-section-head">
              <h2 id="project-goals">{t("Goals")}</h2>
              <ul className="project-legend" aria-hidden="true">
                {barOrder.map((status) => (
                  <li key={status}>
                    <span className={`dot s-${status}`} />
                    {status === "done" ? t("Done") : statusTitle[status]}
                  </li>
                ))}
              </ul>
            </div>
            {open.length === 0 ? (
              <p className="block-empty">
                {t("No open goals. Create one to follow a group of tasks.")}
              </p>
            ) : (
              <ul className="project-goal-list">
                {open.map((goal) => (
                  <GoalProgress
                    key={goal.id}
                    goal={goal}
                    tasks={tasks.filter((task) => task.goalId === goal.id)}
                    onOpen={() => onOpenGoal(goal.id)}
                    onOpenTask={onOpenTask}
                  />
                ))}
              </ul>
            )}
            {concluded > 0 && (
              <button
                type="button"
                className="button small ghost project-more"
                onClick={onShowConcluded}
              >
                {t("See concluded goals ({0})", [concluded])}
              </button>
            )}
          </section>

          <aside className="project-side">
            <section aria-labelledby="project-outside">
              <h2 id="project-outside" className="project-section-title">
                {t("Outside goals")}
              </h2>
              {outside.length === 0 ? (
                <p className="block-empty">
                  {t("Every open task has a goal.")}
                </p>
              ) : (
                <ul className="project-box">
                  {outside.slice(0, OUTSIDE).map((task) => taskLine(task))}
                  {outside.length > OUTSIDE && (
                    <li>
                      <button
                        type="button"
                        className="project-task more"
                        onClick={() => onOpenGoal("")}
                      >
                        {t("See the {0} tasks", [outside.length])}
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </section>
            <section aria-labelledby="project-deliveries">
              <h2 id="project-deliveries" className="project-section-title">
                {t("Recent deliveries")}
              </h2>
              {deliveries.length === 0 ? (
                <p className="block-empty">
                  {t("Done tasks with a commit or PR show up here.")}
                </p>
              ) : (
                <ul className="project-box">
                  {deliveries.map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        className="project-task"
                        onClick={() => onOpenTask(task)}
                      >
                        <span className="truncate">{task.title}</span>
                        <span className="project-ref">
                          {task.pullRequestNumber !== null
                            ? `${t("PR")} ${task.pullRequestNumber}`
                            : task.commitHash?.slice(0, 7)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

/** Open work first, the way the board reads: review, working, to do, backlog. */
function order(task: Task) {
  const index = barOrder.indexOf(task.status);
  return index < 0 ? barOrder.length : index;
}

/** The goal with most of the given tasks, if any has a goal. */
function topGoal(tasks: Task[]) {
  const counts = new Map<string, number>();
  for (const task of tasks)
    if (task.goalId)
      counts.set(task.goalId, (counts.get(task.goalId) ?? 0) + 1);
  let best: { goalId: string; count: number } | null = null;
  for (const [goalId, count] of counts)
    if (!best || count > best.count) best = { goalId, count };
  return best;
}

function Panel({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <div className="project-panel">
      <h3>{title}</h3>
      <span className="project-count">{count}</span>
      {count === 0 ? (
        <p className="project-note">{empty}</p>
      ) : (
        <ul>{children}</ul>
      )}
    </div>
  );
}

function GoalProgress({
  goal,
  tasks,
  onOpen,
  onOpenTask,
}: {
  goal: Goal;
  /** The goal's tasks. */
  tasks: Task[];
  onOpen: () => void;
  onOpenTask: (task: Task) => void;
}) {
  const counts = Object.fromEntries(
    barOrder.map((status) => [
      status,
      tasks.filter((task) => task.status === status).length,
    ]),
  ) as Record<TaskStatus, number>;
  const total = tasks.length;
  const working = tasks.filter(isAgentWorking)[0];
  const review = tasks.find((task) => task.status === "review");
  return (
    <li className="project-goal">
      <div className="project-goal-head">
        <button type="button" className="project-goal-name" onClick={onOpen}>
          <Icon name="target" size={13} />
          <span className="truncate">{goal.name}</span>
        </button>
        <span className="project-goal-meta">
          {total === 0
            ? t("No tasks yet")
            : t("{0} of {1} done", [counts.done, total])}
          {goal.targetDate && (
            <>
              <Icon name="flag" size={11} />
              {goalDay(goal.targetDate)}
            </>
          )}
        </span>
      </div>
      <span
        className="project-goal-bar"
        role="img"
        aria-label={barOrder
          .filter((status) => counts[status] > 0)
          .map(
            (status) =>
              `${status === "done" ? t("Done") : statusTitle[status]} ${counts[status]}`,
          )
          .join(", ")}
      >
        {barOrder.map(
          (status) =>
            counts[status] > 0 && (
              <span
                key={status}
                className={`s-${status}`}
                style={{ flexGrow: counts[status] }}
              />
            ),
        )}
      </span>
      {(working || review) && (
        <ul className="project-goal-now">
          {working && (
            <li>
              <button
                type="button"
                className="project-task"
                onClick={() => onOpenTask(working)}
              >
                <StatusIcon status="inProgress" size={12} />
                <span className="truncate">
                  {t("Agent: {0}", [working.title])}
                </span>
              </button>
            </li>
          )}
          {review && (
            <li>
              <button
                type="button"
                className="project-task"
                onClick={() => onOpenTask(review)}
              >
                <StatusIcon status="review" size={12} />
                <span className="truncate">
                  {t("You: review {0}", [review.title])}
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}
