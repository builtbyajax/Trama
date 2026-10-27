import { createContext, useContext, type KeyboardEvent } from "react";
import { useDraggable } from "@dnd-kit/core";
import { ago, statusTitle, type Task } from "../lib/types";
import {
  agentColor,
  agentName,
  agentTint,
  useAgentProfile,
  useWorkState,
  shortName,
} from "../lib/agents";
import { AgentBot } from "./AgentBot";
import { AgentTrail } from "./AgentTrail";
import { Glyph } from "./BoardFilters";
import { Icon } from "./Icon";
import { menuRequest, type MenuRequest } from "./TaskMenu";
import { t } from "../lib/i18n";

/** The board project's local branches, to mark a card whose branch is gone; null while unknown. */
export const BranchesContext = createContext<string[] | null>(null);
/** Goal names by id, for the card's goal; empty when the board already shows a single goal. */
export const GoalNamesContext = createContext<Map<string, string>>(new Map());

export function TaskCardContent({ task }: { task: Task }) {
  const work = useWorkState(task);
  const agent = task.assignee === "agent";
  const profile = useAgentProfile(agent ? task.agentProfileId : null);
  const branches = useContext(BranchesContext);
  const branch = task.repositoryBranch;
  const goal = useContext(GoalNamesContext).get(task.goalId ?? "");
  // A done task's branch is expected to go once it is merged; only open work warns.
  const gone = Boolean(
    branch && branches && task.status !== "done" && !branches.includes(branch),
  );
  return (
    <>
      {work === "live" && <AgentTrail />}
      {profile && work && (
        // While it works, the character walks along the card's top edge; stopped, it sits there
        // and dozes. In the other stages it stays small in the meta line, like your own mark.
        <span
          className={`card-bot perched ${work === "live" ? "walking" : ""}`}
        >
          <AgentBot
            shape={profile.shape}
            eyes={work === "stopped" ? "sleepy" : profile.eyes}
            color={agentColor(profile)}
            size={30}
          />
          {work === "stopped" && (
            <span className="bot-zzz" aria-hidden="true">
              <span>z</span>
              <span>z</span>
              <span>z</span>
            </span>
          )}
        </span>
      )}
      <div className="card-top">
        <span className="card-category" title={task.category}>
          {task.category}
        </span>
        {goal && (
          <span className="card-goal" title={goal}>
            <Icon name="target" size={11} />
            <span className="truncate">{goal}</span>
          </span>
        )}
      </div>
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
      <div className="card-meta">
        {!(profile && work) && (
          <Glyph who={task.assignee} profileId={task.agentProfileId} />
        )}
        <span className="truncate">
          {agent ? agentName(profile) : t("You")}, {ago(task.updatedAt)}
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
  const work = useWorkState(task);
  const profile = useAgentProfile(task.agentProfileId);
  const goal = useContext(GoalNamesContext).get(task.goalId ?? "");
  const state = [
    work && "working",
    work === "stopped" && "stopped",
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
      style={{ ...(work && agentTint(profile)), order }}
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
        goal && t("goal {0}", [goal]),
        task.assignee === "agent"
          ? profile
            ? shortName(profile.displayName)
            : t("agent")
          : t("you"),
        statusTitle[task.status],
        task.repositoryBranch && t("branch {0}", [task.repositoryBranch]),
        task.documentCount === 1 && t("1 attached note"),
        task.documentCount > 1 && t("{0} attached notes", [task.documentCount]),
        work === "live" && t("agent working"),
        work === "stopped" && t("Stopped"),
      ]
        .filter(Boolean)
        .join(", ")}
    >
      <TaskCardContent task={task} />
    </div>
  );
}
