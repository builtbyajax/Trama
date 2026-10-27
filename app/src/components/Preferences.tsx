import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  agentPath,
  copyText,
  errorMessage,
  revealLabel,
  revealPath,
} from "../lib/api";
import type {
  BoardView,
  Project,
  Snapshot,
  Workspace,
  Workspaces,
} from "../lib/types";
import { CopyIcon, Icon, type IconName } from "./Icon";
import { ContextMenu, NavItem, type MenuItem } from "./Sidebar";
import { workspaceName } from "./Workspaces";
import { ProjectMark } from "./ProjectMark";
import { radioKeyDown, Segmented } from "./Segmented";
import { language, languages, setLanguage, t } from "../lib/i18n";
import { keycaps, shortcuts } from "../lib/shortcuts";
import type { AppUpdater } from "../hooks/useAppUpdater";

export type PreferencesSection =
  "general" | "board" | "projects" | "agent" | "updates";

const sections: { id: PreferencesSection; icon: IconName }[] = [
  { id: "general", icon: "gear" },
  { id: "board", icon: "board" },
  { id: "projects", icon: "folder" },
  { id: "agent", icon: "terminal" },
  { id: "updates", icon: "refresh" },
];

const sectionTitle = (section: PreferencesSection) =>
  section === "general"
    ? t("General")
    : section === "board"
      ? t("Board")
      : section === "projects"
        ? t("Projects")
        : section === "agent"
          ? t("Agent and MCP")
          : t("Updates");

/** Takes the sidebar's place while Preferences is open, like the sections of macOS Settings. */
export function PreferencesNav({
  section,
  updateAvailable,
  onSection,
}: {
  section: PreferencesSection;
  updateAvailable: boolean;
  onSection: (section: PreferencesSection) => void;
}) {
  return (
    <nav className="sidebar preferences-nav" aria-label={t("Preferences")}>
      <div className="sidebar-section">
        <span>{t("Preferences")}</span>
      </div>
      <div className="sidebar-group">
        {sections.map((item) => (
          <NavItem
            key={item.id}
            icon={item.icon}
            label={sectionTitle(item.id)}
            selected={section === item.id}
            notice={item.id === "updates" && updateAvailable}
            onClick={() => onSection(item.id)}
          />
        ))}
      </div>
    </nav>
  );
}

type CopyButton = (value: string, label: string, done: string) => ReactNode;

