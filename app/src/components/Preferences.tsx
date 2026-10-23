import { useState } from "react";
import {
  chooseDirectory,
  copyText,
  errorMessage,
  relocateWorkspace,
  removeWorkspace,
  revealLabel,
  revealPath,
} from "../lib/api";
import type { Project, Snapshot, Workspace, Workspaces } from "../lib/types";
import { Icon } from "./Icon";
import { ContextMenu, type MenuItem } from "./Sidebar";
import { workspaceName } from "./Workspaces";
import { language, languages, setLanguage, t } from "../lib/i18n";

export function Preferences({
  data,
  workspaces,
  onWorkspaces,
  onRenameWorkspace,
  notify,
  onEdit,
}: {
  data: Snapshot;
  workspaces: Workspaces | null;
  onWorkspaces: (list: Workspaces) => void;
  onRenameWorkspace: (workspace: Workspace) => void;
  notify: (message: string, error?: boolean) => void;
  onEdit: (project: Project) => void;
}) {
  const [copied, setCopied] = useState("");
  const [menu, setMenu] = useState<{
    workspace: Workspace;
    x: number;
    y: number;
    trigger: HTMLElement;
  } | null>(null);
  const fail = (e: unknown) => notify(errorMessage(e), true);
  const defaultPath = workspaces?.workspaces[0]?.path;
  const actions = (workspace: Workspace): MenuItem[] => [
    {
      label: t("Rename…"),
      icon: "rename",
      onSelect: () => onRenameWorkspace(workspace),
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
    ...(workspace.missing || workspace.path === defaultPath
      ? []
      : [
          {
            label: t("Move file…"),
            icon: "folder" as const,
            onSelect: () =>
              void chooseDirectory(t("Move the workspace to"))
                .then((folder) =>
                  folder
                    ? relocateWorkspace(workspace.path, folder).then((list) => {
                        onWorkspaces(list);
                        notify(t("Workspace file moved."));
                      })
                    : undefined,
                )
                .catch(fail),
          },
        ]),
    ...(workspace.path === workspaces?.active || workspace.path === defaultPath
      ? []
      : [
          {
            label: t("Remove from list"),
            icon: "close" as const,
            separated: true,
            onSelect: () =>
              void removeWorkspace(workspace.path)
                .then((list) => {
                  onWorkspaces(list);
                  notify(
                    t("“{0}” left the list. The file wasn't touched.", [
                      workspaceName(workspace),
                    ]),
                  );
                })
                .catch(fail),
          },
        ]),
  ];
  const copy = (value: string, label: string) =>
    void copyText(value)
      .then(() => setCopied(label))
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
              : [{ name: "", path: data.databasePath, missing: false }]
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
                  <Icon name="copy" size={14} />
                </button>
                {workspaces && !workspaces.pinned && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t("Actions for {0}", [
                      workspaceName(workspace),
                    ])}
                    aria-haspopup="menu"
                    onClick={(event) => {
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
                  <Icon name="copy" size={14} />
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
          </ul>
          {data.projects.length === 0 && (
            <p className="muted">{t("No projects created.")}</p>
          )}
        </section>
        <p className="muted small" role="status">
          {copied}
        </p>
      </div>
    </div>
  );
}
