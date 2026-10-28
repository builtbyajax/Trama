import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragMoveEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import { useBoardKeyboard, type BoardColumns } from "../hooks/useBoardKeyboard";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type { CSSProperties, KeyboardEvent, ReactNode, RefObject } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  boardStatuses,
  byPosition,
  statusTitle,
  type Goal,
  type Task,
  type TaskStatus,
} from "../lib/types";
import { Icon, StatusIcon } from "./Icon";
import {
  BranchesContext,
  GoalNamesContext,
  TaskCard,
  TaskCardContent,
} from "./TaskCard";
import type { MenuRequest } from "./TaskMenu";
import { t } from "../lib/i18n";

interface BoardProps {
  tasks: Task[];
  /** The project's local branches; null while unknown. */
  branches?: string[] | null;
  /** Goals named on the cards; left out when the board shows a single goal. */
  goals?: Goal[];
  /** Recently moved card, highlighted once it lands in its new place. */
  landedId?: string | null;
  /** Task open in the sheet, outlined on the board. */
  selectedId?: string | null;
  /** Task whose right-click menu is open. */
  menuId?: string | null;
  onMenu?: (request: MenuRequest) => void;
  /** `afterId` is the visible card the task goes after, or null for the top of the column. */
  onMove: (taskId: string, status: TaskStatus, afterId: string | null) => void;
  onOpen: (task: Task) => void;
  /** Concluded tasks under the same filters, the latest first: a column at the end, closed or open. */
  concluded?: Task[];
  doneOpen?: boolean;
  onDoneOpen?: (open: boolean) => void;
  onArchive?: () => void;
}

/** Where a dragged card would land: a column and an index among the other cards in it. */
interface Drop {
  status: TaskStatus;
  index: number;
}

// The bar to conclude lies over the columns and wins; otherwise the column under the pointer
// wins, and the overlay rectangle is only a fallback for the gaps.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const done = hits.find((hit) => hit.id === "done");
  if (done) return [done];
  return hits.length ? hits : rectIntersection(args);
};
// A card let go outside any column flies back upright into its outline, which it then replaces
// at once: no tilt left at the end, no fade in after it, no jump. The end is measured from where
// both cards really are, since dnd-kit's own measure can be a few pixels off and the card would
// land beside its outline and then snap into it.
const returnAnimation: DropAnimation = {
  duration: 180,
  easing: "cubic-bezier(.2,.8,.2,1)",
  keyframes: ({ active, dragOverlay, transform: { initial } }) => {
    const from = dragOverlay.node.getBoundingClientRect();
    const to = active.node.getBoundingClientRect();
    const at = (x: number, y: number) => `translate3d(${x}px, ${y}px, 0)`;
    return [
      { transform: at(initial.x, initial.y) },
      {
        transform: at(
          initial.x + to.left - from.left,
          initial.y + to.top - from.top,
        ),
      },
    ];
  },
  sideEffects: ({ active, dragOverlay }) => {
    active.node.dataset.returning = "";
    dragOverlay.node.dataset.returning = "";
    return () => {
      active.node.style.transition = "none";
      delete active.node.dataset.returning;
      void active.node.offsetWidth;
      active.node.style.transition = "";
    };
  },
};
const cardGap = 8;
const edge = 56;
/** A stage's colour for what it holds, the accent when there is none. */
export const laneOf = (status: TaskStatus | undefined) =>
  status ? ({ "--lane": `var(--s-${status})` } as CSSProperties) : undefined;
// The bar to conclude appears when the drag starts, so rects are measured during the drag.
const measuring = { droppable: { strategy: MeasuringStrategy.Always } };

/**
 * Four columns in the stored manual order. While a card is dragged it leaves its place and a slot
 * of the same height follows the pointer between the other cards, so the slot is exactly where the
 * card will land; outside any column the slot returns to the card's original place. A card dropped
 * on the bar that rises at the bottom while dragging is concluded and goes to the Archive.
 */
