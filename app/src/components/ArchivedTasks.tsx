import { ago, type Task } from "../lib/types";
import { Icon } from "./Icon";
import { menuRequest, type MenuRequest } from "./TaskMenu";
import { t } from "../lib/i18n";

/**
 * A project's archived tasks, newest first, in place of the board: done work whose branch is
 * gone. Opening one shows the task as usual; moving it out of Done puts it back on the board.
 */
export function ArchivedTasks({
  tasks,
  selectedId,
  menuId,
  onOpen,
  onMenu,
}: {
  tasks: Task[];
  selectedId?: string;
  menuId?: string | null;
  onOpen: (task: Task) => void;
  onMenu?: (request: MenuRequest) => void;
}) {
  return (
    <div className="archive scroll">
      {tasks.length === 0 ? (
        <div className="empty-state">
          <Icon name="archive" size={22} />
          <strong>{t("No archived tasks with these filters")}</strong>
          <p>{t("Change the category, branch or assignee.")}</p>
        </div>
      ) : (
        <ul className="rows">
          {tasks.map((task) => (
            <li
              key={task.id}
              className={`archive-row ${selectedId === task.id || menuId === task.id ? "selected" : ""}`}
            >
              <button
                type="button"
                className="row-button"
                aria-haspopup={onMenu ? "menu" : undefined}
                onClick={() => onOpen(task)}
                onContextMenu={(event) => {
                  const request = onMenu && menuRequest(event, task);
                  if (request) onMenu(request);
                }}
                onKeyDown={(event) => {
                  const request = onMenu && menuRequest(event, task);
                  if (request) onMenu(request);
                }}
              >
                <span className="row-text">
                  <span className="row-title truncate">{task.title}</span>
                  <span className="row-sub archive-refs">
                    <span className="truncate">{task.category}</span>
                    {task.repositoryBranch && (
                      <span className="archive-ref">
                        <Icon name="branch" size={11} />
                        <span className="truncate">
                          {task.repositoryBranch}
                        </span>
                      </span>
                    )}
                    {task.pullRequestNumber ? (
                      <span className="archive-ref">
                        {t("PR")} {task.pullRequestNumber}
                      </span>
                    ) : (
                      task.commitHash && (
                        <code className="archive-ref">
                          {task.commitHash.slice(0, 7)}
                        </code>
                      )
                    )}
                  </span>
                </span>
                <span className="row-sub">
                  {t("Done|task")} {ago(task.updatedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
