import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { nextBoardStatus } from "../lib/boardKeyboard";
import { statusTitle, type Task, type TaskStatus } from "../lib/types";
import { t } from "../lib/i18n";

export type BoardColumns = Record<TaskStatus, Task[]>;
/** A keyboard move in progress: target column and index among the column's other cards. */
type Move = { taskId: string; status: TaskStatus; index: number };

/**
 * Keyboard moves: Space picks a card up, ←/→ choose the column (entering at the top, as before),
 * ↑/↓ choose the position, Space drops it and Esc cancels.
 */
export function useBoardKeyboard(
  columns: BoardColumns,
  onMove: (id: string, status: TaskStatus, afterId: string | null) => void,
) {
  const [move, setMove] = useState<Move | null>(null);
  const current = useRef<Move | null>(null);
  const committed = useRef<{ id: string; status: TaskStatus } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const all = Object.values(columns).flat();
  const others = (status: TaskStatus, taskId: string) =>
    columns[status].filter((task) => task.id !== taskId);
  const originIndex = (task: Task) =>
    columns[task.status].findIndex((t) => t.id === task.id);
  function update(value: Move | null) {
    current.current = value;
    setMove(value);
  }
  function cancel() {
    const wasMoving = current.current !== null;
    update(null);
    setAnnouncement(wasMoving ? t("Move cancelled.") : "");
  }
  useEffect(() => {
    const finished = committed.current;
    if (
      finished &&
      columns[finished.status]?.some((t) => t.id === finished.id)
    ) {
      // Keep focus on the moved card once it is drawn in its new place.
      const card = document.querySelector<HTMLElement>(
        `[data-task-id="${CSS.escape(finished.id)}"]`,
      );
      card?.focus({ preventScroll: true });
      card?.scrollIntoView({ block: "nearest", inline: "nearest" });
      committed.current = null;
    }
    if (current.current && !all.some((t) => t.id === current.current?.taskId))
      update(null);
  }, [columns]);
  const where = (status: TaskStatus, index: number, total: number) =>
    t("{0}, position {1} of {2}", [statusTitle[status], index + 1, total + 1]);
  function handle(task: Task, event: KeyboardEvent<HTMLDivElement>): boolean {
    const active = current.current?.taskId === task.id ? current.current : null;
    const stop = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (event.code === "Space") {
      stop();
      if (active) {
        update(null);
        const list = others(active.status, task.id);
        const unchanged =
          active.status === task.status && active.index === originIndex(task);
        if (!unchanged) {
          committed.current = { id: task.id, status: active.status };
          onMove(task.id, active.status, list[active.index - 1]?.id ?? null);
        }
        setAnnouncement(
          unchanged
            ? t("{0}. Stays in the same place.", [task.title])
            : t("{0}. Moved to {1}.", [
                task.title,
                where(active.status, active.index, list.length),
              ]),
        );
      } else {
        committed.current = null;
        update({
          taskId: task.id,
          status: task.status,
          index: originIndex(task),
        });
        setAnnouncement(
          t("{0}. Use the arrows to choose the column and position.", [
            task.title,
          ]),
        );
      }
      return true;
    }
    if (!active) return false;
    if (event.code === "Escape") {
      stop();
      cancel();
      return true;
    }
    let next: Move | null = null;
    if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
      const status = nextBoardStatus(
        active.status,
        event.code === "ArrowRight" ? 1 : -1,
      );
      next = {
        ...active,
        status,
        index:
          status === active.status
            ? active.index
            : status === task.status
              ? originIndex(task)
              : 0,
      };
    } else if (event.code === "ArrowUp" || event.code === "ArrowDown") {
      const last = others(active.status, task.id).length;
      const step = event.code === "ArrowDown" ? 1 : -1;
      next = {
        ...active,
        index: Math.max(0, Math.min(last, active.index + step)),
      };
    }
    if (!next) return false;
    stop();
    update(next);
    setAnnouncement(
      t("Target: {0}. Press Space to drop or Esc to cancel.", [
        where(next.status, next.index, others(next.status, task.id).length),
      ]),
    );
    return true;
  }
  const task = move ? all.find((t) => t.id === move.taskId) : undefined;
  return {
    move,
    handle,
    cancel,
    announcement,
    task,
    /** The target differs from where the card already is. */
    changed: Boolean(
      move &&
      task &&
      (move.status !== task.status || move.index !== originIndex(task)),
    ),
  };
}
