import {
  DndContext,
  DragOverlay,
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
import { useScrollbarRoom } from "../hooks/useScrollbarRoom";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  boardStatuses,
  byPosition,
  statusTitle,
  type Task,
  type TaskStatus,
} from "../lib/types";
import { BranchesContext, TaskCard, TaskCardContent } from "./TaskCard";
import type { MenuRequest } from "./TaskMenu";
import { t } from "../lib/i18n";

interface BoardProps {
  tasks: Task[];
  /** The project's local branches; null while unknown. */
  branches?: string[] | null;
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
}

/** Where a dragged card would land: a column and an index among the other cards in it. */
interface Drop {
  status: TaskStatus;
  index: number;
}

// The column under the pointer wins; the overlay rectangle is only a fallback for the gaps.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
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

/**
 * Four columns in the stored manual order. While a card is dragged it leaves its place and a slot
 * of the same height follows the pointer between the other cards, so the slot is exactly where the
 * card will land; outside any column the slot returns to the card's original place.
 */
export function Board({
  tasks,
  branches = null,
  landedId,
  selectedId,
  menuId,
  onMenu,
  onMove,
  onOpen,
}: BoardProps) {
  const [drag, setDrag] = useState<{ task: Task; height: number } | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  // Set when a drop changes the card's place: the overlay must vanish instead of flying back.
  const [landing, setLanding] = useState(false);
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
  const origin = drag
    ? {
        status: drag.task.status,
        index: columns[drag.task.status].findIndex(
          (t) => t.id === drag.task.id,
        ),
      }
    : null;
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
        const inside = point.x >= rect.left && point.x <= rect.right;
        const up = point.y - rect.top;
        const down = rect.bottom - point.y;
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
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
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
          const task = tasks.find((item) => item.id === active.id);
          if (!task) return;
          setDrag({ task, height: active.rect.current.initial?.height ?? 64 });
          setDropTo({
            status: task.status,
            index: columns[task.status].findIndex((t) => t.id === task.id),
          });
        }}
        onDragMove={track}
        onDragOver={track}
        onDragCancel={finish}
        onDragEnd={end}
      >
        <div className={`board scroll ${drag ? "dragging" : ""}`}>
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
        </div>
        <span className="sr-only" role="status">
          {keyboard.announcement}
        </span>
        <DragOverlay
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
  useScrollbarRoom(body);
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
      aria-label={statusTitle[status]}
    >
      <header className="column-head">
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
