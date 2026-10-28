import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragMoveEvent,
} from "@dnd-kit/core";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  completeGoal,
  deleteGoal,
  errorMessage,
  moveTask,
  saveGoal,
} from "../lib/api";
import { goalProgress, type Goal, type Task } from "../lib/types";
import { DatePicker, daysUntil, relativeDay } from "./DatePicker";
import { AutoTextarea } from "./AutoTextarea";
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
export function GoalProgressBar({
  goal,
  tasks,
}: {
  goal: Goal;
  tasks: Task[];
}) {
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
export function concludedDay(seconds: number) {
  const date = new Date(seconds * 1000);
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

/** Where a goal stands: concluded, started once a task moved past To do, or not started. */
export type GoalStage = "started" | "waiting" | "concluded";
export function goalStage(goal: Goal, tasks: Task[]): GoalStage {
  if (goal.completedAt !== null) return "concluded";
  return tasks.some(
    (task) =>
      task.goalId === goal.id &&
      (task.status === "done" ||
        task.status === "review" ||
        task.status === "inProgress"),
  )
    ? "started"
    : "waiting";
}
const stageRank: Record<GoalStage, number> = {
  started: 0,
  waiting: 1,
  concluded: 2,
};

/**
 * The goals as the project page and the sidebar list them: the started ones, then those not
 * started, then the concluded, the latest first. By progress, the started ones closest to done
 * lead and move as their tasks do. `manual` keeps, inside each group, the order they were dragged to.
 */
export function orderGoals(goals: Goal[], tasks: Task[], manual: boolean) {
  const facts = new Map(
    goals.map((goal) => {
      const own = tasks.filter((task) => task.goalId === goal.id);
      const total = own.length || 1;
      const done = own.filter((task) => task.status === "done").length;
      const review = own.filter((task) => task.status === "review").length;
      return [
        goal.id,
        {
          stage: goalStage(goal, tasks),
          done: done / total,
          near: (done + review) / total,
        },
      ];
    }),
  );
  return [...goals].sort((a, b) => {
    const x = facts.get(a.id)!;
    const y = facts.get(b.id)!;
    if (x.stage !== y.stage) return stageRank[x.stage] - stageRank[y.stage];
    if (x.stage === "concluded") return b.completedAt! - a.completedAt!;
    if (
      !manual &&
      x.stage === "started" &&
      (y.done !== x.done || y.near !== x.near)
    )
      return y.done - x.done || y.near - x.near;
    return a.position - b.position;
  });
}

/** The concluded goals, the most recently concluded first. */
const byConcluded = (goals: Goal[]) =>
  goals
    .filter((g) => g.completedAt !== null)
    .sort((a, b) => b.completedAt! - a.completedAt!);

/** The open goals: those with a version first, the lowest first, then the rest in their order. */
const byVersion = (goals: Goal[]) =>
  goals
    .filter((g) => g.completedAt === null)
    .sort((a, b) =>
      a.version && b.version
        ? a.version.localeCompare(b.version, undefined, { numeric: true })
        : Number(!a.version) - Number(!b.version),
    );

/**
 * The project's goals as menu rows to open one: the open ones by version, then the `recent` most recently
 * concluded grayed in their own group, with their day, and a row to see them all when more wait.
 * With `onNew`, a row to create one. That row and "see all" stay below the scrolling goals.
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
  const open = byVersion(goals);
  const concluded = byConcluded(goals);
  const items: MenuItem[] = [
    ...open.map((g) => ({
      label: g.name,
      tag: g.version ?? undefined,
      icon: "target" as const,
      checked: currentId === null ? undefined : g.id === currentId,
      highlight: true,
      onSelect: () => onPick(g.id),
    })),
    ...(onNew
      ? [
          {
            label: t("New goal"),
            icon: "plus" as const,
            pinned: true,
            onSelect: onNew,
          },
        ]
      : []),
    ...concluded.slice(0, recent).map((g, index) => ({
      label: g.name,
      tag: g.version ?? undefined,
      icon: "check" as const,
      muted: true,
      hint: concludedDay(g.completedAt!),
      checked: currentId === null ? undefined : g.id === currentId,
      highlight: true,
      separated: index === 0 && open.length > 0,
      section: index === 0 ? t("Concluded") : undefined,
      onSelect: () => onPick(g.id),
    })),
  ];
  if (concluded.length > recent)
    items.push({
      label: t("See all {0}…", [concluded.length]),
      pinned: true,
      onSelect: onShowAll,
    });
  return items;
}

/** Past this many open goals, their menus get a field to find one by name. */
export const goalSearch = (goals: Goal[]) =>
  goals.filter((g) => g.completedAt === null).length > 10
    ? {
        label: t("Search goals"),
        empty: (query: string) => t("No goal matches “{0}”.", [query]),
      }
    : undefined;

/**
 * The rail's stand-in for `SidebarGoals`: a target under the open project's mark that opens its
 * goals in a menu, as the board's goal picker does. Nothing shows while the project has no goals.
 */
export function RailGoals({
  goals,
  activeId,
  onSelect,
  onNew,
  onShowConcluded,
}: {
  goals: Goal[];
  activeId: string | null;
  onSelect: (goalId: string) => void;
  onNew: () => void;
  onShowConcluded: () => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  if (goals.length === 0) return null;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`nav-item ${menu ? "menu-open" : ""}`}
        aria-label={t("Goals")}
        aria-haspopup="menu"
        aria-expanded={!!menu}
        data-tooltip={menu ? undefined : t("Goals")}
        data-tooltip-side="right"
        onClick={() => {
          if (menu) return setMenu(null);
          const rect = trigger.current!.getBoundingClientRect();
          setMenu({ x: rect.right + 6, y: rect.top });
        }}
      >
        <span className="nav-leading">
          <Icon name="target" size={15} />
        </span>
      </button>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          anchor={trigger}
          label={t("Goals")}
          className="goal-menu"
          search={goalSearch(goals)}
          items={goalChoices(goals, activeId ?? "", onSelect, {
            recent: 3,
            onShowAll: onShowConcluded,
            onNew,
          })}
          onClose={(restoreFocus) => {
            if (restoreFocus) trigger.current?.focus();
            setMenu(null);
          }}
        />
      )}
    </>
  );
}

