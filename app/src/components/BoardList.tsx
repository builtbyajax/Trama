import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragMoveEvent,
} from "@dnd-kit/core";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ago,
  byPosition,
  statusTitle,
  type Goal,
  type Task,
  type TaskStatus,
} from "../lib/types";
import { Glyph } from "./BoardFilters";
import {
  agentName,
  agentTint,
  useAgentProfile,
  useWorkState,
} from "../lib/agents";
import { Icon, StatusIcon } from "./Icon";
import { menuRequest, type MenuRequest } from "./TaskMenu";
import { t } from "../lib/i18n";

/** The kanban's columns read from the end: closest to done first, the backlog last. */
export const listOrder: TaskStatus[] = [
  "review",
  "inProgress",
  "todo",
  "backlog",
];

/** Where a moved row would land: a group and an index among the group's other rows. */
interface Drop {
  status: TaskStatus;
  index: number;
}

const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

/**
 * The board as a list, for those who prefer it to columns: one group per stage, one row per task,
 * in the same manual order. Rows are dragged like cards: inside a group to change the priority,
 * to another group to change the stage. From the keyboard, Space picks a row up, ↑/↓ choose the
 * place (crossing into the next group), Space drops it and Esc cancels.
 */
export function BoardList({
  tasks,
  goals,
  landedId,
  selectedId,
  menuId,
  onMenu,
  onMove,
  onOpen,
}: {
  tasks: Task[];
  goals: Goal[];
  /** Recently moved row, highlighted once it lands in its new place. */
  landedId?: string | null;
  selectedId?: string | null;
  menuId?: string | null;
  onMenu?: (request: MenuRequest) => void;
  /** `afterId` is the visible row the task goes after, or null for the top of the group. */
  onMove: (taskId: string, status: TaskStatus, afterId: string | null) => void;
  onOpen: (task: Task) => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  const lists = useRef(new Map<TaskStatus, HTMLUListElement>());
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const lastDrop = useRef(Number.NEGATIVE_INFINITY);
  const committed = useRef<string | null>(null);
  const [dragged, setDragged] = useState<Task | null>(null);
  const [keyboardId, setKeyboardId] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const groups = useMemo(() => {
    const result = {} as Record<TaskStatus, Task[]>;
    for (const status of listOrder)
      result[status] = tasks
        .filter((task) => task.status === status)
        .sort(byPosition);
    return result;
  }, [tasks]);
  const moving = dragged ?? tasks.find((task) => task.id === keyboardId);
  const others = (status: TaskStatus, id: string) =>
    groups[status].filter((task) => task.id !== id);
  const origin = (task: Task) =>
    groups[task.status].findIndex((other) => other.id === task.id);
  /** The drop lands somewhere other than where the row already is. */
  const changed = Boolean(
    moving &&
    drop &&
    (drop.status !== moving.status || drop.index !== origin(moving)),
  );
  // Keep focus on a row moved from the keyboard once it is drawn in its new place.
  useEffect(() => {
    const id = committed.current;
    if (!id) return;
    const row = body.current?.querySelector<HTMLElement>(
      `.row-button[data-task-id="${CSS.escape(id)}"]`,
    );
    if (row) {
      row.focus({ preventScroll: true });
      row.scrollIntoView({ block: "nearest" });
      committed.current = null;
    }
  }, [groups]);
  useEffect(() => {
    document.documentElement.classList.toggle("is-dragging", Boolean(dragged));
    return () => document.documentElement.classList.remove("is-dragging");
  }, [dragged]);
  function commit(task: Task, target: Drop) {
    const rest = others(target.status, task.id);
    onMove(task.id, target.status, rest[target.index - 1]?.id ?? null);
  }
  /** Index among the other rows of `status` under the pointer. */
  function locate(status: TaskStatus | null) {
    const point = pointer.current;
    const list = status && lists.current.get(status);
    if (!dragged || !point || !list || !status) {
      setDrop(dragged && { status: dragged.status, index: origin(dragged) });
      return;
    }
    const rows = [
      ...list.querySelectorAll<HTMLElement>(".list-row[data-task-id]"),
    ].filter((row) => row.dataset.taskId !== dragged.id);
    let index = 0;
    rows.forEach((row, i) => {
      const rect = row.getBoundingClientRect();
      if (rect.top + rect.height / 2 < point.y) index = i + 1;
    });
    setDrop((current) =>
      current?.status === status && current.index === index
        ? current
        : { status, index },
    );
  }
  function track(event: DragMoveEvent) {
    const start = event.activatorEvent as PointerEvent | null;
    if (start && "clientX" in start)
      pointer.current = {
        x: start.clientX + event.delta.x,
        y: start.clientY + event.delta.y,
      };
    locate((event.over?.id as TaskStatus | undefined) ?? null);
  }
  function finish() {
    setDragged(null);
    setDrop(null);
    pointer.current = null;
    lastDrop.current = performance.now();
  }
  const where = (target: Drop) =>
    t("{0}, position {1} of {2}", [
      statusTitle[target.status],
      target.index + 1,
      others(target.status, moving?.id ?? "").length + 1,
    ]);
  function handleKey(task: Task, event: KeyboardEvent<HTMLDivElement>) {
    const active = keyboardId === task.id && drop;
    const stop = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (event.code === "Space") {
      stop();
      if (active) {
        setKeyboardId(null);
        setDrop(null);
        if (changed) {
          committed.current = task.id;
          commit(task, active);
          setAnnouncement(t("{0}. Moved to {1}.", [task.title, where(active)]));
        } else
          setAnnouncement(t("{0}. Stays in the same place.", [task.title]));
      } else {
        setKeyboardId(task.id);
        setDrop({ status: task.status, index: origin(task) });
        setAnnouncement(
          t("{0}. Use the arrows to choose the stage and position.", [
            task.title,
          ]),
        );
      }
      return;
    }
    if (active) {
      if (event.code === "Escape") {
        stop();
        setKeyboardId(null);
        setDrop(null);
        setAnnouncement(t("Move cancelled."));
        return;
      }
      if (event.code === "ArrowUp" || event.code === "ArrowDown") {
        stop();
        // Every place in reading order: each group's slots, top to bottom.
        const places = listOrder.flatMap((status) =>
          Array.from(
            { length: others(status, task.id).length + 1 },
            (_, index) => ({ status, index }),
          ),
        );
        const at = places.findIndex(
          (p) => p.status === active.status && p.index === active.index,
        );
        const next =
          places[
            Math.max(
              0,
              Math.min(
                places.length - 1,
                at + (event.code === "ArrowDown" ? 1 : -1),
              ),
            )
          ];
        setDrop(next);
        setAnnouncement(
          t("Target: {0}. Press Space to drop or Esc to cancel.", [
            where(next),
          ]),
        );
        return;
      }
      return;
    }
    if (event.key === "Enter") {
      stop();
      onOpen(task);
      return;
    }
    const request = onMenu && menuRequest(event, task);
    if (request) onMenu(request);
  }
  const goalName = (id: string | null) =>
    goals.find((g) => g.id === id)?.name ?? null;
  const row = (task: Task, overlay = false) => (
    <ListRow
      key={task.id}
      task={task}
      goal={goalName(task.goalId)}
      overlay={overlay}
      origin={moving?.id === task.id}
      landed={landedId === task.id}
      selected={selectedId === task.id || menuId === task.id}
      onMenu={dragged ? undefined : onMenu}
      onKey={(event) => handleKey(task, event)}
      onOpen={() => {
        // A pointer released over the row right after a drag must not open it.
        if (performance.now() - lastDrop.current < 250) return;
        onOpen(task);
      }}
    />
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      accessibility={{
        screenReaderInstructions: {
          draggable: t(
            "Press Space to move the task. Use the up and down arrows to choose the stage and position, Space to drop and Esc to cancel. Press Enter to open the details.",
          ),
        },
      }}
      onDragStart={({ active }) => {
        const task = tasks.find((item) => item.id === active.id);
        if (!task) return;
        setKeyboardId(null);
        setDragged(task);
        setDrop({ status: task.status, index: origin(task) });
      }}
      onDragMove={track}
      onDragOver={track}
      onDragCancel={finish}
      onDragEnd={() => {
        const task = dragged;
        const target = drop;
        const move = changed;
        finish();
        if (task && target && move) commit(task, target);
      }}
    >
      <div
        ref={body}
        className={`board-list scroll ${dragged ? "dragging" : ""}`}
      >
        {tasks.length === 0 ? (
          <div className="empty-state">
            <Icon name="board" size={22} />
            <strong>{t("No tasks with these filters")}</strong>
            <p>{t("Change the category, branch or assignee.")}</p>
          </div>
        ) : (
          listOrder.map((status) => {
            const group = groups[status];
            const line =
              changed && drop?.status === status
                ? (others(status, moving!.id)[drop.index]?.id ?? "end")
                : null;
            const nodes: ReactNode[] = group.flatMap((task) =>
              line === task.id
                ? [<DropLine key="line" />, row(task)]
                : [row(task)],
            );
            if (line === "end") nodes.push(<DropLine key="line" />);
            return (
              <ListGroup
                key={status}
                status={status}
                count={group.length}
                target={changed && drop?.status === status}
                listRef={(node) => {
                  if (node) lists.current.set(status, node);
                  else lists.current.delete(status);
                }}
              >
                {nodes}
              </ListGroup>
            );
          })
        )}
      </div>
      <span className="sr-only" role="status">
        {announcement}
      </span>
      <DragOverlay dropAnimation={null}>
        {dragged && row(dragged, true)}
      </DragOverlay>
    </DndContext>
  );
}

function ListGroup({
  status,
  count,
  target,
  listRef,
  children,
}: {
  status: TaskStatus;
  count: number;
  target: boolean;
  listRef: (node: HTMLUListElement | null) => void;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      className={`list-group ${count === 0 ? "empty" : ""} ${target ? "drop-target" : ""}`}
      aria-label={statusTitle[status]}
    >
      <h2 className="list-group-head">
        <StatusIcon status={status} />
        {statusTitle[status]}
        <span className="count" aria-label={t("{0} tasks", [count])}>
          {count}
        </span>
      </h2>
      <ul ref={listRef} className="rows">
        {children}
      </ul>
    </section>
  );
}

const DropLine = () => <li className="drop-line" aria-hidden="true" />;

function ListRow({
  task,
  goal,
  overlay,
  origin,
  landed,
  selected,
  onMenu,
  onKey,
  onOpen,
}: {
  task: Task;
  goal: string | null;
  /** The copy that follows the pointer. */
  overlay: boolean;
  /** Being moved: its place stays outlined. */
  origin: boolean;
  landed: boolean;
  selected: boolean;
  onMenu?: (request: MenuRequest) => void;
  onKey: (event: KeyboardEvent<HTMLDivElement>) => void;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: task.id,
    disabled: overlay,
  });
  const work = useWorkState(task);
  const profile = useAgentProfile(task.agentProfileId);
  const state = [
    overlay && "drag-overlay",
    !overlay && origin && "drag-origin",
    landed && "landed",
    selected && "selected",
    work && "working",
  ]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      <span className="row-title truncate">{task.title}</span>
      <span className="list-cell truncate">{task.category}</span>
      <span className={`list-cell truncate ${goal ? "" : "faint"}`}>
        {goal ?? t("No goal")}
      </span>
      <span className="list-cell list-who">
        <Glyph who={task.assignee} profileId={task.agentProfileId} />
        <span className="truncate">
          {task.assignee === "user"
            ? t("You")
            : work === "stopped"
              ? `${agentName(profile)}, ${t("Stopped").toLowerCase()}`
              : agentName(profile)}
        </span>
      </span>
      <span className="list-cell list-when">{ago(task.updatedAt)}</span>
    </>
  );
  if (overlay)
    return (
      <div
        className={`list-row ${state}`}
        style={work ? agentTint(profile) : undefined}
      >
        <div className="row-button">{content}</div>
      </div>
    );
  return (
    <li
      className={`list-row ${state}`}
      style={work ? agentTint(profile) : undefined}
      data-task-id={task.id}
    >
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className="row-button"
        data-task-id={task.id}
        aria-pressed={origin}
        aria-haspopup={onMenu ? "menu" : undefined}
        onClick={onOpen}
        onContextMenu={(event) => {
          const request = onMenu && menuRequest(event, task);
          if (request) onMenu(request);
        }}
        onKeyDown={onKey}
      >
        {content}
      </div>
    </li>
  );
}
