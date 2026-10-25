import { goalProgress, type Goal, type Project, type Task } from "../lib/types";
import { Icon } from "./Icon";
import { projectColor } from "./Sidebar";
import { menuRequest, type MenuRequest } from "./TaskMenu";
import { locale, t } from "../lib/i18n";
import { Segmented } from "./Segmented";

export type ArchiveGrouping = "goal" | "month" | "project";
/** What the Archive shows: a search, one project or all of them, and how rows are grouped. */
export interface ArchiveView {
  query: string;
  projectId: string | null;
  group: ArchiveGrouping;
}
export const defaultArchiveView: ArchiveView = {
  query: "",
  projectId: null,
  group: "goal",
};

interface ArchiveGroup {
  key: string;
  label: string;
  /** Grouped by goal: the goal, or none for the tasks without one. */
  goal?: Goal;
  tasks: Task[];
}

/** When the task got to the Archive; older builds may not have recorded it. */
const doneAt = (task: Task) => task.archivedAt ?? task.updatedAt;
const capitalized = (text: string) =>
  text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase(locale);

/** Grouped by project, each project's tasks in a box of their own, grouped by goal inside. */
interface ArchiveSection {
  projectId: string | null;
  groups: ArchiveGroup[];
}

/**
 * The done tasks the view finds, newest first, in groups: by goal, the goals with the latest work
 * first and the tasks without one at the end; by month, the latest month first; by project, the
 * project with the latest work first, by goal inside. Only the project grouping has more than one
 * section.
 */
export function archiveSections(
  tasks: Task[],
  goals: Goal[],
  view: ArchiveView,
): ArchiveSection[] {
  const needle = fold(view.query.trim());
  const found = tasks
    .filter(
      (task) =>
        task.status === "done" &&
        (view.projectId === null || task.projectId === view.projectId) &&
        (!needle ||
          fold(
            [
              task.title,
              task.details,
              task.category,
              task.repositoryBranch ?? "",
              task.commitHash ?? "",
              task.pullRequestNumber ? `PR ${task.pullRequestNumber}` : "",
            ].join("\n"),
          ).includes(needle)),
    )
    .sort((a, b) => doneAt(b) - doneAt(a));
  if (view.group !== "project")
    return [{ projectId: null, groups: grouped(found, goals, view.group) }];
  const projects = new Map<string, Task[]>();
  for (const task of found)
    projects.set(task.projectId, [
      ...(projects.get(task.projectId) ?? []),
      task,
    ]);
  return [...projects].map(([projectId, own]) => ({
    projectId,
    groups: grouped(own, goals, "goal"),
  }));
}

function grouped(
  found: Task[],
  goals: Goal[],
  by: "goal" | "month",
): ArchiveGroup[] {
  const thisYear = new Date().getFullYear();
  const groups = new Map<string, ArchiveGroup>();
  for (const task of found) {
    let group: Omit<ArchiveGroup, "tasks">;
    if (by === "month") {
      const date = new Date(doneAt(task) * 1000);
      group = {
        key: `${date.getFullYear()}-${date.getMonth()}`,
        label: capitalized(
          date.toLocaleDateString(locale, {
            month: "long",
            year: date.getFullYear() === thisYear ? undefined : "numeric",
          }),
        ),
      };
    } else {
      const goal = goals.find((g) => g.id === task.goalId);
      group = goal
        ? { key: goal.id, label: goal.name, goal }
        : { key: "", label: t("No goal") };
    }
    const existing = groups.get(group.key);
    if (existing) existing.tasks.push(task);
    else groups.set(group.key, { ...group, tasks: [task] });
  }
  const list = [...groups.values()];
  if (by === "goal") list.sort((a, b) => +!a.goal - +!b.goal);
  return list;
}

/** "Concluída hoje", "Concluída ontem" or "Concluída em 23 de out.". */
function doneLabel(seconds: number) {
  const date = new Date(seconds * 1000);
  const days = Math.round(
    (new Date(new Date().toDateString()).getTime() -
      new Date(date.toDateString()).getTime()) /
      86_400_000,
  );
  if (days <= 0) return t("Done today");
  if (days === 1) return t("Done yesterday");
  return t("Done on {0}", [
    date.toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
      year:
        date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    }),
  ]);
}

const count = (n: number) => (n === 1 ? t("1 task") : t("{0} tasks", [n]));

/**
 * Every project's done tasks, off the board. Opening one shows the task and its delivery; moving
 * it out of Done puts it back on the board.
 */
