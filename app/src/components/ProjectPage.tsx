import { useEffect, useState, type ReactNode } from "react";
import {
  goalProgress,
  isAgentWorking,
  statusTitle,
  type Goal,
  type Task,
  type TaskStatus,
} from "../lib/types";
import { Glyph } from "./BoardFilters";
import { daysUntil, relativeDay } from "./DatePicker";
import { dayOf, targetOf, timing } from "./GoalRecap";
import {
  concludedDay,
  goalDay,
  GoalProgressBar,
  goalStage,
  type GoalStage,
} from "./Goals";
import { Icon, StatusIcon } from "./Icon";
import { ContextMenu, type MenuItem } from "./Sidebar";
import { t } from "../lib/i18n";

const DAY = 86_400;
const WEEK = 7 * DAY;
const seconds = () => Date.now() / 1000;
/** The legend under the goals, from done to the work not started. */
const barOrder: TaskStatus[] = [
  "done",
  "review",
  "inProgress",
  "todo",
  "backlog",
];
/** A goal card's open tasks, the ones waiting for you first. */
const openOrder: TaskStatus[] = ["review", "inProgress", "todo"];
const GOAL_TASKS = 4;
/** The side lists show this many before a way to see them all. */
const SIDE_TASKS = 8;
/** Past this many days away, a target shows its date instead of the days left. */
const NEAR = 30;

/** Which goals the page lists. */
export type GoalStageFilter = "all" | GoalStage;

/**
 * Under the project's name on its page, in place of the task count: what waits for your review,
 * what the agent is working on and what was done this week, each a way into it.
 */
export function ProjectPulse({
  tasks,
  onReview,
  onOpenTask,
  onWorking,
  onDone,
}: {
  /** The project's tasks, done ones included. */
  tasks: Task[];
  onReview: () => void;
  onOpenTask: (task: Task) => void;
  onWorking: () => void;
  onDone: () => void;
}) {
  const now = useNow();
  const review = tasks.filter((task) => task.status === "review").length;
  const working = tasks.filter(isAgentWorking);
  const doneWeek = tasks.filter(
    (task) =>
      task.status === "done" &&
      (task.archivedAt ?? task.updatedAt) >= now - WEEK,
  ).length;
  const open = tasks.filter((task) => task.status !== "done").length;
  if (!review && !working.length && !doneWeek)
    return <>{open === 1 ? t("1 task") : t("{0} tasks", [open])}</>;
  return (
    <span className="project-pulse">
      {review > 0 && (
        <button type="button" className="pulse-chip review" onClick={onReview}>
          <span className="dot s-review" />
          {review === 1
            ? t("1 waiting for you")
            : t("{0} waiting for you", [review])}
        </button>
      )}
      {working.length > 0 && (
        <button
          type="button"
          className="pulse-chip"
          onClick={() =>
            working.length === 1 ? onOpenTask(working[0]) : onWorking()
          }
        >
          <Glyph who="agent" profileId={working[0].agentProfileId} />
          {working.length === 1
            ? t("1 with the agent now")
            : t("{0} with the agent now", [working.length])}
        </button>
      )}
      {doneWeek > 0 && (
        <button type="button" className="pulse-chip" onClick={onDone}>
          <span className="dot s-done" />
          {doneWeek === 1
            ? t("1 done this week")
            : t("{0} done this week", [doneWeek])}
        </button>
      )}
    </span>
  );
}

/**
 * The project's first tab: its goals by stage, each with its open tasks and who has them, then
 * the work outside goals and what was done lately.
 */
