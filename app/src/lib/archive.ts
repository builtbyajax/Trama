import { DAY } from "./handoffs";
import type { Project, Task } from "./types";

/** How long a done task stays on the board after its last change. */
export const ARCHIVE_AFTER = 7 * DAY;

/**
 * A done task leaves the board once it has gone a week without changes and its branch is no
 * longer in the repository (merged and deleted), or it never had one. That is never stored:
 * moving the task back or the branch reappearing brings it back. While the project's branches
 * are unknown (loading, Git unavailable) nothing is archived on account of its branch. The person
 * can also archive a done task by hand at any time; leaving done clears that.
 */
export function isArchived(
  task: Task,
  project: Project,
  branches: string[] | null,
  now = Date.now() / 1000,
): boolean {
  if (task.status !== "done") return false;
  if (task.archivedAt !== null) return true;
  if (now - task.updatedAt < ARCHIVE_AFTER) return false;
  const branch = task.repositoryBranch;
  if (!branch || !project.repositoryPath) return true;
  return branches !== null && !branches.includes(branch);
}