export function Board({
  tasks,
  branches = null,
  goals = [],
  landedId,
  selectedId,
  menuId,
  onMenu,
  onMove,
  onOpen,
  concluded,
  doneOpen = false,
  onDoneOpen,
  onArchive,
}: BoardProps) {
  const goalNames = useMemo(
    () => new Map(goals.map((goal) => [goal.id, goal.name])),
    [goals],
  );
  const [drag, setDrag] = useState<{ task: Task; height: number } | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  // Set when a drop changes the card's place: the overlay must vanish instead of flying back.
  const [landing, setLanding] = useState(false);
  const box = useRef<SVGSVGElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const [flight, setFlight] = useState<{ task: Task; rect: DOMRect } | null>(
    null,
  );
  const lastDrop = useRef(Number.NEGATIVE_INFINITY);
  const dropRef = useRef<Drop | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const bodies = useRef(new Map<TaskStatus, HTMLDivElement>());
  const reduceMotion = useReducedMotion();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const columns = useMemo(() => {
    const result = {} as BoardColumns;
    for (const status of boardStatuses)
      result[status] = tasks
        .filter((task) => task.status === status)
        .sort(byPosition);
    return result;
  }, [tasks]);
  const keyboard = useBoardKeyboard(columns, onMove);
  // A concluded card dragged out of the done column is reopened where it lands.
  const origin = !drag
    ? null
    : drag.task.status === "done"
      ? { status: drag.task.status, index: 0 }
      : {
          status: drag.task.status,
          index: columns[drag.task.status].findIndex(
            (t) => t.id === drag.task.id,
          ),
        };
  const atOrigin =
    !drop ||
    !origin ||
    (drop.status === origin.status && drop.index === origin.index);
  function setDropTo(next: Drop | null) {
    const current = dropRef.current;
    if (current?.status === next?.status && current?.index === next?.index)
      return;
    dropRef.current = next;
    setDrop(next);
  }
  useEffect(() => {
    document.documentElement.classList.toggle("is-dragging", Boolean(drag));
    return () => document.documentElement.classList.remove("is-dragging");
  }, [drag]);
  // Long columns scroll by themselves while the pointer rests near their top or bottom edge.
  useEffect(() => {
    if (!drag) return;
    let frame = 0;
    const tick = () => {
      const point = pointer.current;
      const status = dropRef.current?.status;
      const body = status && bodies.current.get(status);
      if (point && body) {
        const rect = body.getBoundingClientRect();
        // The bar to conclude covers the end of the column, so scrolling starts above it.
        const bottom = Math.min(
          rect.bottom,
          zone.current?.getBoundingClientRect().top ?? rect.bottom,
        );
        const inside = point.x >= rect.left && point.x <= rect.right;
        const up = point.y - rect.top;
        const down = bottom - point.y;
        const speed =
          inside && up < edge && up > -40
            ? -Math.ceil((edge - Math.max(0, up)) / 4)
            : inside && down < edge && down > -40
              ? Math.ceil((edge - Math.max(0, down)) / 4)
              : 0;
        if (speed) {
          const before = body.scrollTop;
          body.scrollTop += speed;
          if (body.scrollTop !== before) locate(status);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [drag]);
  /** Index among the other cards of `status` under the pointer, ignoring the slot's own height. */
  function locate(status: TaskStatus | null) {
    const point = pointer.current;
    const dragged = drag?.task;
    if (!status || !point || !dragged || !origin) {
      setDropTo(origin);
      return;
    }
    if (status === "done") {
      setDropTo({ status, index: 0 });
      return;
    }
    const body = bodies.current.get(status);
    if (!body) return;
    const current = dropRef.current;
    const slotIndex = current?.status === status ? current.index : -1;
    // The slot may still be opening (slot-in animation), so measure it instead of assuming its
    // final height; at the origin the outlined card itself holds the place.
    const slot = body.querySelector<HTMLElement>(".drop-slot");
    const shift =
      (slot ? slot.getBoundingClientRect().height : (drag?.height ?? 0)) +
      cardGap;
    const cards = [
      ...body.querySelectorAll<HTMLElement>(".card[data-task-id]"),
    ].filter((card) => card.dataset.taskId !== dragged.id);
    let index = 0;
    cards.forEach((card, i) => {
      const rect = card.getBoundingClientRect();
      const offset = slotIndex >= 0 && i >= slotIndex ? shift : 0;
      if (rect.top - offset + rect.height / 2 < point.y) index = i + 1;
    });
    setDropTo({ status, index });
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
    setDrag(null);
    setDropTo(null);
    pointer.current = null;
    lastDrop.current = performance.now();
  }
  const end = () => {
    const task = drag?.task;
    const target = dropRef.current;
    const moved = Boolean(task && target && !atOrigin);
    finish();
    setLanding(moved);
    if (!task || !target || !moved) return;
    if (target.status === "done") {
      // Into the box of the bar; the done column takes the card in place instead.
      const overlay = document.querySelector(".card.drag-overlay");
      if (overlay && !concluded)
        setFlight({ task, rect: overlay.getBoundingClientRect() });
      onMove(task.id, "done", null);
      return;
    }
    const others = columns[target.status].filter((t) => t.id !== task.id);
    onMove(task.id, target.status, others[target.index - 1]?.id ?? null);
  };
  const open = (task: Task) => {
    // A pointer released over the card right after a drag must not open it.
    if (performance.now() - lastDrop.current < 250) return;
    keyboard.cancel();
    onOpen(task);
  };
  return (
    <BranchesContext.Provider value={branches}>
      <GoalNamesContext.Provider value={goalNames}>
        <DndContext
          sensors={sensors}
          collisionDetection={collision}
          measuring={measuring}
          autoScroll={{ threshold: { x: 0.12, y: 0 }, acceleration: 14 }}
          accessibility={{
            screenReaderInstructions: {
              draggable: t(
                "Press Space to move the task. Use the left and right arrows to change column, up and down to choose the position, Space to drop and Esc to cancel. Press Enter to open the details.",
              ),
            },
          }}
          onDragStart={({ active }) => {
            keyboard.cancel();
            setLanding(false);
            const task =
              tasks.find((item) => item.id === active.id) ??
              concluded?.find((item) => item.id === active.id);
            if (!task) return;
            setDrag({
              task,
              height: active.rect.current.initial?.height ?? 64,
            });
            setDropTo(
              task.status === "done"
                ? { status: "done", index: 0 }
                : {
                    status: task.status,
                    index: columns[task.status].findIndex(
                      (t) => t.id === task.id,
                    ),
                  },
            );
          }}
          onDragMove={track}
          onDragOver={track}
          onDragCancel={finish}
          onDragEnd={end}
        >
          <div className="board-area">
            <div
              className={`board scroll ${drag ? "dragging" : ""} ${concluded ? "with-done" : ""}`}
            >
              {boardStatuses.map((status) => {
                const preview =
                  keyboard.move?.status === status ? keyboard.move : null;
                return (
                  <Column
                    key={status}
                    status={status}
                    tasks={columns[status]}
                    bodyRef={(node) => {
                      if (node) bodies.current.set(status, node);
                      else bodies.current.delete(status);
                    }}
                    draggedId={drag?.task.id}
                    slot={
                      drag && drop?.status === status && !atOrigin
                        ? { index: drop.index, height: drag.height }
                        : undefined
                    }
                    target={
                      (drag && drop?.status === status && !atOrigin) ||
                      Boolean(preview && keyboard.changed)
                    }
                    keyboardSlot={
                      preview && keyboard.changed && keyboard.task
                        ? { index: preview.index, task: keyboard.task }
                        : undefined
                    }
                    reduceMotion={reduceMotion}
                    keyboardId={keyboard.move?.taskId}
                    landedId={landedId}
                    selectedId={selectedId}
                    menuId={menuId}
                    onMenu={drag ? undefined : onMenu}
                    onKeyboard={keyboard.handle}
                    onOpen={open}
                  />
                );
              })}
              {concluded && (
                <DoneColumn
                  tasks={concluded}
                  open={doneOpen}
                  dragging={Boolean(drag)}
                  over={drop?.status === "done"}
                  selectedId={selectedId}
                  menuId={menuId}
                  onMenu={drag ? undefined : onMenu}
                  onToggle={() => onDoneOpen?.(!doneOpen)}
                  onOpen={open}
                  onArchive={onArchive}
                />
              )}
            </div>
            {!concluded && (
              <ConcludeZone
                zoneRef={zone}
                boxRef={box}
                active={Boolean(drag)}
                over={drop?.status === "done"}
                receiving={Boolean(flight)}
              />
            )}
          </div>
          <span className="sr-only" role="status">
            {keyboard.announcement}
          </span>
          <DragOverlay
            // Over another column, the card takes on its colour.
            style={laneOf(drag && !atOrigin ? drop?.status : undefined)}
            // After a move the card is already drawn in its new place; animating back would send it
            // to its old place first.
            dropAnimation={
              reduceMotion || !atOrigin || landing ? null : returnAnimation
            }
          >
            {drag && (
              <div className="card drag-overlay">
                <TaskCardContent task={drag.task} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
        {flight && (
          <ArchiveFlight
            key={flight.task.id}
            rect={flight.rect}
            box={box}
            reduceMotion={reduceMotion}
            onDone={() => setFlight(null)}
          >
            <TaskCardContent task={flight.task} />
          </ArchiveFlight>
        )}
      </GoalNamesContext.Provider>
    </BranchesContext.Provider>
  );
}

function Column({
  status,
  tasks,
  bodyRef,
  draggedId,
  slot,
  target,
  keyboardSlot,
  reduceMotion,
  keyboardId,
  landedId,
  selectedId,
  menuId,
  onMenu,
  onKeyboard,
  onOpen,
}: {
  status: TaskStatus;
  tasks: Task[];
  bodyRef: (node: HTMLDivElement | null) => void;
  draggedId?: string;
  /** Pointer drag away from the card's original place. */
  slot?: { index: number; height: number };
  target: boolean;
  /** Keyboard move: a preview of the card where Space would drop it. */
  keyboardSlot?: { index: number; task: Task };
  reduceMotion: boolean;
  keyboardId?: string;
  landedId?: string | null;
  selectedId?: string | null;
  menuId?: string | null;
  onMenu?: (request: MenuRequest) => void;
  onKeyboard: (task: Task, event: KeyboardEvent<HTMLDivElement>) => boolean;
  onOpen: (task: Task) => void;
}) {
  const { setNodeRef } = useDroppable({ id: status });
  const body = useRef<HTMLDivElement | null>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (keyboardSlot)
      slotRef.current?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: reduceMotion ? "auto" : "smooth",
      });
  }, [keyboardSlot?.index, keyboardSlot?.task.id, reduceMotion]);
  const card = (
    task: Task,
    state: "hidden" | "origin" | null = null,
    order?: number,
  ) => (
    <TaskCard
      key={task.id}
      task={task}
      order={order}
      hidden={state === "hidden"}
      landed={landedId === task.id}
      selected={selectedId === task.id}
      menuOpen={menuId === task.id}
      onMenu={onMenu}
      keyboardActive={keyboardId === task.id || state === "origin"}
      onKeyboardKey={(event) => onKeyboard(task, event)}
      onOpen={() => onOpen(task)}
    />
  );
  const dragged = draggedId
    ? tasks.find((task) => task.id === draggedId)
    : undefined;
  let nodes: ReactNode[];
  if (slot) {
    // The dragged card leaves the list (it stays mounted, hidden, for dnd-kit) and the slot takes
    // its index among the other cards. The slot keeps one place in the DOM and moves with CSS
    // `order`: reinserting it would restart its opening animation and make the cards below jump.
    nodes = [
      <div
        key="slot"
        className="drop-slot"
        style={{ height: slot.height, order: slot.index }}
        aria-hidden="true"
      />,
      ...tasks
        .filter((task) => task !== dragged)
        .map((task, i) => card(task, null, i < slot.index ? i : i + 1)),
    ];
    if (dragged) nodes.push(card(dragged, "hidden"));
  } else {
    // At its original place the dragged card doubles as the slot.
    nodes = tasks.map((task) => card(task, task === dragged ? "origin" : null));
    if (keyboardSlot) {
      // The preview index counts the other cards; the moved card keeps its place as an outline.
      const others = tasks.filter((task) => task.id !== keyboardSlot.task.id);
      const before = others[keyboardSlot.index];
      const at = before ? tasks.indexOf(before) : tasks.length;
      nodes.splice(
        at,
        0,
        <div
          key="preview"
          ref={slotRef}
          className="drop-slot with-preview"
          aria-hidden="true"
        >
          <TaskCardContent task={keyboardSlot.task} />
        </div>,
      );
    }
  }
  return (
    <section
      ref={setNodeRef}
      className={`column ${target ? "drop-target" : ""}`}
      style={laneOf(status)}
      aria-label={statusTitle[status]}
    >
      <header className="column-head">
        <StatusIcon status={status} />
        <h2 className="name">{statusTitle[status]}</h2>
        <span className="count" aria-label={t("{0} tasks", [tasks.length])}>
          {tasks.length}
        </span>
      </header>
      <div
        ref={(node) => {
          body.current = node;
          bodyRef(node);
        }}
        className="column-body scroll"
      >
        {nodes}
        {tasks.length === 0 && !slot && !keyboardSlot && (
          <div className="column-empty">{t("No tasks")}</div>
        )}
      </div>
    </section>
  );
}

/** Past this many, the column sends to the Archive for the rest. */
export const doneShown = 30;

/**
 * The concluded tasks at the board's end: a narrow strip with their count, or opened, a column of
 * quiet cards that open the task where it is. A card dropped on either is concluded, in place of
 * the bar that rises below. The Archive keeps them all.
 */
function DoneColumn({
  tasks,
  open,
  dragging,
  over,
  selectedId,
  menuId,
  onMenu,
  onToggle,
  onOpen,
  onArchive,
}: {
  tasks: Task[];
  open: boolean;
  dragging: boolean;
  over: boolean;
  selectedId?: string | null;
  menuId?: string | null;
  onMenu?: (request: MenuRequest) => void;
  onToggle: () => void;
  onOpen: (task: Task) => void;
  onArchive?: () => void;
}) {
  const title = t("Done tasks");
  const { setNodeRef } = useDroppable({ id: "done" });
  // The column stays mounted while it narrows back to the strip (the lane's width transition in
  // board.css), then gives way to it.
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) return setShown(true);
    const timer = window.setTimeout(
      () => setShown(false),
      reduceMotion ? 0 : 260,
    );
    return () => window.clearTimeout(timer);
  }, [open, reduceMotion]);
  const lane = `done-lane ${open ? "open" : ""} ${dragging ? "dropping" : ""} ${over ? "drop-target" : ""}`;
  if (!shown)
    return (
      <div ref={setNodeRef} className={lane}>
        <button
          type="button"
          className="done-strip"
          aria-expanded={false}
          aria-label={`${title}, ${tasks.length}`}
          data-tooltip={t("Show done tasks")}
          onClick={onToggle}
        >
          <StatusIcon status="done" />
          <span className="count">{tasks.length}</span>
          <span className="done-strip-name">{title}</span>
        </button>
      </div>
    );
  return (
    <div ref={setNodeRef} className={lane}>
      <section className="column done-column" aria-label={title}>
        <header className="column-head">
          <StatusIcon status="done" />
          <h2 className="name">{title}</h2>
          <span className="count">{tasks.length}</span>
          <button
            type="button"
            className="icon-button small done-close"
            aria-expanded
            aria-label={t("Hide done tasks")}
            data-tooltip={t("Hide done tasks")}
            onClick={onToggle}
          >
            <Icon name="collapse" size={13} />
          </button>
        </header>
        <div className="column-body scroll">
          {tasks.slice(0, doneShown).map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              selected={selectedId === task.id}
              menuOpen={menuId === task.id}
              onMenu={onMenu}
              onOpen={() => onOpen(task)}
            />
          ))}
          {tasks.length === 0 && (
            <div className="column-empty">{t("No tasks")}</div>
          )}
          {tasks.length > doneShown && onArchive && (
            <button type="button" className="done-more" onClick={onArchive}>
              {t("See all {0} in the Archive", [tasks.length])}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * The dashed bar that rises at the bottom of the board while a card is dragged, with a box: a
 * card dropped there is concluded and goes into the box, whose lid opens while the card is over
 * it. It stays up until the card is inside.
 */
export function ConcludeZone({
  zoneRef,
  boxRef,
  active,
  over,
  receiving,
}: {
  zoneRef: RefObject<HTMLDivElement | null>;
  boxRef: RefObject<SVGSVGElement | null>;
  active: boolean;
  over: boolean;
  receiving: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: "done", disabled: !active });
  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        zoneRef.current = node;
      }}
      className={`conclude-zone ${active || receiving ? "shown" : ""} ${over || receiving ? "open" : ""}`}
      aria-hidden={!active}
    >
      <svg
        ref={boxRef}
        className="conclude-box"
        width="33"
        height="30"
        viewBox="0 0 44 40"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 16h32v18a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" />
        <path d="M17 23h10" strokeLinecap="round" />
        <path className="lid" d="M3 9.5h38v6.5H3z" />
      </svg>
      <span>{t("Drop to conclude")}</span>
    </div>
  );
}

