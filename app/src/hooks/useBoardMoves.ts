import { useCallback, useEffect, useMemo, useState } from "react";
import { errorMessage, moveTask } from "../lib/api";
import {
  byPosition,
  statusTitle,
  type Snapshot,
  type TaskStatus,
} from "../lib/types";
import { t } from "../lib/i18n";

type Placement = { status: TaskStatus; position: number; updatedAt: number };

/**
 * Moving a card between and inside columns. The move shows at once and SQLite confirms it
 * afterwards; a failure removes the entry and the card returns. `data` is the snapshot with
 * the moves not yet confirmed applied.
 */
export function useBoardMoves(
  snapshot: Snapshot | null,
  refresh: () => Promise<void>,
  notify: (text: string, error?: boolean) => void,
) {
  const [pendingMoves, setPendingMoves] = useState<Record<string, Placement>>(
    {},
  );
  const [landedId, setLandedId] = useState<string | null>(null);
  useEffect(() => {
    if (!landedId) return;
    const timer = window.setTimeout(() => setLandedId(null), 900);
    return () => window.clearTimeout(timer);
  }, [landedId]);
  const data = useMemo(() => {
    if (!snapshot) return null;
    return {
      ...snapshot,
      tasks: snapshot.tasks.map((task) => {
        const pending = pendingMoves[task.id];
        return pending ? { ...task, ...pending } : task;
      }),
    };
  }, [snapshot, pendingMoves]);
  const move = useCallback(
    async (taskId: string, status: TaskStatus, afterId: string | null) => {
      const task = data?.tasks.find((t) => t.id === taskId);
      if (!task) return;
      // Optimistic position between the new neighbours; SQLite renumbers the column.
      const column = data!.tasks
        .filter(
          (t) =>
            t.projectId === task.projectId &&
            t.status === status &&
            t.id !== taskId,
        )
        .sort(byPosition);
      const after = afterId ? column.findIndex((t) => t.id === afterId) : -1;
      const prev = column[after];
      const next = column[after + 1];
      const placement: Placement = {
        status,
        position:
          prev && next
            ? (prev.position + next.position) / 2
            : prev
              ? prev.position + 1
              : next
                ? next.position - 1
                : 0,
        updatedAt: status === task.status ? task.updatedAt : Date.now() / 1000,
      };
      setLandedId(taskId);
      setPendingMoves((v) => ({ ...v, [taskId]: placement }));
      const settle = () =>
        setPendingMoves((v) => {
          const { [taskId]: _, ...rest } = v;
          return rest;
        });
      try {
        await moveTask(task, status, afterId);
        await refresh();
        settle();
        if (status !== task.status)
          notify(t("Moved to “{0}”.", [statusTitle[status]]));
      } catch (e) {
        settle();
        setLandedId(null);
        notify(
          status === task.status
            ? t("Couldn't reorder “{0}”; it went back to its place. {1}", [
                task.title,
                errorMessage(e),
              ])
            : t("Couldn't move “{0}”; it stays in {1}. {2}", [
                task.title,
                statusTitle[task.status],
                errorMessage(e),
              ]),
          true,
        );
      }
    },
    [data, refresh],
  );
  return { data, landedId, setLandedId, move };
}
