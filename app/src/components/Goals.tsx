import { useState, type FormEvent } from "react";
import { completeGoal, deleteGoal, errorMessage, saveGoal } from "../lib/api";
import { goalProgress, type Goal, type Task } from "../lib/types";
import { DatePicker, daysUntil, relativeDay } from "./DatePicker";
import { Field } from "./Field";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { ContextMenu, type MenuItem } from "./Sidebar";
import { locale, t } from "../lib/i18n";

/** The target day as the interface writes dates, e.g. "30 de out.". */
export function goalDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

/** An open goal whose day already passed. */
const overdue = (goal: Goal) =>
  !!goal.targetDate &&
  goal.completedAt === null &&
  daysUntil(goal.targetDate) < 0;

const complete = ({ total, done }: { total: number; done: number }) =>
  total > 0 && done === total;

function GoalBar({ done, total }: { done: number; total: number }) {
  return (
    <span
      className={`goal-bar ${total > 0 && done === total ? "full" : ""}`}
      aria-hidden="true"
    >
      <span style={{ width: total ? `${(done / total) * 100}%` : 0 }} />
    </span>
  );
}

/** The goal's tasks by status, in the order they finish. */
const progressOrder = [
  "done",
  "review",
  "inProgress",
  "todo",
  "backlog",
] as const;
const maxDots = 12;

/**
 * The goal's tasks colored by status: a dot each up to `maxDots`, then a bar as wide as that many
 * dots, so the title stays one line.
 */
