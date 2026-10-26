import { createContext, useContext, type KeyboardEvent } from "react";
import { useDraggable } from "@dnd-kit/core";
import { ago, isAgentWorking, statusTitle, type Task } from "../lib/types";
import { AgentTrail } from "./AgentTrail";
import { Glyph } from "./BoardFilters";
import { Icon } from "./Icon";
import { menuRequest, type MenuRequest } from "./TaskMenu";
import { t } from "../lib/i18n";

/** The board project's local branches, to mark a card whose branch is gone; null while unknown. */
export const BranchesContext = createContext<string[] | null>(null);

export function TaskCardContent({ task }: { task: Task }) {
  const working = isAgentWorking(task);
  const agent = task.assignee === "agent";
  const branches = useContext(BranchesContext);
  const branch = task.repositoryBranch;
  // A done task's branch is expected to go once it is merged; only open work warns.
  const gone = Boolean(
    branch && branches && task.status !== "done" && !branches.includes(branch),
  );
  return (
    <>
      {working && <AgentTrail />}
      <span className="card-category" title={task.category}>
        {task.category}
      </span>
      <div className="card-title">{task.title}</div>
      {branch && (
        <span
          className={`card-branch ${gone ? "gone" : ""}`}
          title={
            gone
              ? t("{0} no longer exists in the repository", [branch])
              : branch
          }
        >
          <Icon name="branch" size={11} />
          <span className="truncate">{branch}</span>
        </span>
      )}
      {working && (
        <span className="card-live">
          <span className="agent-pulse" aria-hidden="true" />
          {t("Working now")}
        </span>
      )}
      <div className="card-meta">
        <Glyph who={task.assignee} />
        <span className="truncate">
          {agent ? t("Agent") : t("You")}, {ago(task.updatedAt)}
        </span>
        {task.documentCount > 0 && (
          <span
            className="card-docs"
            aria-label={
              task.documentCount === 1
                ? t("1 attached note")
                : t("{0} attached notes", [task.documentCount])
            }
          >
            <Icon name="clip" size={11} />
            {task.documentCount}
          </span>
        )}
        {task.pullRequestNumber && (
          <span className="card-pr">
            {t("PR")} {task.pullRequestNumber}
          </span>
        )}
      </div>
    </>
  );
}

export function TaskCard({
  task,
  onOpen,
  landed = false,
  hidden = false,
  selected = false,
  keyboardActive = false,
  menuOpen = false,
  order,
  onKeyboardKey,
  onMenu,
}: {
  task: Task;
  onOpen: () => void;
  landed?: boolean;
  /** Dragged away from its place: kept mounted for the drag, but out of the layout. */
  hidden?: boolean;
  /** Open in the task sheet. */
  selected?: boolean;
  keyboardActive?: boolean;
  /** Its right-click menu is open. */
  menuOpen?: boolean;
  /** Visual position in the column (CSS `order`) while a drag slot sits among the cards. */
  order?: number;
  onKeyboardKey?: (event: KeyboardEvent<HTMLDivElement>) => boolean;
  onMenu?: (request: MenuRequest) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
  });
  const working = isAgentWorking(task);
  const state = [
    working && "working",
    (isDragging || keyboardActive) && "drag-origin",
    hidden && "drag-hidden",
    landed && "landed",
    selected && "selected",
    menuOpen && "menu-open",
    task.status === "done" && "done",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      ref={setNodeRef}
      data-task-id={task.id}
      style={order === undefined ? undefined : { order }}
      {...listeners}
      {...attributes}
      onClick={() => {
        if (!isDragging) onOpen();
      }}
      aria-pressed={keyboardActive}
      aria-haspopup={onMenu ? "menu" : undefined}
      onContextMenu={(event) => {
        if (!onMenu || isDragging) return;
        const request = menuRequest(event, task);
        if (request) onMenu(request);
      }}
      onKeyDown={(event) => {
        if (onMenu && !isDragging && !keyboardActive) {
          const request = menuRequest(event, task);
          if (request) {
            onMenu(request);
            return;
          }
        }
        if (onKeyboardKey?.(event)) return;
        if (event.key === "Enter" && !isDragging) {
          event.preventDefault();
          onOpen();
        }
      }}
      className={`card ${state}`}
      aria-label={[
        task.title,
        task.category,
        task.assignee === "agent" ? t("agent") : t("you"),
        statusTitle[task.status],
        task.repositoryBranch && t("branch {0}", [task.repositoryBranch]),
        task.documentCount === 1 && t("1 attached note"),
        task.documentCount > 1 && t("{0} attached notes", [task.documentCount]),
        working && t("agent working"),
      ]
        .filter(Boolean)
        .join(", ")}
    >
      <TaskCardContent task={task} />
    </div>
  );
}
