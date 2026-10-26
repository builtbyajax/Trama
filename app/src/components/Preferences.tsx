import { useState } from "react";
import { copyText, errorMessage, revealLabel, revealPath } from "../lib/api";
import type {
  BoardView,
  Project,
  Snapshot,
  Workspace,
  Workspaces,
} from "../lib/types";
import { CopyIcon, Icon } from "./Icon";
import { ContextMenu, type MenuItem } from "./Sidebar";
import { workspaceName } from "./Workspaces";
import { language, languages, setLanguage, t } from "../lib/i18n";
import type { AppUpdater } from "../hooks/useAppUpdater";

export function Preferences({
  data,
  workspaces,
  onEditWorkspace,
  onLeaveWorkspace,
  notify,
  boardView,
  onBoardView,
  onEdit,
  onAddProject,
  updater,
}: {
  data: Snapshot;
  workspaces: Workspaces | null;
  onEditWorkspace: (workspace: Workspace) => void;
  /** Asks before the workspace leaves the list or is deleted, the open one included. */
  onLeaveWorkspace: (workspace: Workspace, mode: "remove" | "delete") => void;
  notify: (message: string, error?: boolean) => void;
  boardView: BoardView;
  onBoardView: (view: BoardView) => void;
  onEdit: (project: Project) => void;
  onAddProject: () => void;
  updater: AppUpdater;
}) {
  const [copied, setCopied] = useState("");
  /** The value just copied, whose button shows a check for a moment. */
  const [justCopied, setJustCopied] = useState("");
  const [menu, setMenu] = useState<{
    workspace: Workspace;
    x: number;
    y: number;
    trigger: HTMLElement;
  } | null>(null);
  const fail = (e: unknown) => notify(errorMessage(e), true);
  const list = workspaces?.workspaces ?? [];
  // Any workspace can go as long as one remains; the open one also needs another to switch to.
  const canLeave = (workspace: Workspace) =>
    workspace.path === workspaces?.active
      ? list.some((w) => w.path !== workspace.path && !w.missing)
      : list.length > 1;
  const actions = (workspace: Workspace): MenuItem[] => [
    {
      label: t("Edit…"),
      icon: "rename",
      onSelect: () => onEditWorkspace(workspace),
    },
    ...(workspace.missing
      ? []
      : [
          {
            label: revealLabel(),
            icon: "reveal" as const,
            onSelect: () => void revealPath(workspace.path).catch(fail),
          },
        ]),
    ...(!canLeave(workspace)
      ? []
      : [
          {
            label: t("Remove from list…"),
            icon: "close" as const,
            separated: true,
            onSelect: () => onLeaveWorkspace(workspace, "remove"),
          },
          ...(workspace.missing
            ? []
            : [
                {
                  label: t("Delete…"),
                  icon: "trash" as const,
                  danger: true,
                  onSelect: () => onLeaveWorkspace(workspace, "delete"),
                },
              ]),
        ]),
  ];
  const copy = (value: string, label: string) =>
    void copyText(value)
      .then(() => {
        setCopied(label);
        setJustCopied(value);
        window.setTimeout(
          () => setJustCopied((now) => (now === value ? "" : now)),
          1400,
        );
      })
      .catch(() => setCopied(t("Couldn't copy.")));
  return (
    <div className="page scroll">
      <div className="page-inner narrow preferences">
        <header className="page-hero">
          <h1>{t("Preferences")}</h1>
          <p>
            {t(
              "The language, where your data lives and how the agent connects.",
            )}
          </p>
        </header>
        <section className="settings-group">
          <h2 id="language-title">{t("Language")}</h2>
          <p className="muted">
            {t("Trama reloads to show everything in the chosen language.")}
          </p>
          {/* Each language is named in itself, so it can be found from the other one. */}
          <div
            className="segmented"
            role="group"
            aria-labelledby="language-title"
          >
            {languages.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={language === option.value}
                className={language === option.value ? "on" : ""}
                onClick={() =>
                  language !== option.value && setLanguage(option.value)
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>
        <section className="settings-group">
          <h2 id="board-view-title">{t("Board view")}</h2>
          <p className="muted">
            {t(
              "How tasks show in the Board tab, in every project and goal. Stages and order are the same in both.",
            )}
          </p>
          <div
            className="segmented"
            role="group"
            aria-labelledby="board-view-title"
          >
            {(["kanban", "list"] as const).map((view) => (
              <button
                key={view}
                type="button"
                aria-pressed={boardView === view}
                className={boardView === view ? "on" : ""}
                onClick={() => onBoardView(view)}
              >
                {view === "kanban" ? t("Kanban") : t("List")}
              </button>
            ))}
          </div>
        </section>
        <section className="settings-group">
          <h2>{t("Updates")}</h2>
          <p className="muted">{t("Choose when Trama checks for updates.")}</p>
          <ul className="settings-list">
            <li className="settings-row">
              <div className="settings-text">
                <span>{t("Installed version")}</span>
                <code>{updater.installedVersion ?? "—"}</code>
              </div>
            </li>
            <li className="settings-row">
              <label className="settings-toggle">
                <span className="settings-text">
                  <span>{t("Check for updates automatically")}</span>
                  <span className="muted small">
                    {t("Checks when the app opens and once a day.")}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={updater.autoCheck}
                  onChange={(event) =>
                    updater.setAutoCheck(event.target.checked)
                  }
                />
              </label>
            </li>
            <li className="settings-row">
              <div className="settings-text" role="status" aria-live="polite">
                {updater.status === "checking"
                  ? t("Checking for updates…")
                  : updater.availableUpdate
                    ? t("Version {0} is available.", [
                        updater.availableUpdate.version,
                      ])
                    : updater.status === "current"
                      ? t("Trama is up to date.")
                      : updater.status === "error"
                        ? t("Couldn't check for updates. Try again later.")
                        : t("Check for a newer version of Trama.")}
              </div>
              {updater.availableUpdate && (
                <button
                  type="button"
                  className="button"
                  disabled={updater.status === "checking" || updater.installing}
                  onClick={() => void updater.check()}
                >
                  {t("Check now")}
                </button>
              )}
              <button
                type="button"
                className={`button ${updater.availableUpdate ? "primary" : ""}`}
                disabled={updater.status === "checking" || updater.installing}
                onClick={() =>
                  updater.availableUpdate
                    ? void updater.install().catch(fail)
                    : void updater.check()
                }
              >
                {updater.availableUpdate
                  ? updater.installing
                    ? t("Installing update…")
                    : t("Update and restart")
                  : t("Check now")}
              </button>
            </li>
          </ul>
        </section>
        <section className="settings-group">
          <h2>{t("Workspaces")}</h2>
          <p className="muted">
            {workspaces?.pinned
              ? t("TRAMA_DB chose this database, so workspaces can't change.")
              : t(
                  "Each workspace is a database file on this computer, with its own projects. Agents follow the open one. The Git screen is read-only: Trama doesn't change branches or push anything.",
                )}
          </p>
          <ul className="settings-list">
            {(workspaces && !workspaces.pinned
              ? workspaces.workspaces
              : [
                  {
                    name: "",
                    path: data.databasePath,
                    missing: false,
                    color: null,
                    icon: null,
                  },
                ]
            ).map((workspace) => (
              <li className="settings-row" key={workspace.path}>
                <div className="settings-text">
                  <span className="truncate">
                    {workspaceName(workspace)}
                    {workspace.path === data.databasePath && (
                      <span className="settings-tag">{t("Open now")}</span>
                    )}
                    {workspace.missing && (
                      <span className="settings-tag warning">
                        {t("Not found")}
                      </span>
                    )}
                  </span>
                  <code className="selectable" title={workspace.path}>
                    {workspace.path}
                  </code>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("Copy path of {0}", [workspaceName(workspace)])}
                  onClick={() => copy(workspace.path, t("Path copied."))}
                >
                  <CopyIcon copied={justCopied === workspace.path} size={14} />
                </button>
                {workspaces && !workspaces.pinned && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t("Actions for {0}", [
                      workspaceName(workspace),
                    ])}
                    aria-haspopup="menu"
                    aria-expanded={menu?.workspace.path === workspace.path}
                    onClick={(event) => {
                      if (menu?.workspace.path === workspace.path)
                        return setMenu(null);
                      const rect = event.currentTarget.getBoundingClientRect();
                      setMenu({
                        workspace,
                        x: rect.left,
                        y: rect.bottom + 4,
                        trigger: event.currentTarget,
                      });
                    }}
                  >
                    <Icon name="more" size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {menu && (
            <ContextMenu
              x={menu.x}
              y={menu.y}
              label={t("Actions for {0}", [workspaceName(menu.workspace)])}
              anchor={{ current: menu.trigger }}
              items={actions(menu.workspace)}
              onClose={(restoreFocus) => {
                if (restoreFocus) menu.trigger.focus();
                setMenu(null);
              }}
            />
          )}
        </section>
        <section className="settings-group">
          <h2>{t("Projects and MCP integration")}</h2>
          <p className="muted">
            {t("Each agent connects to a single project using the ID below.")}
          </p>
          <ul className="settings-list">
            {data.projects.map((project) => (
              <li className="settings-row" key={project.id}>
                <div className="settings-text">
                  <span className="truncate">{project.name}</span>
                  <code className="selectable">{project.id}</code>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("Copy ID of {0}", [project.name])}
                  onClick={() => copy(project.id, t("ID copied."))}
                >
                  <CopyIcon copied={justCopied === project.id} size={14} />
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => onEdit(project)}
                >
                  {t("Edit project")}
                </button>
              </li>
            ))}
            {data.projects.length === 0 && (
              <li className="settings-row">
                <span className="settings-text muted">
                  {t("No projects created yet.")}
                </span>
                <button type="button" className="button" onClick={onAddProject}>
                  <Icon name="plus" size={14} />
                  {t("Add project")}
                </button>
              </li>
            )}
          </ul>
        </section>
        <p className="muted small" role="status">
          {copied}
        </p>
      </div>
    </div>
  );
}