function GoalProgressBar({ goal, tasks }: { goal: Goal; tasks: Task[] }) {
  const counts = { done: 0, review: 0, inProgress: 0, todo: 0, backlog: 0 };
  for (const task of tasks)
    if (task.goalId === goal.id && task.status in counts)
      counts[task.status as keyof typeof counts]++;
  const total = progressOrder.reduce((sum, status) => sum + counts[status], 0);
  if (total <= maxDots)
    return (
      <span className="goal-dots" aria-hidden="true">
        {progressOrder.flatMap((status) =>
          Array.from({ length: counts[status] }, (_, index) => (
            <span key={`${status}-${index}`} className={`s-${status}`} />
          )),
        )}
      </span>
    );
  return (
    <span className="goal-bar" aria-hidden="true">
      {progressOrder.map(
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
  );
}

/** When a goal was concluded, e.g. "8 de out.", with the year when it isn't this one. */
function concludedDay(seconds: number) {
  const date = new Date(seconds * 1000);
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

/** The concluded goals, the most recently concluded first. */
const byConcluded = (goals: Goal[]) =>
  goals
    .filter((g) => g.completedAt !== null)
    .sort((a, b) => b.completedAt! - a.completedAt!);

/**
 * The project's goals as menu rows to open one: the open ones, then the `recent` most recently
 * concluded grayed in their own group, with their day, and a row to see them all when more wait.
 * With `onNew`, a row to create one follows the open goals.
 * `currentId` gets the check.
 */
export function goalChoices(
  goals: Goal[],
  currentId: string | null,
  onPick: (goalId: string) => void,
  {
    recent,
    onShowAll,
    onNew,
  }: { recent: number; onShowAll: () => void; onNew?: () => void },
): MenuItem[] {
  const open = goals.filter((g) => g.completedAt === null);
  const concluded = byConcluded(goals);
  const items: MenuItem[] = [
    ...open.map((g) => ({
      label: g.name,
      icon: "target" as const,
      checked: currentId === null ? undefined : g.id === currentId,
      onSelect: () => onPick(g.id),
    })),
    ...(onNew
      ? [
          {
            label: t("New goal"),
            icon: "plus" as const,
            onSelect: onNew,
          },
        ]
      : []),
    ...concluded.slice(0, recent).map((g, index) => ({
      label: g.name,
      icon: "check" as const,
      muted: true,
      hint: concludedDay(g.completedAt!),
      checked: currentId === null ? undefined : g.id === currentId,
      separated: index === 0 && open.length > 0,
      section: index === 0 ? t("Concluded") : undefined,
      onSelect: () => onPick(g.id),
    })),
  ];
  if (concluded.length > recent)
    items.push({
      label: t("See all {0}…", [concluded.length]),
      separated: !onNew,
      onSelect: onShowAll,
    });
  return items;
}

/** The day beside a goal in the sidebar: only once it is near, a week away or less, or passed. */
function nearDay(goal: Goal) {
  if (!goal.targetDate || goal.completedAt !== null) return null;
  if (overdue(goal)) return { text: t("late|goal"), late: true };
  return daysUntil(goal.targetDate) <= 7
    ? { text: relativeDay(goal.targetDate), late: false }
    : null;
}

/**
 * The open project's goals under its row in the sidebar, joined to it by a line, each with its
 * progress. Choosing one filters the board by it; the recently concluded wait in a menu behind one
 * line, and the rest in `ConcludedGoals`.
 */
export function SidebarGoals({
  goals,
  tasks,
  activeId,
  onSelect,
  onNew,
  onEdit,
  onComplete,
  onReopen,
  onDelete,
  onShowConcluded,
}: {
  goals: Goal[];
  tasks: Task[];
  activeId: string | null;
  onSelect: (goalId: string | null) => void;
  onNew: () => void;
  onShowConcluded: () => void;
  onEdit: (goal: Goal) => void;
  onComplete: (goal: Goal) => void;
  onReopen: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
}) {
  const [menu, setMenu] = useState<{
    goal: Goal;
    x: number;
    y: number;
    trigger: HTMLElement;
  } | null>(null);
  const open = goals.filter((g) => g.completedAt === null);
  const concluded = goals.filter((g) => g.completedAt !== null);
  const [concludedMenu, setConcludedMenu] = useState<{
    x: number;
    y: number;
    trigger: HTMLElement;
  } | null>(null);
  const row = (goal: Goal) => {
    const progress = goalProgress(goal, tasks);
    const active = goal.id === activeId;
    const day = nearDay(goal);
    const ready = goal.completedAt === null && complete(progress);
    return (
      <button
        key={goal.id}
        type="button"
        className={`goal-item ${active ? "selected" : ""} ${menu?.goal.id === goal.id ? "menu-open" : ""} ${goal.completedAt !== null ? "concluded" : ""}`}
        aria-pressed={active}
        aria-label={t("{0}, {1} of {2} done", [
          goal.name,
          progress.done,
          progress.total,
        ])}
        onClick={() => onSelect(active ? null : goal.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          const keyboard = event.clientX === 0 && event.clientY === 0;
          setMenu({
            goal,
            x: keyboard ? rect.left + 12 : event.clientX,
            y: keyboard ? rect.bottom : event.clientY,
            trigger: event.currentTarget,
          });
        }}
      >
        <span className="goal-line">
          <span className="goal-name truncate">{goal.name}</span>
          {day && (
            <span className={`goal-near ${day.late ? "late" : ""}`}>
              {day.text}
            </span>
          )}
          {ready ? (
            <span className="goal-ready">
              <Icon name="check" size={12} />
            </span>
          ) : (
            <span className="goal-count">
              {progress.done}/{progress.total}
            </span>
          )}
        </span>
        <GoalBar {...progress} />
      </button>
    );
  };
  const menuItems = (goal: Goal): MenuItem[] => {
    const items: MenuItem[] = [
      {
        label: t("Edit goal…"),
        icon: "pencil",
        onSelect: () => onEdit(goal),
      },
    ];
    if (goal.completedAt !== null)
      items.push({
        label: t("Reopen goal"),
        icon: "arrowUp",
        onSelect: () => onReopen(goal),
      });
    else if (complete(goalProgress(goal, tasks)))
      items.push({
        label: t("Conclude goal…"),
        icon: "check",
        onSelect: () => onComplete(goal),
      });
    items.push({
      label: t("Delete goal…"),
      icon: "trash",
      danger: true,
      separated: true,
      onSelect: () => onDelete(goal),
    });
    return items;
  };
  return (
    <>
      <div className="sidebar-goals" role="group" aria-label={t("Goals")}>
        {open.map(row)}
        <button type="button" className="goal-new" onClick={onNew}>
          <Icon name="plus" size={12} />
          {t("New goal")}
        </button>
        {concluded.length > 0 && (
          <button
            type="button"
            className={`goal-concluded ${concluded.some((g) => g.id === activeId) ? "selected" : ""}`}
            aria-haspopup="menu"
            aria-expanded={!!concludedMenu}
            onClick={(event) => {
              if (concludedMenu) return setConcludedMenu(null);
              const rect = event.currentTarget.getBoundingClientRect();
              // Opens to the side, so it doesn't cover the projects below.
              setConcludedMenu({
                x: rect.right + 4,
                y: rect.top,
                trigger: event.currentTarget,
              });
            }}
          >
            <Icon name="check" size={12} />
            {concluded.length === 1
              ? t("1 concluded")
              : t("{0} concluded", [concluded.length])}
            <Icon name="chevronRight" size={12} />
          </button>
        )}
      </div>
      {concludedMenu && (
        <ContextMenu
          x={concludedMenu.x}
          y={concludedMenu.y}
          label={t("Concluded")}
          anchor={{ current: concludedMenu.trigger }}
          items={goalChoices(concluded, activeId ?? "", onSelect, {
            recent: 3,
            onShowAll: onShowConcluded,
          })}
          onClose={(restoreFocus) => {
            if (restoreFocus) concludedMenu.trigger.focus();
            setConcludedMenu(null);
          }}
        />
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={t("Actions for {0}", [menu.goal.name])}
          items={menuItems(menu.goal)}
          onClose={(restoreFocus) => {
            if (restoreFocus) menu.trigger.focus();
            setMenu(null);
          }}
        />
      )}
    </>
  );
}

/**
 * Under the title while the board is filtered by a goal: its progress, its day and what it is
 * for, in place of the project's task count.
 */
export function GoalSummary({ goal, tasks }: { goal: Goal; tasks: Task[] }) {
  const progress = goalProgress(goal, tasks);
  return (
    <span className="goal-meta">
      {progress.total > 0 && (
        <span
          className="goal-progress"
          title={
            progress.total === 1
              ? t("{0} of 1 task done", [progress.done])
              : t("{0} of {1} tasks done", [progress.done, progress.total])
          }
        >
          <GoalProgressBar goal={goal} tasks={tasks} />
          {progress.done}/{progress.total}
        </span>
      )}
      {goal.targetDate && (
        <span
          className={`goal-day ${overdue(goal) ? "late" : ""}`}
          title={overdue(goal) ? t("The target date passed") : undefined}
        >
          <Icon name="flag" size={12} />
          {goalDay(goal.targetDate)}
          {goal.completedAt === null && ` · ${relativeDay(goal.targetDate)}`}
        </span>
      )}
      {goal.completedAt !== null && (
        <span className="chip muted">{t("Concluded|goal")}</span>
      )}
    </span>
  );
}

/**
 * Beside the view switch while the board is filtered by a goal: concluding it once every task is
 * done, or reopening it.
 */
export function GoalActions({
  goal,
  tasks,
  onComplete,
  onReopen,
}: {
  goal: Goal;
  tasks: Task[];
  onComplete: () => void;
  onReopen: () => void;
}) {
  if (goal.completedAt !== null)
    return (
      <button type="button" className="button small" onClick={onReopen}>
        {t("Reopen goal")}
      </button>
    );
  if (!complete(goalProgress(goal, tasks))) return null;
  return (
    <button type="button" className="button small primary" onClick={onComplete}>
      <Icon name="check" size={13} />
      {t("Conclude goal")}
    </button>
  );
}

/**
 * Every concluded goal of the project, grouped by the month it was concluded, to find one by name,
 * open it on the board, reopen it or delete it.
 */
export function ConcludedGoals({
  goals,
  tasks,
  onOpen,
  onReopen,
  onDelete,
  onClose,
}: {
  goals: Goal[];
  tasks: Task[];
  onOpen: (goal: Goal) => void;
  onReopen: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const concluded = byConcluded(goals);
  const needle = query.trim().toLocaleLowerCase(locale);
  const found = concluded.filter((g) =>
    g.name.toLocaleLowerCase(locale).includes(needle),
  );
  const thisYear = new Date().getFullYear();
  const months: { label: string; goals: Goal[] }[] = [];
  for (const goal of found) {
    const date = new Date(goal.completedAt! * 1000);
    const label = date.toLocaleDateString(locale, {
      month: "long",
      year: date.getFullYear() === thisYear ? undefined : "numeric",
    });
    const last = months[months.length - 1];
    if (last?.label === label) last.goals.push(goal);
    else months.push({ label, goals: [goal] });
  }
  return (
    <Modal
      title={t("Concluded goals")}
      onClose={onClose}
      className="concluded-modal"
    >
      <div className="modal-body concluded-body">
        <div className="concluded-search">
          <Icon name="search" size={14} />
          <input
            data-autofocus
            aria-label={t("Search goals")}
            placeholder={t("Search goals")}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="concluded-list scroll">
          {months.length === 0 && (
            <p className="concluded-empty">
              {concluded.length === 0
                ? t("No concluded goals.")
                : t("No goal matches “{0}”.", [query.trim()])}
            </p>
          )}
          {months.map((month) => (
            <section key={month.label} aria-label={month.label}>
              <h3 className="concluded-month">{month.label}</h3>
              {month.goals.map((goal) => {
                const { total } = goalProgress(goal, tasks);
                return (
                  <div key={goal.id} className="concluded-row">
                    <button
                      type="button"
                      className="concluded-open"
                      onClick={() => onOpen(goal)}
                    >
                      <span className="truncate">{goal.name}</span>
                      <span className="concluded-meta">
                        {total === 1
                          ? t("Concluded on {0} · 1 task", [
                              concludedDay(goal.completedAt!),
                            ])
                          : t("Concluded on {0} · {1} tasks", [
                              concludedDay(goal.completedAt!),
                              total,
                            ])}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="button small"
                      onClick={() => onReopen(goal)}
                    >
                      {t("Reopen")}
                    </button>
                    <button
                      type="button"
                      className="icon-button small danger-hover"
                      aria-label={t("Delete goal {0}…", [goal.name])}
                      data-tooltip={t("Delete goal…")}
                      data-tooltip-align="end"
                      onClick={() => onDelete(goal)}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/** Creates a goal in a project, or edits one. */
export function GoalComposer({
  projectId,
  goal,
  onClose,
  onSaved,
}: {
  projectId: string;
  goal?: Goal;
  onClose: () => void;
  onSaved: (goal: Goal) => void;
}) {
  const [name, setName] = useState(goal?.name ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      onSaved(
        await saveGoal(
          projectId,
          name,
          description,
          targetDate || null,
          goal?.id ?? null,
        ),
      );
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }
  return (
    <Modal
      title={goal ? t("Edit goal") : t("New goal")}
      onClose={onClose}
      className="goal-modal"
    >
      <form className="modal-form" onSubmit={submit}>
        <div className="modal-body">
          <Field label={t("Name")}>
            {({ id }) => (
              <input
                id={id}
                data-autofocus
                required
                maxLength={80}
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("E.g. Release 1")}
              />
            )}
          </Field>
          <Field
            label={t("Description, optional")}
            hint={t("What the goal delivers when its tasks are done.")}
          >
            {({ id, describedBy }) => (
              <textarea
                id={id}
                aria-describedby={describedBy}
                className="text-area short"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("Target date, optional")}>
            {({ id, labelId }) => (
              <DatePicker
                id={id}
                labelledBy={`${labelId} ${id}`}
                value={targetDate}
                onChange={setTargetDate}
              />
            )}
          </Field>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="modal-footer">
          <span className="footer-hint" />
          <button type="button" className="button" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="button primary" disabled={busy} aria-busy={busy}>
            {busy ? t("Saving…") : goal ? t("Save goal") : t("Create goal")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

/** Concludes a goal whose tasks are all done, after the person confirms. */
export function GoalComplete({
  goal,
  onClose,
  onDone,
}: {
  goal: Goal;
  onClose: () => void;
  onDone: (goal: Goal) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title={t("Conclude goal?")}
      className="confirm-modal"
      onClose={onClose}
    >
      <div className="modal-body">
        <p className="modal-text">
          {t(
            "“{0}” leaves the list of goals and waits under Concluded. Its tasks stay where they are.",
            [goal.name],
          )}
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="modal-footer">
        <span className="footer-hint" />
        <button type="button" className="button" onClick={onClose}>
          {t("Cancel")}
        </button>
        <button
          type="button"
          className="button primary"
          data-autofocus
          disabled={busy}
          aria-busy={busy}
          onClick={() => {
            setBusy(true);
            completeGoal(goal, true)
              .then(onDone)
              .catch((e) => {
                setError(errorMessage(e));
                setBusy(false);
              });
          }}
        >
          {t("Conclude goal")}
        </button>
      </footer>
    </Modal>
  );
}

/** Deletes a goal after confirming; its tasks stay on the board without one. */
export function GoalDelete({
  goal,
  taskCount,
  onClose,
  onDeleted,
}: {
  goal: Goal;
  taskCount: number;
  onClose: () => void;
  onDeleted: (goal: Goal) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title={t("Delete goal?")}
      className="confirm-modal"
      onClose={onClose}
    >
      <div className="modal-body">
        <p className="modal-text">
          {taskCount === 0
            ? t("“{0}” is deleted. This can't be undone.", [goal.name])
            : taskCount === 1
              ? t(
                  "“{0}” is deleted; its task stays on the board, without a goal. This can't be undone.",
                  [goal.name],
                )
              : t(
                  "“{0}” is deleted; its {1} tasks stay on the board, without a goal. This can't be undone.",
                  [goal.name, taskCount],
                )}
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="modal-footer">
        <span className="footer-hint" />
        <button type="button" className="button" onClick={onClose}>
          {t("Cancel")}
        </button>
        <button
          type="button"
          className="button danger"
          disabled={busy}
          aria-busy={busy}
          onClick={() => {
            setBusy(true);
            deleteGoal(goal)
              .then(() => onDeleted(goal))
              .catch((e) => {
                setError(errorMessage(e));
                setBusy(false);
              });
          }}
        >
          {t("Delete goal")}
        </button>
      </footer>
    </Modal>
  );
}