/**
 * The concluded card (or list row) shrinks and drops into the box, whose lid then closes with a
 * small bounce, and Archive in the sidebar lights up once. With reduced motion it is simply gone.
 */
export function ArchiveFlight({
  className = "card",
  children,
  rect,
  box,
  reduceMotion,
  onDone,
}: {
  /** The dragged copy's own classes, so the flying one looks the same. */
  className?: string;
  children: ReactNode;
  rect: DOMRect;
  box: RefObject<SVGSVGElement | null>;
  reduceMotion: boolean;
  onDone: () => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const flash = (element: Element | null | undefined, name: string) => {
      if (!element) return;
      element.classList.remove(name);
      void (element as HTMLElement).getBoundingClientRect();
      element.classList.add(name);
      element.addEventListener(
        "animationend",
        () => element.classList.remove(name),
        { once: true },
      );
    };
    const land = () => {
      flash(box.current, "received");
      flash(document.querySelector('[data-nav="archive"]'), "received");
      onDone();
    };
    const to = box.current?.getBoundingClientRect();
    if (reduceMotion || !node.current || !to) {
      land();
      return;
    }
    const x = to.left + to.width / 2 - (rect.left + rect.width / 2);
    const y = to.top + to.height / 2 - (rect.top + rect.height / 2);
    const animation = node.current.animate(
      [
        { transform: "rotate(1.2deg) scale(1.02)", opacity: 1 },
        {
          transform: `translate(${x}px, ${y - 46}px) scale(0.22)`,
          opacity: 1,
          offset: 0.6,
        },
        {
          transform: `translate(${x}px, ${y + 4}px) scale(0.1)`,
          opacity: 0,
        },
      ],
      { duration: 520, easing: "cubic-bezier(.4,0,.6,1)", fill: "forwards" },
    );
    animation.onfinish = land;
    return () => animation.cancel();
  }, []);
  return (
    <div
      ref={node}
      className={`${className} drag-overlay archive-flight`}
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}