/**
 * The open project's goals under its row in the sidebar, beside a stripe in the project's color,
 * one line each: the row fills as its tasks get done, and its name turns red once its target date
 * passed. Choosing one filters the board by it; the concluded ones are counted beside "New goal",
 * which opens them on the project page.
 */
export function SidebarGoals({
  goals,
  tasks,
  color,
  activeId,
  onSelect,
  onNew,
  onEdit,
  onComplete,
  onReopen,
  onDelete,
  onMove,
  onShowConcluded,
}: {
  goals: Goal[];
  tasks: Task[];
  /** The project's color, for the stripe beside its goals. */
  color: string;
  activeId: string | null;
  onSelect: (goalId: string | null) => void;
  onNew: () => void;
  onShowConcluded: () => void;
  onEdit: (goal: Goal) => void;
  onComplete: (goal: Goal) => void;
  onReopen: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  /** Saves a new place for the goal, right after `afterId` or at the top. */
  onMove: (goal: Goal, afterId: string | null) => void;
}) {
  const [menu, setMenu] = useState<{
    goal: Goal;
    x: number;
    y: number;
    trigger: HTMLElement;
  } | null>(null);
  // The order just dropped, shown until the saved one comes back with the goals.
  const [order, setOrder] = useState<string[] | null>(null);
  useEffect(() => setOrder(null), [goals]);
  const listed = goals.filter((g) => g.completedAt === null);
  const open = order
    ? order.flatMap((id) => listed.filter((g) => g.id === id))
    : listed;
  const concluded = goals.filter((g) => g.completedAt !== null);
  const [dragged, setDragged] = useState<Goal | null>(null);
  // Where the dragged goal would land, counted among the other open goals.
  const [drop, setDrop] = useState<number | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const lastDrop = useRef(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const others = open.filter((g) => g.id !== dragged?.id);
  const origin = dragged ? open.indexOf(dragged) : -1;
  const track = ({ activatorEvent, delta }: DragMoveEvent) => {
    const y = (activatorEvent as PointerEvent).clientY + delta.y;
    setDrop(
      others.filter((g) => {
        const rect = rows.current.get(g.id)?.getBoundingClientRect();
        return rect && rect.top + rect.height / 2 < y;
      }).length,
    );
  };
  /** Puts the goal at `index` among the other open goals and saves it. */
  const place = (goal: Goal, index: number) => {
    const rest = open.filter((g) => g.id !== goal.id);
    if (index < 0 || index > rest.length || index === open.indexOf(goal))
      return;
    setOrder(
      [...rest.slice(0, index), goal, ...rest.slice(index)].map((g) => g.id),
    );
    onMove(goal, index === 0 ? null : rest[index - 1].id);
  };
  // The concluded ones show only their count beside "New goal": the words go in the label.
  const concludedLabel =
    concluded.length === 1
      ? t("1 concluded")
      : t("{0} concluded", [concluded.length]);
  const row = (goal: Goal, overlay = false) => {
    const progress = goalProgress(goal, tasks);
    const active = goal.id === activeId;
    const late = overdue(goal);
    const percent = progress.total
      ? Math.round((progress.done / progress.total) * 100)
      : null;
    const fill = { "--progress": `${percent ?? 0}%` } as CSSProperties;
    const className = `goal-item ${active ? "selected" : ""} ${menu?.goal.id === goal.id ? "menu-open" : ""} ${late ? "late" : ""}`;
    const content = (
      <>
        <span
          className="goal-name truncate"
          title={late ? t("The target date passed") : undefined}
        >
          {goal.name}
        </span>
        {percent !== null && (
          <span className="goal-percent" aria-hidden="true">
            {percent}%
          </span>
        )}
      </>
    );
    // The copy that follows the pointer while the goal is dragged.
    if (overlay)
      return (
        <div className={`${className} drag-overlay`} style={fill}>
          {content}
        </div>
      );
    return (
      <SidebarGoalRow
        key={goal.id}
        id={goal.id}
        style={fill}
        rowRef={(node) => {
          if (node) rows.current.set(goal.id, node);
          else rows.current.delete(goal.id);
        }}
        className={`${className} ${dragged?.id === goal.id ? "dragging" : ""}`}
        pressed={active}
        label={t("{0}, {1} of {2} done", [
          goal.name,
          progress.done,
          progress.total,
        ])}
        onClick={() => {
          // A pointer released over the row right after a drag must not open it.
          if (performance.now() - lastDrop.current < 250) return;
          onSelect(active ? null : goal.id);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          // Shift+F10 and the menu key report no pointer position: open under the row then.
          const keyboard =
            !("clientX" in event) ||
            (event.clientX === 0 && event.clientY === 0);
          setMenu({
            goal,
            x: keyboard ? rect.left + 12 : event.clientX,
            y: keyboard ? rect.bottom : event.clientY,
            trigger: event.currentTarget,
          });
        }}
      >
        {content}
      </SidebarGoalRow>
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
    const index = open.indexOf(goal);
    if (index > 0)
      items.push({
        label: t("Move up"),
        icon: "arrowUp",
        onSelect: () => place(goal, index - 1),
      });
    if (index >= 0 && index < open.length - 1)
      items.push({
        label: t("Move down"),
        icon: "arrowDown",
        onSelect: () => place(goal, index + 1),
      });
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
      <div
        className="sidebar-goals"
        role="group"
        aria-label={t("Goals")}
        style={{ "--goal-stripe": color } as CSSProperties}
      >
        <DndContext
          sensors={sensors}
          onDragStart={({ active }) => {
            setDragged(open.find((g) => g.id === active.id) ?? null);
            setDrop(null);
          }}
          onDragMove={track}
          onDragCancel={() => {
            setDragged(null);
            setDrop(null);
          }}
          onDragEnd={() => {
            lastDrop.current = performance.now();
            if (dragged && drop !== null) place(dragged, drop);
            setDragged(null);
            setDrop(null);
          }}
        >
          {open.map((goal) => {
            const line =
              dragged &&
              drop !== null &&
              drop !== origin &&
              goal.id !== dragged.id &&
              others.indexOf(goal) === drop;
            return [
              line && <span key="drop" className="goal-drop" />,
              row(goal),
            ];
          })}
          {dragged && drop === others.length && drop !== origin && (
            <span className="goal-drop" />
          )}
          <DragOverlay dropAnimation={null}>
            {dragged && row(dragged, true)}
          </DragOverlay>
        </DndContext>
        <div className="goal-footer">
          <button type="button" className="goal-new" onClick={onNew}>
            <Icon name="plus" size={12} />
            {t("New goal")}
          </button>
          {concluded.length > 0 && (
            <button
              type="button"
              className={`goal-concluded ${concluded.some((g) => g.id === activeId) ? "selected" : ""}`}
              aria-label={concludedLabel}
              title={concludedLabel}
              onClick={onShowConcluded}
            >
              <Icon name="check" size={12} />
              {concluded.length}
            </button>
          )}
        </div>
      </div>
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

/** Creates a goal in a project, or edits one. */
export function GoalComposer({
  projectId,
  goal,
  versions,
  onClose,
  onSaved,
}: {
  projectId: string;
  goal?: Goal;
  /** The versions the project's goals already use, suggested as the person types. */
  versions: string[];
  onClose: () => void;
  onSaved: (goal: Goal) => void;
}) {
  const [name, setName] = useState(goal?.name ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [version, setVersion] = useState(goal?.version ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const versionsId = useId();
  const dateLabelId = useId();
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
          version.trim() || null,
          goal?.id ?? null,
        ),
      );
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }
  return (
    <Modal title={goal ? t("Edit goal") : t("New goal")} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="modal-body goal-form">
          <AutoTextarea
            data-autofocus
            required
            maxLength={80}
            maxRows={3}
            submitOnEnter
            className="sheet-title"
            aria-label={t("Name")}
            value={name}
            onChange={(e) => setName(e.target.value.replace(/\n/g, " "))}
            placeholder={t("E.g. Release 1")}
          />
          <div className="prop-chips">
            <label className="prop-chip goal-version-chip">
              <Icon name="package" size={12} />
              <input
                list={`${versionsId}-versions`}
                maxLength={24}
                style={{
                  width: `${(version || t("Version")).length + 1}ch`,
                }}
                autoComplete="off"
                spellCheck={false}
                aria-label={t("Version, optional")}
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder={t("Version")}
              />
              <datalist id={`${versionsId}-versions`}>
                {versions.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </label>
            <DatePicker
              chip
              labelledBy={dateLabelId}
              value={targetDate}
              onChange={setTargetDate}
            />
            <span id={dateLabelId} hidden>
              {t("Target date, optional")}
            </span>
          </div>
          <AutoTextarea
            className="goal-description"
            minRows={8}
            maxRows={18}
            aria-label={t("Description, optional")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("What the goal delivers when its tasks are done.")}
          />
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

/**
 * Reopens a concluded goal. Its done tasks can stay done or go back to In review,
 * the latest one on top, each still with whoever had it.
 */
export function GoalReopen({
  goal,
  done,
  onClose,
  onReopened,
}: {
  goal: Goal;
  /** The goal's done tasks. */
  done: Task[];
  onClose: () => void;
  onReopened: (goal: Goal, reviewed: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reopen = async (review: boolean) => {
    setBusy(true);
    try {
      await completeGoal(goal, false);
      if (review) {
        const latest = [...done].sort(
          (a, b) =>
            (b.archivedAt ?? b.updatedAt) - (a.archivedAt ?? a.updatedAt),
        );
        let after: string | null = null;
        for (const task of latest) {
          await moveTask(task, "review", after);
          after = task.id;
        }
      }
      onReopened(goal, review ? done.length : 0);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <Modal
      title={t("Reopen goal?")}
      className="confirm-modal"
      onClose={onClose}
    >
      <div className="modal-body">
        <p className="modal-text">
          {done.length === 1
            ? t(
                "“{0}” goes back to the open goals. Its task can stay done or go back to In review.",
                [goal.name],
              )
            : t(
                "“{0}” goes back to the open goals. Its {1} tasks can stay done or go back to In review.",
                [goal.name, done.length],
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
          className="button"
          disabled={busy}
          onClick={() => void reopen(false)}
        >
          {t("Just reopen")}
        </button>
        <button
          type="button"
          className="button primary"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void reopen(true)}
        >
          {done.length === 1
            ? t("Reopen and review it")
            : t("Reopen and review the {0}", [done.length])}
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
                  "“{0}” is deleted. Its task stays on the board, without a goal. This can't be undone.",
                  [goal.name],
                )
              : t(
                  "“{0}” is deleted. Its {1} tasks stay on the board, without a goal. This can't be undone.",
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

/** One open goal in the sidebar, dragged to change its place in the list. */
function SidebarGoalRow({
  id,
  rowRef,
  style,
  className,
  pressed,
  label,
  onClick,
  onContextMenu,
  children,
}: {
  id: string;
  rowRef: (node: HTMLElement | null) => void;
  style: CSSProperties;
  className: string;
  pressed: boolean;
  label: string;
  onClick: () => void;
  onContextMenu: (
    event: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>,
  ) => void;
  children: ReactNode;
}) {
  const { listeners, setNodeRef } = useDraggable({ id });
  return (
    <button
      ref={(node) => {
        setNodeRef(node);
        rowRef(node);
      }}
      type="button"
      className={className}
      style={style}
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={(event) => {
        if (event.shiftKey && event.key === "F10") onContextMenu(event);
      }}
      {...listeners}
    >
      {children}
    </button>
  );
}
