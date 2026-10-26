import { isDraft, statusTitle, type Project, type Task } from "../lib/types";
import { Glyph } from "./BoardFilters";
import { Icon } from "./Icon";
import { projectColor } from "./Sidebar";
import { t } from "../lib/i18n";

/** Ideas that are not on the board yet; the agent starts one only when it is added. */
export function Drafts({
  tasks,
  projects,
  selectedId,
  onOpen,
  onPromote,
}: {
  tasks: Task[];
  projects: Project[];
  selectedId?: string;
  onOpen: (task: Task) => void;
  onPromote: (task: Task) => void;
}) {
  const drafts = tasks.filter((task) => isDraft(task.status));
  return (
    <div className="page scroll">
      <div className="page-inner">
        <header className="page-hero">
          <h1>{t("Drafts")}</h1>
          <p>
            {t(
              "Ideas that haven't reached the board yet. The agent only starts when you add one of them.",
            )}
          </p>
        </header>
        {drafts.length === 0 ? (
          <div className="empty-state">
            <Icon name="drafts" size={22} />
            <strong>{t("No drafts for now")}</strong>
            <p>{t("Use New task and choose Drafts.")}</p>
          </div>
        ) : (
          <ul className="rows">
            {drafts.map((task) => {
              const index = projects.findIndex((p) => p.id === task.projectId);
              return (
                <li
                  key={task.id}
                  className={`draft-row ${selectedId === task.id ? "selected" : ""}`}
                >
                  <button
                    type="button"
                    className="row-button"
                    onClick={() => onOpen(task)}
                  >
                    <span
                      className="swatch"
                      style={{ background: projectColor(projects[index]) }}
                      aria-hidden="true"
                    />
                    <span className="row-text">
                      <span className="row-title truncate">{task.title}</span>
                      <span className="row-sub truncate">
                        {projects[index]?.name}, {task.category}
                      </span>
                    </span>
                    <span className="row-sub">
                      <Glyph who={task.assignee} /> {statusTitle[task.status]}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="button small"
                    onClick={() => onPromote(task)}
                  >
                    {t("Add to board")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