export function Preferences({
  section,
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
  section: PreferencesSection;
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
  const fail = (e: unknown) => notify(errorMessage(e), true);
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
  const copyButton: CopyButton = (value, label, done) => (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      onClick={() => copy(value, done)}
    >
      <CopyIcon copied={justCopied === value} size={14} />
    </button>
  );
  const lead =
    section === "general"
      ? t("The language and where your data lives.")
      : section === "board"
        ? t("Applies to the board of every project and goal.")
        : section === "projects"
          ? t("The projects of the open workspace, in sidebar order.")
          : section === "agent"
            ? t("How Claude Code, Codex and other agents reach Trama.")
            : t("Installed version: {0}.", [updater.installedVersion ?? "—"]);
  return (
    <div className="page scroll">
      <div className="page-inner narrow preferences">
        <header className="page-hero">
          <h1>{sectionTitle(section)}</h1>
          <p>{lead}</p>
        </header>
        {section === "general" ? (
          <>
            <section className="settings-group">
              <div className="settings-row">
                <div className="settings-text">
                  <span id="language-title">{t("Language")}</span>
                  <span className="muted small">
                    {t(
                      "Trama reloads to show everything in the chosen language.",
                    )}
                  </span>
                </div>
                {/* Each language is named in itself, so it can be found from the other one. */}
                <Segmented
                  labelledBy="language-title"
                  options={languages.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  value={language}
                  onChange={setLanguage}
                />
              </div>
            </section>
            <WorkspacesGroup
              data={data}
              workspaces={workspaces}
              onEditWorkspace={onEditWorkspace}
              onLeaveWorkspace={onLeaveWorkspace}
              copyButton={copyButton}
              fail={fail}
            />
          </>
        ) : section === "board" ? (
          <>
            <section className="settings-group">
              <h2 id="board-view-title">{t("Board view")}</h2>
              <p className="muted">
                {t(
                  "How tasks show in the Board tab. Stages and order are the same in both.",
                )}
              </p>
              <BoardViewCards value={boardView} onChange={onBoardView} />
            </section>
            <section className="settings-group">
              <div className="settings-row">
                <div className="settings-text">
                  <span>{t("Switch with the shortcut")}</span>
                  <span className="muted small">
                    {t(
                      "Works anywhere in Trama, and opens the board when a project is open.",
                    )}
                  </span>
                </div>
                <span className="keycaps">
                  {keycaps(shortcuts.boardView).map((cap) => (
                    <kbd key={cap} className="keycap">
                      {cap}
                    </kbd>
                  ))}
                </span>
              </div>
            </section>
          </>
        ) : section === "projects" ? (
          <section className="settings-group">
            <ul className="settings-list">
              {data.projects.map((project) => (
                <li className="settings-row" key={project.id}>
                  <ProjectMark project={project} />
                  <div className="settings-text">
                    <span className="truncate">{project.name}</span>
                    {project.repositoryPath ? (
                      <code title={project.repositoryPath}>
                        {project.repositoryPath}
                      </code>
                    ) : (
                      <span className="muted small">{t("No repository")}</span>
                    )}
                  </div>
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
                </li>
              )}
            </ul>
            <div className="settings-actions">
              <button type="button" className="button" onClick={onAddProject}>
                <Icon name="plus" size={14} />
                {t("Add project")}
              </button>
            </div>
          </section>
        ) : section === "agent" ? (
          <AgentSection projects={data.projects} copyButton={copyButton} />
        ) : (
          <UpdatesSection updater={updater} fail={fail} />
        )}
        <p className="muted small" role="status">
          {copied}
        </p>
      </div>
    </div>
  );
}

function WorkspacesGroup({
  data,
  workspaces,
  onEditWorkspace,
  onLeaveWorkspace,
  copyButton,
  fail,
}: {
  data: Snapshot;
  workspaces: Workspaces | null;
  onEditWorkspace: (workspace: Workspace) => void;
  onLeaveWorkspace: (workspace: Workspace, mode: "remove" | "delete") => void;
  copyButton: CopyButton;
  fail: (e: unknown) => void;
}) {
  const [menu, setMenu] = useState<{
    workspace: Workspace;
    x: number;
    y: number;
    trigger: HTMLElement;
  } | null>(null);
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
    // Any one can go, even the last: Trama then asks for a new one.
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
  ];
  return (
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
                  <span className="settings-tag warning">{t("Not found")}</span>
                )}
              </span>
              <code className="selectable" title={workspace.path}>
                {workspace.path}
              </code>
            </div>
            {copyButton(
              workspace.path,
              t("Copy path of {0}", [workspaceName(workspace)]),
              t("Path copied."),
            )}
            {workspaces && !workspaces.pinned && (
              <button
                type="button"
                className="icon-button"
                aria-label={t("Actions for {0}", [workspaceName(workspace)])}
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
  );
}

const views: BoardView[] = ["kanban", "list"];

/** Kanban and List as cards with a miniature of each, so the choice shows what it changes. */
function BoardViewCards({
  value,
  onChange,
}: {
  value: BoardView;
  onChange: (view: BoardView) => void;
}) {
  const group = useRef<HTMLDivElement>(null);
  const choose = (index: number) => {
    group.current
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      [index]?.focus();
    onChange(views[index]);
  };
  return (
    <div
      ref={group}
      className="option-cards"
      role="radiogroup"
      aria-labelledby="board-view-title"
    >
      {views.map((view, index) => (
        <button
          key={view}
          type="button"
          role="radio"
          className="option-card"
          aria-checked={value === view}
          tabIndex={value === view ? 0 : -1}
          onClick={() => onChange(view)}
          onKeyDown={(event) =>
            radioKeyDown(event, views.length, index, choose)
          }
        >
          {view === "kanban" ? <KanbanPreview /> : <ListPreview />}
          <span className="option-name">
            <span className="option-radio" aria-hidden="true" />
            {view === "kanban" ? t("Kanban") : t("List")}
          </span>
          <span className="option-note">
            {view === "kanban"
              ? t(
                  "One column per stage. Drag a card to move it or conclude it.",
                )
              : t(
                  "One row per task, grouped by stage, with category, goal and who has it.",
                )}
          </span>
        </button>
      ))}
    </div>
  );
}

const previewStages = ["backlog", "todo", "inProgress", "review"] as const;

function KanbanPreview() {
  const cards = [3, 2, 2, 1];
  return (
    <span className="option-preview kanban" aria-hidden="true">
      {previewStages.map((stage, index) => (
        <span key={stage} className="preview-column">
          <span className={`preview-head s-${stage}`} />
          {Array.from({ length: cards[index] }, (_, card) => (
            <span key={card} className="preview-card" />
          ))}
        </span>
      ))}
    </span>
  );
}

function ListPreview() {
  const rows = [1, 2, 1, 1];
  return (
    <span className="option-preview list" aria-hidden="true">
      {[...previewStages].reverse().map((stage, index) => (
        <span key={stage} className="preview-group">
          <span className={`preview-head s-${stage}`} />
          {Array.from({ length: rows[index] }, (_, row) => (
            <span key={row} className="preview-row" />
          ))}
        </span>
      ))}
    </span>
  );
}

function AgentSection({
  projects,
  copyButton,
}: {
  projects: Project[];
  copyButton: CopyButton;
}) {
  const [agent, setAgent] = useState<string | null>(null);
  useEffect(() => {
    void agentPath()
      .then(setAgent)
      .catch(() => setAgent(null));
  }, []);
  const binary = agent ?? "trama-agent";
  const command = `claude mcp add trama -- ${/\s/.test(binary) ? `"${binary}"` : binary} --workspace`;
  return (
    <>
      <section className="settings-group">
        <h2>{t("Connect every project")}</h2>
        <p className="muted">
          {t(
            "The agent sees every project of the open workspace and picks one by its ID. This is the command for Claude Code; other agents take the same program and arguments.",
          )}
        </p>
        <div className="settings-row">
          <code className="selectable">{command}</code>
          {copyButton(command, t("Copy command"), t("Command copied."))}
        </div>
      </section>
      <section className="settings-group">
        <h2>{t("Project IDs")}</h2>
        <p className="muted">
          {t(
            "To connect an agent to a single project, use --project-id with its ID instead of --workspace.",
          )}
        </p>
        <ul className="settings-list">
          {projects.map((project) => (
            <li className="settings-row" key={project.id}>
              <ProjectMark project={project} />
              <div className="settings-text">
                <span className="truncate">{project.name}</span>
                <code className="selectable">{project.id}</code>
              </div>
              {copyButton(
                project.id,
                t("Copy ID of {0}", [project.name]),
                t("ID copied."),
              )}
            </li>
          ))}
          {projects.length === 0 && (
            <li className="settings-row">
              <span className="settings-text muted">
                {t("No projects created yet.")}
              </span>
            </li>
          )}
        </ul>
      </section>
    </>
  );
}

function UpdatesSection({
  updater,
  fail,
}: {
  updater: AppUpdater;
  fail: (e: unknown) => void;
}) {
  const busy = updater.status === "checking" || updater.installing;
  return (
    <section className="settings-group">
      <ul className="settings-list">
        <li className="settings-row">
          <div className="settings-text" role="status" aria-live="polite">
            <span>
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
            </span>
            {updater.availableUpdate && (
              <span className="muted small">
                {t("Trama restarts to finish installing.")}
              </span>
            )}
          </div>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => void updater.check()}
          >
            {t("Check now")}
          </button>
          {updater.availableUpdate && (
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => void updater.install().catch(fail)}
            >
              {updater.installing
                ? t("Installing update…")
                : t("Update and restart")}
            </button>
          )}
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
              onChange={(event) => updater.setAutoCheck(event.target.checked)}
            />
          </label>
        </li>
      </ul>
    </section>
  );
}