export function ProjectPage({
  tasks,
  goals,
  stage,
  manual,
  onStage,
  onAutoOrder,
  onOpenTask,
  onOpenGoal,
  onEditGoal,
  onCompleteGoal,
  onReopenGoal,
  onDeleteGoal,
  onArchive,
}: {
  /** The project's tasks, done ones included. */
  tasks: Task[];
  /** The project's goals, in the order the page lists them. */
  goals: Goal[];
  stage: GoalStageFilter;
  /** The goals keep the order they were dragged to, not their progress. */
  manual: boolean;
  onStage: (stage: GoalStageFilter) => void;
  onAutoOrder: () => void;
  onOpenTask: (task: Task) => void;
  /** Opens the board on a goal; "" is the tasks without one. */
  onOpenGoal: (goalId: string) => void;
  onEditGoal: (goal: Goal) => void;
  onCompleteGoal: (goal: Goal) => void;
  onReopenGoal: (goal: Goal) => void;
  onDeleteGoal: (goal: Goal) => void;
  /** The project's Archive. */
  onArchive: () => void;
}) {
  const [menu, setMenu] = useState<{
    goal: Goal;
    x: number;
    y: number;
    trigger: HTMLElement;
  } | null>(null);
  const stages = new Map(
    goals.map((goal) => [goal.id, goalStage(goal, tasks)]),
  );
  const count = (key: GoalStage) =>
    goals.filter((goal) => stages.get(goal.id) === key).length;
  const filters: { key: GoalStageFilter; label: string; count: number }[] = [
    { key: "all", label: t("All|filter"), count: goals.length },
    { key: "started", label: t("In progress"), count: count("started") },
    { key: "waiting", label: t("Not started"), count: count("waiting") },
    { key: "concluded", label: t("Concluded"), count: count("concluded") },
  ];
  const shown =
    stage === "all"
      ? goals
      : goals.filter((goal) => stages.get(goal.id) === stage);
  const outside = byOpen(tasks.filter((task) => task.goalId === null));
  const done = tasks
    .filter((task) => task.status === "done")
    .sort((a, b) => doneAt(b) - doneAt(a));
  const menuItems = (goal: Goal): MenuItem[] => {
    const progress = goalProgress(goal, tasks);
    const items: MenuItem[] = [
      {
        label: t("Edit goal…"),
        icon: "pencil",
        onSelect: () => onEditGoal(goal),
      },
    ];
    if (goal.completedAt !== null)
      items.push({
        label: t("Reopen goal"),
        icon: "arrowUp",
        onSelect: () => onReopenGoal(goal),
      });
    else if (progress.total > 0 && progress.done === progress.total)
      items.push({
        label: t("Conclude goal…"),
        icon: "check",
        onSelect: () => onCompleteGoal(goal),
      });
    items.push({
      label: t("Delete goal…"),
      icon: "trash",
      danger: true,
      separated: true,
      onSelect: () => onDeleteGoal(goal),
    });
    return items;
  };

  return (
    <div className="page scroll project-page">
      <div className="page-inner wide">
        <div className="project-columns">
          <section className="project-goals" aria-labelledby="project-goals">
            <div className="project-section-head">
              <h2 id="project-goals">{t("Goals")}</h2>
              {goals.length > 0 && (
                <div
                  className="chips"
                  role="radiogroup"
                  aria-label={t("Filter goals")}
                >
                  {filters.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      role="radio"
                      aria-checked={stage === filter.key}
                      className={`chip-button ${stage === filter.key ? "on" : ""}`}
                      onClick={() => onStage(filter.key)}
                    >
                      <span className="truncate">{filter.label}</span>
                      <span className="chip-count">{filter.count}</span>
                    </button>
                  ))}
                </div>
              )}
              {manual && (
                <button
                  type="button"
                  className="button small ghost project-order"
                  data-tooltip={t(
                    "The goals are in the order you dragged them to",
                  )}
                  onClick={onAutoOrder}
                >
                  <Icon name="chevronUpDown" size={12} />
                  {t("Sort by progress")}
                </button>
              )}
              {shown.length > 0 && (
                <ul className="project-legend" aria-hidden="true">
                  {barOrder.map((status) => (
                    <li key={status}>
                      <span className={`dot s-${status}`} />
                      {status === "done" ? t("Done") : statusTitle[status]}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {shown.length === 0 ? (
              <p className="block-empty">
                {goals.length === 0
                  ? t("No goals yet. Create one to follow a group of tasks.")
                  : stage === "concluded"
                    ? t("No concluded goals.")
                    : stage === "waiting"
                      ? t("Every open goal has started.")
                      : t("No goal has started yet.")}
              </p>
            ) : (
              <ul className="project-goal-list">
                {shown.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    stage={stages.get(goal.id)!}
                    tasks={tasks.filter((task) => task.goalId === goal.id)}
                    menuOpen={menu?.goal.id === goal.id}
                    onOpen={() => onOpenGoal(goal.id)}
                    onOpenTask={onOpenTask}
                    onMenu={(x, y, trigger) => setMenu({ goal, x, y, trigger })}
                  />
                ))}
              </ul>
            )}
          </section>

          <aside className="project-side">
            {outside.length > 0 && (
              <section aria-labelledby="project-outside">
                <h2 id="project-outside" className="project-section-title">
                  {t("Outside goals")}
                  <span className="project-section-count">
                    {outside.length}
                  </span>
                </h2>
                <ul className="project-box">
                  {outside.slice(0, SIDE_TASKS).map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      status
                      onOpen={onOpenTask}
                    />
                  ))}
                  {outside.length > SIDE_TASKS && (
                    <li>
                      <button
                        type="button"
                        className="project-task more"
                        onClick={() => onOpenGoal("")}
                      >
                        {t("See the {0} on the board", [outside.length])}
                      </button>
                    </li>
                  )}
                </ul>
              </section>
            )}
            {done.length > 0 && (
              <section aria-labelledby="project-done">
                <h2 id="project-done" className="project-section-title">
                  {t("Recently done")}
                </h2>
                <ul className="project-box">
                  {done.slice(0, SIDE_TASKS).map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onOpen={onOpenTask}
                      end={
                        task.pullRequestNumber !== null ? (
                          <span className="project-ref">
                            {`${t("PR")} ${task.pullRequestNumber}`}
                          </span>
                        ) : task.commitHash ? (
                          <span className="project-ref">
                            {task.commitHash.slice(0, 7)}
                          </span>
                        ) : (
                          <span className="project-when">
                            {doneDay(doneAt(task))}
                          </span>
                        )
                      }
                    />
                  ))}
                  {done.length > SIDE_TASKS && (
                    <li>
                      <button
                        type="button"
                        className="project-task more done"
                        onClick={onArchive}
                      >
                        {t("See all {0} in the Archive", [done.length])}
                      </button>
                    </li>
                  )}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          anchor={{ current: menu.trigger }}
          label={t("Actions for {0}", [menu.goal.name])}
          items={menuItems(menu.goal)}
          onClose={(restoreFocus) => {
            if (restoreFocus) menu.trigger.focus();
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}

/** The current time in seconds, refreshed each minute. */
function useNow() {
  const [now, setNow] = useState(seconds);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(seconds()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** The open tasks, Backlog left out, the ones waiting for you first. */
const byOpen = (tasks: Task[]) =>
  tasks
    .filter((task) => openOrder.includes(task.status))
    .sort(
      (a, b) =>
        openOrder.indexOf(a.status) - openOrder.indexOf(b.status) ||
        a.position - b.position,
    );
const doneAt = (task: Task) => task.archivedAt ?? task.updatedAt;
/** When a task was done: today, yesterday or its day. */
function doneDay(at: number) {
  const days = Math.round((dayOf(seconds()) - dayOf(at)) / DAY);
  return days === 0
    ? t("today")
    : days === 1
      ? t("yesterday")
      : concludedDay(at);
}

/** A task in the page's lists: who has it, its status when asked, its title and what ends it. */
function TaskRow({
  task,
  status = false,
  end,
  onOpen,
}: {
  task: Task;
  status?: boolean;
  end?: ReactNode;
  onOpen: (task: Task) => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="project-task"
        onClick={() => onOpen(task)}
      >
        <span className="project-who">
          <Glyph who={task.assignee} profileId={task.agentProfileId} />
        </span>
        {status && (
          <span className="project-status" title={statusTitle[task.status]}>
            <StatusIcon status={task.status} size={13} />
          </span>
        )}
        <span className="truncate">{task.title}</span>
        {end}
      </button>
    </li>
  );
}

/**
 * One goal: its name and version, when it is due, a dot per task and how many are done. A
 * started one lists its open tasks and who has each, a concluded one how it landed against the
 * target. The whole card opens the goal, and a right click or Shift+F10 its actions.
 */
function GoalCard({
  goal,
  stage,
  tasks,
  menuOpen,
  onOpen,
  onOpenTask,
  onMenu,
}: {
  goal: Goal;
  stage: GoalStage;
  /** The goal's tasks. */
  tasks: Task[];
  menuOpen: boolean;
  onOpen: () => void;
  onOpenTask: (task: Task) => void;
  /** The goal's actions, at a point, given back to the trigger when they close. */
  onMenu: (x: number, y: number, trigger: HTMLElement) => void;
}) {
  const done = tasks.filter((task) => task.status === "done").length;
  const open = stage === "started" ? byOpen(tasks) : [];
  const target = targetOf(goal);
  const late =
    goal.completedAt !== null &&
    target !== null &&
    dayOf(goal.completedAt) > target;
  const away = goal.targetDate ? daysUntil(goal.targetDate) : null;
  return (
    <li
      className={`project-goal ${stage} ${menuOpen ? "menu-open" : ""}`}
      onContextMenu={(event) => {
        event.preventDefault();
        const name =
          event.currentTarget.querySelector<HTMLElement>(".project-goal-name")!;
        onMenu(event.clientX, event.clientY, name);
      }}
    >
      <div className="project-goal-head">
        <button
          type="button"
          className="project-goal-name"
          aria-haspopup="menu"
          onClick={onOpen}
          onKeyDown={(event) => {
            if (
              !(event.shiftKey && event.key === "F10") &&
              event.key !== "ContextMenu"
            )
              return;
            event.preventDefault();
            // No pointer position from the keyboard: open under the name.
            const rect = event.currentTarget.getBoundingClientRect();
            onMenu(rect.left, rect.bottom + 4, event.currentTarget);
          }}
        >
          <Icon name={stage === "concluded" ? "check" : "target"} size={13} />
          <span className="truncate">{goal.name}</span>
          {goal.version && <span className="version-tag">{goal.version}</span>}
        </button>
        {goal.completedAt === null && goal.targetDate && away !== null && (
          <span
            className={`project-goal-day ${away < 0 ? "late" : ""}`}
            data-tooltip={goalDay(goal.targetDate)}
          >
            {Math.abs(away) <= NEAR
              ? relativeDay(goal.targetDate)
              : goalDay(goal.targetDate)}
          </span>
        )}
        {tasks.length > 0 && <GoalProgressBar goal={goal} tasks={tasks} />}
        <span className="project-goal-count">
          {tasks.length === 0
            ? t("No tasks yet")
            : t("{0} of {1}", [done, tasks.length])}
        </span>
      </div>
      {goal.completedAt !== null && (
        <p className={`project-goal-done ${late ? "late" : ""}`}>
          {timing(target, goal.completedAt)}
        </p>
      )}
      {open.length > 0 && (
        <ul className="project-goal-tasks">
          {open.slice(0, GOAL_TASKS).map((task) => (
            <TaskRow key={task.id} task={task} status onOpen={onOpenTask} />
          ))}
          {open.length > GOAL_TASKS && (
            <li>
              <button
                type="button"
                className="project-task more"
                onClick={onOpen}
              >
                {t("See the {0} on the board", [open.length])}
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}
