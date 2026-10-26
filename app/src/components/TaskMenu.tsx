import type { MouseEvent as ReactMouseEvent, KeyboardEvent } from "react";
import { statusTitle, type Task, type TaskDocument } from "../lib/types";
import type { MenuItem } from "./Sidebar";
import { t } from "../lib/i18n";

/** Where a task's menu opens: at the pointer, or under the card for the keyboard. */
export interface MenuRequest {
  task: Task;
  x: number;
  y: number;
  trigger: HTMLElement;
}

/** Right click on a card, or Shift+F10 and the menu key while it has focus. */
export function menuRequest(
  event: ReactMouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
  task: Task,
): MenuRequest | null {
  const trigger = event.currentTarget;
  const rect = trigger.getBoundingClientRect();
  if (event.type === "contextmenu") {
    const pointer = event as ReactMouseEvent<HTMLElement>;
    event.preventDefault();
    // The context-menu key reports no pointer position; open under the card then.
    const keyboard = pointer.clientX === 0 && pointer.clientY === 0;
    return {
      task,
      x: keyboard ? rect.left + 12 : pointer.clientX,
      y: keyboard ? rect.bottom : pointer.clientY,
      trigger,
    };
  }
  const key = event as KeyboardEvent<HTMLElement>;
  if (!(key.shiftKey && key.key === "F10") && key.key !== "ContextMenu")
    return null;
  event.preventDefault();
  return { task, x: rect.left + 12, y: rect.bottom - 6, trigger };
}

const noteName = (path: string) => path.split("/").pop()!.replace(/\.md$/i, "");

/**
 * The actions of a task's menu, only those that apply to it: open, move, hand over, copy what
 * identifies it, reach its Git work and attached notes, and delete after confirming. A done task
 * is in the Archive: it can only be reopened on the board, not reordered, handed over or regrouped.
 */
export function taskMenuItems(
  task: Task,
  {
    documents,
    atTop,
    hasRepository,
    branchExists,
    onOpen,
    onOpenPage,
    onMoveToTop,
    onMoveToStatus,
    onConclude,
    onAssign,
    onMoveToGoal,
    onCopy,
    onGit,
    onOpenPullRequest,
    onOpenNote,
    onDelete,
  }: {
    documents: TaskDocument[];
    atTop: boolean;
    hasRepository: boolean;
    branchExists: boolean;
    onOpen: () => void;
    onOpenPage: () => void;
    onMoveToTop: () => void;
    onMoveToStatus?: () => void;
    /** Takes the task off the board to the Archive. */
    onConclude?: () => void;
    onAssign: (assignee: Task["assignee"]) => void;
    /** Left out when the task's project has no goal to move it to. */
    onMoveToGoal?: () => void;
    onCopy: (value: string, done: string) => void;
    onGit: () => void;
    onOpenPullRequest: (url: string) => void;
    onOpenNote: (path: string) => void;
    onDelete: () => void;
  },
): MenuItem[] {
  const items: MenuItem[] = [
    {
      label: t("Open"),
      icon: "arrowRight",
      hint: "↵",
      onSelect: onOpen,
    },
    { label: t("Open full screen"), icon: "expand", onSelect: onOpenPage },
  ];
  const archived = task.status === "done";
  const moves: MenuItem[] = [];
  if (!atTop && !archived)
    moves.push({
      label: t("Move to top"),
      icon: "arrowUp",
      onSelect: onMoveToTop,
    });
  if (onMoveToStatus)
    moves.push({
      label: archived ? t("Reopen in…") : t("Move to…"),
      icon: "board",
      onSelect: onMoveToStatus,
    });
  if (onMoveToStatus && onConclude && !archived)
    moves.push({ label: t("Conclude"), icon: "check", onSelect: onConclude });
  if (!archived)
    moves.push(
      task.assignee === "agent"
        ? {
            label: t("Take the task"),
            icon: "arrowLeft",
            onSelect: () => onAssign("user"),
          }
        : {
            label: t("Hand to the agent"),
            icon: "arrowRight",
            onSelect: () => onAssign("agent"),
          },
    );
  if (onMoveToGoal && !archived)
    moves.push({
      label: t("Move to goal…"),
      icon: "target",
      onSelect: onMoveToGoal,
    });
  if (moves.length) moves[0].separated = true;
  items.push(...moves);

  const copies: MenuItem[] = [
    {
      label: t("Copy task ID"),
      icon: "copy",
      onSelect: () => onCopy(task.id, t("Task ID copied.")),
    },
    {
      label: t("Copy title"),
      icon: "copy",
      onSelect: () => onCopy(task.title, t("Title copied.")),
    },
  ];
  if (task.repositoryBranch)
    copies.push({
      label: t("Copy branch name"),
      icon: "branch",
      onSelect: () => onCopy(task.repositoryBranch!, t("Branch copied.")),
    });
  if (task.commitHash)
    copies.push({
      label: t("Copy commit hash"),
      icon: "commit",
      onSelect: () => onCopy(task.commitHash!, t("Hash copied.")),
    });
  copies[0].separated = true;
  items.push(...copies);

  const git: MenuItem[] = [];
  if (
    hasRepository &&
    (branchExists || task.commitHash || task.pullRequestNumber)
  )
    git.push({ label: t("View in Git"), icon: "branch", onSelect: onGit });
  if (task.pullRequestUrl)
    git.push({
      label: task.pullRequestNumber
        ? t("Open PR #{0} on GitHub", [task.pullRequestNumber])
        : t("Open pull request on GitHub"),
      icon: "external",
      onSelect: () => onOpenPullRequest(task.pullRequestUrl!),
    });
  if (git.length) git[0].separated = true;
  items.push(...git);

  const notes: MenuItem[] = documents.slice(0, 5).map((d) => ({
    label: t("Open note “{0}”", [noteName(d.path)]),
    icon: "notes",
    onSelect: () => onOpenNote(d.path),
  }));
  if (notes.length) notes[0].separated = true;
  items.push(...notes);

  items.push({
    label: t("Delete task…"),
    icon: "trash",
    danger: true,
    separated: true,
    onSelect: onDelete,
  });
  return items;
}

/** Spoken label of the menu. */
export const taskMenuLabel = (task: Task) =>
  t("Actions for “{0}”, {1}", [task.title, statusTitle[task.status]]);
