import { DAY } from "./handoffs";
import type { Project, Task } from "./types";

/** How long a done task's Git work stays in the project's History after its last change. */
export const SETTLE_AFTER = 7 * DAY;

/**
 * A done task's Git work leaves the History once the task has gone a week without changes and
 * its branch is no longer in the repository (merged and deleted), or it never had one. That is
 * never stored: moving the task back or the branch reappearing brings it back. While the
 * project's branches are unknown (loading, Git unavailable) nothing settles on account of its
 * branch.
 */
export function isSettled(
  task: Task,
  project: Project,
  branches: string[] | null,
  now = Date.now() / 1000,
): boolean {
  if (task.status !== "done") return false;
  if (now - task.updatedAt < SETTLE_AFTER) return false;
  const branch = task.repositoryBranch;
  if (!branch || !project.repositoryPath) return true;
  return branches !== null && !branches.includes(branch);
}