export function ArchivePage({
  tasks,
  goals,
  projects,
  view,
  onView,
  selectedId,
  menuId,
  onOpen,
  onMenu,
}: {
  tasks: Task[];
  goals: Goal[];
  projects: Project[];
  view: ArchiveView;
  onView: (patch: Partial<ArchiveView>) => void;
  selectedId?: string;
  menuId?: string | null;
  onOpen: (task: Task) => void;
  onMenu?: (request: MenuRequest) => void;
}) {
  const archived = tasks.filter((task) => task.status === "done");
  const withArchive = projects.filter((p) =>
    archived.some((task) => task.projectId === p.id),
  );
  // A project that no longer has anything here stops filtering.
  const current = {
    ...view,
    projectId: withArchive.some((p) => p.id === view.projectId)
      ? view.projectId
      : null,
  };
  const sections = archiveSections(tasks, goals, current);
  const projectOf = (id: string) => projects.find((p) => p.id === id);
  /** Inside a project's box the rows leave out the project they all share. */
  const group = (group: ArchiveSection["groups"][number], inBox: boolean) => (
    <section key={group.key} className="archive-group" aria-label={group.label}>
      <h3 className="archive-group-head">
        <span className="truncate">{group.label}</span>
        {group.goal ? (
          <GoalState goal={group.goal} tasks={tasks} />
        ) : (
          <span className="archive-group-meta">
            {count(group.tasks.length)}
          </span>
        )}
      </h3>
      <ul className="rows">
        {group.tasks.map((task) => {
          const project = projectOf(task.projectId);
          return (
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
                {!inBox && (
                  <span
                    className="swatch"
                    style={{ background: projectColor(project) }}
                    aria-hidden="true"
                  />
                )}
                <span className="row-text">
                  <span className="row-title truncate">{task.title}</span>
                  <span className="row-sub archive-refs">
                    <span className="truncate">
                      {inBox
                        ? task.category
                        : `${project?.name}, ${task.category}`}
                    </span>
                    {task.repositoryBranch ? (
                      <span className="archive-ref">
                        <Icon name="branch" size={11} />
                        <code className="truncate">
                          {task.repositoryBranch}
                        </code>
                      </span>
                    ) : (
                      task.commitHash && (
                        <code className="archive-ref">
                          {task.commitHash.slice(0, 7)}
                        </code>
                      )
                    )}
                    {task.pullRequestNumber !== null && (
                      <span className="archive-ref">
                        {t("PR")} {task.pullRequestNumber}
                      </span>
                    )}
                  </span>
                </span>
                <span className="row-sub">{doneLabel(doneAt(task))}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
  return (
    <div className="page scroll archive-page">
      <div className="page-inner wide">
        <header className="page-hero">
          <h1>{t("Archive")}</h1>
          <p>
            {t(
              "Done tasks. Open one to see the delivery or move it back to the board.",
            )}
          </p>
        </header>
        {archived.length === 0 ? (
          <div className="empty-state">
            <Icon name="archive" size={22} />
            <strong>{t("Nothing in the Archive yet")}</strong>
            <p>{t("Tasks you conclude leave the board and land here.")}</p>
          </div>
        ) : (
          <>
            <div className="archive-tools">
              <div className="archive-search">
                <Icon name="search" size={14} />
                <input
                  type="search"
                  aria-label={t("Search the Archive")}
                  placeholder={t("Search the Archive")}
                  autoComplete="off"
                  spellCheck={false}
                  value={view.query}
                  onChange={(e) => onView({ query: e.target.value })}
                />
              </div>
              {withArchive.length > 1 && (
                <div
                  className="archive-projects"
                  role="radiogroup"
                  aria-label={t("Project")}
                >
                  {[null, ...withArchive].map((p) => (
                    <button
                      key={p?.id ?? "*"}
                      type="button"
                      role="radio"
                      aria-checked={current.projectId === (p?.id ?? null)}
                      className={`chip-button ${current.projectId === (p?.id ?? null) ? "on" : ""}`}
                      onClick={() => onView({ projectId: p?.id ?? null })}
                    >
                      {p && (
                        <span
                          className="swatch"
                          style={{ background: projectColor(p) }}
                          aria-hidden="true"
                        />
                      )}
                      <span className="truncate">
                        {p ? p.name : t("All projects")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="archive-group-by">
                <span id="archive-group-by">{t("Group by")}</span>
                <Segmented
                  size="small"
                  labelledBy="archive-group-by"
                  options={[
                    { value: "goal", label: t("Goal") },
                    { value: "month", label: t("Month") },
                    { value: "project", label: t("Project") },
                  ]}
                  value={view.group}
                  onChange={(group) => onView({ group })}
                />
              </div>
            </div>
            {sections.length === 0 || sections[0].groups.length === 0 ? (
              <p className="block-empty archive-none">
                {view.query.trim()
                  ? t("No archived task matches “{0}”.", [view.query.trim()])
                  : t("No archived tasks in this project.")}
              </p>
            ) : (
              sections.map((section) => {
                const project =
                  section.projectId !== null
                    ? projectOf(section.projectId)
                    : undefined;
                if (!project) return section.groups.map((g) => group(g, false));
                const total = section.groups.reduce(
                  (sum, g) => sum + g.tasks.length,
                  0,
                );
                return (
                  <section
                    key={project.id}
                    className="archive-project"
                    aria-label={project.name}
                  >
                    <h2 className="archive-project-head">
                      <span
                        className="swatch large"
                        style={{ background: projectColor(project) }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{project.name}</span>
                      <span className="archive-group-meta">{count(total)}</span>
                    </h2>
                    {section.groups.map((g) => group(g, true))}
                  </section>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** A goal's share of tasks in the Archive, and whether the goal itself was concluded. */
function GoalState({ goal, tasks }: { goal: Goal; tasks: Task[] }) {
  const { total, done } = goalProgress(goal, tasks);
  return (
    <>
      <span
        className="archive-goal-bar"
        role="img"
        aria-label={t("{0} of {1} done", [done, total])}
      >
        <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </span>
      <span className="archive-group-meta">
        {goal.completedAt !== null
          ? t("Concluded on {0}, {1}", [
              new Date(goal.completedAt * 1000).toLocaleDateString(locale, {
                day: "numeric",
                month: "short",
              }),
              count(total),
            ])
          : t("In progress, {0} of {1} in the Archive", [done, total])}
      </span>
    </>
  );
}
