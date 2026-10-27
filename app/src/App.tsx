import { useMemo, useRef, useState, type CSSProperties } from "react";
import { AgentProfilesContext } from "./lib/agents";
import { Board } from "./components/Board";
import { BrandMark } from "./components/BrandMark";
import { Icon, StatusIcon } from "./components/Icon";
import {
  ProjectHeader,
  defaultFilter,
  type BoardFilter,
  type ProjectMode,
} from "./components/BoardFilters";
import { NotesView } from "./components/notes/NotesView";
import { ProjectNotesSetup } from "./components/notes/NotesSetup";
import { Vaults } from "./components/notes/Vaults";
import { CategoryManager } from "./components/CategoryManager";
import { Topbar, type Crumb } from "./components/Topbar";
import { Preferences, PreferencesNav } from "./components/Preferences";
import { useAppCommands } from "./hooks/useAppCommands";
import { useBoardMoves } from "./hooks/useBoardMoves";
import { useBranches } from "./hooks/useBranches";
import { useHintKey } from "./hooks/useHintKey";
import { useNavigation } from "./hooks/useNavigation";
import { useSidebarLayout } from "./hooks/useSidebarLayout";
import { useSnapshot } from "./hooks/useSnapshot";
import { useToast } from "./hooks/useToast";
import { useAppUpdater } from "./hooks/useAppUpdater";
import { useWorkspaces } from "./hooks/useWorkspaces";
import { Tooltips } from "./components/Tooltips";
import {
  ArchivePage,
  archiveSections,
  defaultArchiveView,
  type ArchiveView,
} from "./components/ArchivePage";
import { AgentsPage } from "./components/AgentsPage";
import { BoardList, listOrder } from "./components/BoardList";
import { ProjectPage } from "./components/ProjectPage";
import { useStoredState } from "./hooks/useStoredState";
import { Overview } from "./components/Overview";
import {
  Sidebar,
  projectColor,
  projectHues,
  type Destination,
} from "./components/Sidebar";
import { SidebarSlot } from "./components/SidebarSlot";
import { GitProject } from "./components/git/GitProject";
import { ProjectComposer, ProjectDelete } from "./components/ProjectComposer";
import { ProjectSwitcher } from "./components/ProjectSwitcher";
import { SearchPanel } from "./components/SearchPanel";
import { ShortcutsSheet } from "./components/ShortcutsSheet";
import { TaskComposer } from "./components/TaskComposer";
import { TaskSheet, type SheetMode } from "./components/TaskSheet";
import { categoryNames } from "./components/TaskFields";
import { copyText, editTask, errorMessage, openUrl } from "./lib/api";
import { ContextMenu, type MenuItem } from "./components/Sidebar";
import { TaskDelete } from "./components/TaskDelete";
import { UpdateNotices } from "./components/UpdateNotices";
import { ProjectMove } from "./components/ProjectMove";
import {
  GoalComplete,
  GoalComposer,
  GoalActions,
  ConcludedGoals,
  GoalDelete,
  GoalSummary,
  SidebarGoals,
} from "./components/Goals";
import {
  WorkspaceButton,
  WorkspaceComposer,
  WorkspaceNaming,
  WorkspaceLeave,
  otherWorkspaces,
  workspaceName,
} from "./components/Workspaces";
import {
  completeGoal,
  createWorkspace,
  dismissOrganized,
  editWorkspace,
  openWorkspace,
  revealPath,
} from "./lib/api";
import {
  taskMenuItems,
  taskMenuLabel,
  type MenuRequest,
} from "./components/TaskMenu";
import { isMac, shortcutLabel, shortcuts } from "./lib/shortcuts";
import {
  boardStatuses,
  byPosition,
  isAgentWorking,
  statusTitle,
  type BoardView,
  type GitFocus,
  type Goal,
  type Project,
  type Task,
  type TaskStatus,
  type Workspace,
} from "./lib/types";
import { t } from "./lib/i18n";

export function App() {
  const { toast, notify, dismiss, hold, release } = useToast();
  const updater = useAppUpdater();
  const [gitFocus, setGitFocus] = useState<GitFocus | null>(null);
  const { place, setPlace, canBack, canForward, visit, go, forget, ...nav } =
    useNavigation(
      () => closeDetails(),
      () => setGitFocus(null),
    );
  const { destination, mode } = place;
  const { snapshot, error, revision, refresh } = useSnapshot((loaded) => {
    if (loaded.projects[0])
      setPlace({
        destination: { kind: "project", id: loaded.projects[0].id },
        mode: "project",
      });
  });
  const { data, landedId, setLandedId, move } = useBoardMoves(
    snapshot,
    refresh,
    notify,
  );
  const profiles = useMemo(
    () => new Map((snapshot?.agentProfiles ?? []).map((p) => [p.id, p])),
    [snapshot?.agentProfiles],
  );
  const [filters, setFilters] = useState<Record<string, BoardFilter>>({});
  const [selected, setSelected] = useState<{ id: string } | null>(null);
  const [sheetMode, setSheetMode] = useState<SheetMode>("sheet");
  const closeGuard = useRef<(() => boolean) | null>(null);
  const [search, setSearch] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [composer, setComposer] = useState<{
    projectId: string;
    status: TaskStatus;
  } | null>(null);
  const [projectComposer, setProjectComposer] = useState<{
    project?: Project;
  } | null>(null);
  const [projectDelete, setProjectDelete] = useState<Project | null>(null);
  const [projectMove, setProjectMove] = useState<Project | null>(null);
  const workspaces = useWorkspaces(notify);
  const [taskMenu, setTaskMenu] = useState<MenuRequest | null>(null);
  const [taskDelete, setTaskDelete] = useState<Task | null>(null);
  const [taskGoalMenu, setTaskGoalMenu] = useState<MenuRequest | null>(null);
  const [boardView, setBoardView] = useStoredState<BoardView>(
    "trama.boardView",
    (saved) => (saved === "list" ? "list" : "kanban"),
    (value) => value,
  );
  const [archiveView, setArchiveView] =
    useState<ArchiveView>(defaultArchiveView);
  const [taskStatusMenu, setTaskStatusMenu] = useState<MenuRequest | null>(
    null,
  );
  const [goalComposer, setGoalComposer] = useState<{
    projectId: string;
    goal?: Goal;
  } | null>(null);
  const [goalComplete, setGoalComplete] = useState<Goal | null>(null);
  const [goalDelete, setGoalDelete] = useState<Goal | null>(null);
  const [concludedOpen, setConcludedOpen] = useState(false);
  const edited = workspaces.composer?.workspace;
  const [workspaceLeave, setWorkspaceLeave] = useState<{
    workspace: Workspace;
    mode: "remove" | "delete";
  } | null>(null);
  // Leaving the open workspace switches to another that exists first, when there is one.
  const leaveFallback =
    workspaceLeave?.workspace.path === workspaces.list?.active
      ? workspaces.list?.workspaces.find(
          (w) => w.path !== workspaceLeave?.workspace.path && !w.missing,
        )
      : undefined;
  const [noteRequest, setNoteRequest] = useState<{
    path: string;
    at: number;
    find?: string;
    edit?: boolean;
  } | null>(null);
  const project =
    destination.kind === "project"
      ? data?.projects.find((p) => p.id === destination.id)
      : undefined;
  // Notes and the history keep the sidebar as a rail and hide their own list instead.
  const panel = project && (mode === "notes" || mode === "git") ? mode : null;
  const rail = panel === "notes";
  // The title of the diff open over the history; the topbar names it and its Back closes it.
  const [diffTitle, setDiffTitle] = useState<string | null>(null);
  const reading = panel === "git" && diffTitle !== null;
  const {
    sidebarHidden,
    notesTreeHidden,
    hideNotesTree,
    historyHidden,
    diffFilesHidden,
    toggleSidebar,
    peek,
    showPeek,
    showPeekSoon,
    closePeek,
    hidePeek,
    endPeek,
  } = useSidebarLayout(reading ? "diff" : panel);
  // Preferences keep their sections in the sidebar, which can't be hidden there.
  const sidebarFixed = destination.kind === "preferences";
  const navHidden = sidebarHidden && !panel && !sidebarFixed;
  const toggleNav = sidebarFixed ? () => {} : toggleSidebar;
  const selectedTask = data?.tasks.find((t) => t.id === selected?.id);
  // Local branches of the open project and, from the Archive, of the open task's project.
  const branches = useBranches(project, revision);
  const sheetProject = data?.projects.find(
    (p) => p.id === selectedTask?.projectId,
  );
  const otherBranches = useBranches(
    sheetProject?.id === project?.id ? undefined : sheetProject,
    revision,
  );
  const sheetBranches =
    sheetProject?.id === project?.id ? branches : otherBranches;
  /** Closes the open task unless it has unsaved edits; returns whether it closed. */
  function closeDetails() {
    if (selectedTask && closeGuard.current?.()) return false;
    setSelected(null);
    setSheetMode("sheet");
    return true;
  }
  /** Another project opens on the same tab; the open project again returns to its page. */
  const navigate = (next: Destination) => {
    const keep =
      next.kind === "project" &&
      destination.kind === "project" &&
      next.id !== destination.id;
    go({ destination: next, mode: keep ? mode : "project" });
  };
  function back() {
    if (selectedTask) closeDetails();
    else if (reading) setDiffTitle(null);
    else nav.back();
  }
  function setProjectMode(next: ProjectMode) {
    if (project) go({ destination: place.destination, mode: next });
  }
  /** Opens a project's Notes tab, on a note and the text searched in it when given. */
  function openNote(
    projectId: string,
    path?: string,
    find?: string,
    edit?: boolean,
  ) {
    go({ destination: { kind: "project", id: projectId }, mode: "notes" });
    if (path) setNoteRequest({ path, at: Date.now(), find, edit });
  }
  function newTask(status?: TaskStatus) {
    if (!snapshot?.projects.length) {
      setProjectComposer({});
      return;
    }
    setComposer({
      projectId: project?.id ?? snapshot.projects[0].id,
      status: status ?? "todo",
    });
  }
  useHintKey();
  useAppCommands({
    newTask: () => newTask(),
    newProject: () => setProjectComposer({}),
    navigate,
    openProjectAt: (index) => {
      const target = snapshot?.projects[index];
      if (target) navigate({ kind: "project", id: target.id });
    },
    setProjectMode,
    toggleBoardView: () => {
      setBoardView((view) => (view === "list" ? "kanban" : "list"));
      // On another tab of a project, show the board that just changed.
      if (project && mode !== "board") setProjectMode("board");
    },
    openShortcuts: () => setShortcutsOpen(true),
    openSearch: () => setSearch(true),
    openSwitcher: () => {
      if (snapshot?.projects.length) setSwitcher(true);
    },
    toggleSidebar: toggleNav,
    reload: () => void refresh(),
    back,
    forward: nav.forward,
    toggleFullPage: () => {
      if (selectedTask) setSheetMode((v) => (v === "page" ? "sheet" : "page"));
    },
    closeDetails: () => {
      if (selectedTask) closeDetails();
    },
  });
  function openTask(task: Task) {
    // From the project page or the Archive the task opens over it; anywhere else, over its board.
    const onPage =
      mode === "project" &&
      destination.kind === "project" &&
      destination.id === task.projectId;
    visit({
      destination:
        destination.kind === "archive" && task.status === "done"
          ? destination
          : { kind: "project", id: task.projectId },
      mode: onPage ? "project" : "board",
    });
    setGitFocus(null);
    setSelected({ id: task.id });
  }
  function openTaskGit(task: Task) {
    if (!closeDetails()) return;
    go({
      destination: { kind: "project", id: task.projectId },
      mode: "git",
    });
    setGitFocus(
      task.repositoryBranch
        ? { kind: "task", id: task.id }
        : task.commitHash
          ? { kind: "commit", id: task.commitHash }
          : { kind: "task", id: task.id },
    );
  }
  /** The goals a task can move to: its project's open ones, and none. */
  function goalMenuItems(task: Task): MenuItem[] {
    const setGoal = (goalId: string | null, done: string) =>
      void editTask({ projectId: task.projectId, goalId }, task.id)
        .then(() => refresh())
        .then(() => notify(done))
        .catch((e) => notify(errorMessage(e), true));
    return [
      ...data!.goals
        .filter(
          (g) =>
            g.projectId === task.projectId &&
            (g.completedAt === null || g.id === task.goalId),
        )
        .map((g) => ({
          label: g.name,
          icon: "target" as const,
          checked: g.id === task.goalId,
          onSelect: () =>
            g.id !== task.goalId &&
            setGoal(g.id, t("“{0}” moved to “{1}”.", [task.title, g.name])),
        })),
      {
        label: t("No goal"),
        checked: task.goalId === null,
        separated: true,
        onSelect: () =>
          task.goalId !== null &&
          setGoal(null, t("“{0}” left its goal.", [task.title])),
      },
    ];
  }
  function menuItems(task: Task) {
    const column = data!.tasks
      .filter((t) => t.projectId === task.projectId && t.status === task.status)
      .sort(byPosition);
    const owner = data!.projects.find((p) => p.id === task.projectId);
    return taskMenuItems(task, {
      documents: data!.documents.filter((d) => d.taskId === task.id),
      atTop: column[0]?.id === task.id,
      hasRepository: Boolean(owner?.repositoryPath),
      branchExists: Boolean(
        task.repositoryBranch &&
        (task.projectId !== project?.id ||
          !branches ||
          branches.includes(task.repositoryBranch)),
      ),
      onOpen: () => openTask(task),
      onOpenPage: () => {
        openTask(task);
        setSheetMode("page");
      },
      onMoveToTop: () => void move(task.id, task.status, null),
      onConclude: () => void move(task.id, "done", null),
      onMoveToStatus: () => taskMenu && setTaskStatusMenu(taskMenu),
      onMoveToGoal: data!.goals.some(
        (g) =>
          g.projectId === task.projectId &&
          (g.completedAt === null || g.id === task.goalId),
      )
        ? () => taskMenu && setTaskGoalMenu(taskMenu)
        : undefined,
      onAssign: (assignee) =>
        void editTask({ projectId: task.projectId, assignee }, task.id)
          .then(() => refresh())
          .then(() =>
            notify(
              assignee === "agent"
                ? t("Task handed to the agent.")
                : t("The task is now yours."),
            ),
          )
          .catch((e) => notify(errorMessage(e), true)),
      onCopy: (value, done) =>
        void copyText(value).then(
          () => notify(done),
          () => notify(t("Couldn't copy."), true),
        ),
      onGit: () => openTaskGit(task),
      onOpenPullRequest: (url) =>
        void openUrl(url).catch((e) => notify(errorMessage(e), true)),
      onOpenNote: (path) => {
        if (closeDetails()) openNote(task.projectId, path);
      },
      onDelete: () => setTaskDelete(task),
    });
  }
  if (!data)
    return (
      // The window has no top bar here, so the whole screen moves it.
      <div className="fatal" data-tauri-drag-region>
        <div>
          {error ? (
            <>
              <p role="alert">{error}</p>
              <button className="button" onClick={() => void refresh()}>
                {t("Try again")}
              </button>
            </>
          ) : (
            t("Loading…")
          )}
        </div>
      </div>
    );
  // A new project gets the color fewest projects use.
  const colorUse = projectHues.map(
    (_, hue) => data.projects.filter((p) => p.color === hue).length,
  );
  const nextColor = colorUse.indexOf(Math.min(...colorUse));
  const boardTasks = project
    ? data.tasks.filter((t) => t.projectId === project.id)
    : [];
  const storedFilter = project
    ? { ...defaultFilter, ...filters[project.id] }
    : defaultFilter;
  const projectGoals = project
    ? data.goals.filter((g) => g.projectId === project.id)
    : [];
  // Done tasks leave the board for the Archive.
  const projectTasks = boardTasks.filter((t) => t.status !== "done");
  // A category or branch no task uses anymore no longer filters anything.
  const filter = {
    ...storedFilter,
    category:
      storedFilter.category === "*" ||
      projectTasks.some((t) => t.category === storedFilter.category)
        ? storedFilter.category
        : "*",
    branch:
      storedFilter.branch === "*" ||
      projectTasks.some(
        (t) => (t.repositoryBranch ?? "") === storedFilter.branch,
      )
        ? storedFilter.branch
        : "*",
    // A deleted goal no longer filters anything.
    goal:
      storedFilter.goal === "*" ||
      projectGoals.some((g) => g.id === storedFilter.goal)
        ? storedFilter.goal
        : "*",
  };
  // A profile no task has anymore no longer filters anything.
  if (
    filter.agent !== "*" &&
    filter.agent !== "" &&
    !projectTasks.some((t) => t.agentProfileId === filter.agent)
  )
    filter.agent = "*";
  const activeGoal = projectGoals.find((g) => g.id === filter.goal);
  const visibleTasks = projectTasks.filter(
    (t) =>
      (filter.assignee === "all" || t.assignee === filter.assignee) &&
      (filter.assignee !== "agent" ||
        filter.agent === "*" ||
        (t.assignee === "agent" &&
          (t.agentProfileId ?? "") === filter.agent)) &&
      (filter.category === "*" || t.category === filter.category) &&
      (filter.branch === "*" || (t.repositoryBranch ?? "") === filter.branch) &&
      (filter.goal === "*" || (t.goalId ?? "") === filter.goal),
  );
  const reopenGoal = (goal: Goal) =>
    void completeGoal(goal, false)
      .then(() => refresh())
      .then(() => notify(t("Goal “{0}” reopened.", [goal.name])))
      .catch((e) => notify(errorMessage(e), true));
  const changeFilter = (patch: Partial<BoardFilter>) =>
    project &&
    setFilters((v) => ({ ...v, [project.id]: { ...filter, ...patch } }));
  // Order the sheet steps through: the visible board, column by column, or the Archive.
  const sequence = project
    ? (boardView === "list" ? listOrder : boardStatuses).flatMap((status) =>
        visibleTasks.filter((t) => t.status === status).sort(byPosition),
      )
    : destination.kind === "archive"
      ? archiveSections(data.tasks, data.goals, archiveView).flatMap(
          (section) => section.groups.flatMap((group) => group.tasks),
        )
      : [];
  const selectedIndex = selectedTask ? sequence.indexOf(selectedTask) : -1;
  const step = (offset: number) => {
    const target = sequence[selectedIndex + offset];
    return selectedIndex >= 0 && target
      ? () => setSelected({ id: target.id })
      : undefined;
  };
  const openCounts: Record<string, number> = {};
  for (const task of data.tasks)
    if (task.status !== "done")
      openCounts[task.projectId] = (openCounts[task.projectId] ?? 0) + 1;
  const crumbs: Crumb[] = project
    ? [
        {
          label: project.name,
          project,
          onClick: () => go({ destination, mode: "project" }),
        },
        {
          label:
            mode === "project"
              ? t("Project")
              : mode === "git"
                ? t("History")
                : mode === "notes"
                  ? t("Notes")
                  : t("Board"),
          onClick: () => {
            if (closeDetails()) setDiffTitle(null);
          },
        },
      ]
    : [
        {
          label:
            destination.kind === "archive"
              ? t("Archive")
              : destination.kind === "preferences"
                ? t("Preferences")
                : destination.kind === "notes"
                  ? t("Vaults")
                  : destination.kind === "agents"
                    ? t("Agents")
                    : t("Overview"),
          onClick: () => closeDetails(),
        },
      ];
  if (reading) crumbs.push({ label: diffTitle });
  if (selectedTask && sheetMode === "page")
    crumbs.push({ label: selectedTask.title });
  return (
    <AgentProfilesContext.Provider value={profiles}>
      <div className="window">
        <Topbar
          sidebarHidden={
            rail
              ? notesTreeHidden
              : reading
                ? diffFilesHidden
                : panel
                  ? historyHidden
                  : navHidden
          }
          sidebarFixed={sidebarFixed}
          sidebarName={
            rail
              ? t("notes list")
              : reading
                ? t("file list")
                : panel
                  ? t("history list")
                  : t("sidebar")
          }
          canBack={Boolean(selectedTask) || reading || canBack}
          canForward={canForward}
          crumbs={crumbs}
          menu={[
            {
              label: t("New project…"),
              keys: shortcuts.newProject,
              onSelect: () => setProjectComposer({}),
            },
            {
              label: t("Refresh"),
              keys: shortcuts.reload,
              onSelect: () => void refresh(),
            },
            {
              label: t("Keyboard shortcuts"),
              keys: shortcuts.help,
              onSelect: () => setShortcutsOpen(true),
            },
            {
              label: t("Preferences"),
              keys: shortcuts.preferences,
              onSelect: () => navigate({ kind: "preferences" }),
            },
          ]}
          onToggleSidebar={toggleNav}
          onSidebarHover={sidebarFixed ? () => {} : showPeek}
          onSidebarLeave={hidePeek}
          onBack={back}
          onForward={nav.forward}
          onSearch={() => setSearch(true)}
          onNewTask={() => newTask()}
        />
        <div className={`window-body ${navHidden ? "sidebar-hidden" : ""}`}>
          <SidebarSlot
            hidden={navHidden}
            peek={peek}
            onShow={showPeek}
            onHide={hidePeek}
            onClose={closePeek}
            onEnd={endPeek}
          >
            {destination.kind === "preferences" ? (
              <PreferencesNav
                section={destination.section ?? "general"}
                updateAvailable={Boolean(updater.availableUpdate)}
                // Sections replace each other in place, so the topbar's Back leaves Preferences.
                onSection={(section) =>
                  setPlace({
                    ...place,
                    destination: { kind: "preferences", section },
                  })
                }
              />
            ) : (
              <Sidebar
                projects={data.projects}
                openCounts={openCounts}
                workingCount={data.tasks.filter(isAgentWorking).length}
                updateAvailable={updater.updateNoticeDismissed}
                destination={destination}
                onNavigate={navigate}
                onAddProject={() => setProjectComposer({})}
                onEditProject={(project) => setProjectComposer({ project })}
                onDeleteProject={setProjectDelete}
                onMoveProject={setProjectMove}
                projectExtra={
                  project && (
                    <SidebarGoals
                      key={project.id}
                      goals={projectGoals}
                      tasks={data.tasks}
                      activeId={activeGoal?.id ?? null}
                      onSelect={(goalId) => {
                        if (mode !== "board") setProjectMode("board");
                        changeFilter({ goal: goalId ?? "*" });
                      }}
                      onNew={() => setGoalComposer({ projectId: project.id })}
                      onEdit={(goal) =>
                        setGoalComposer({ projectId: project.id, goal })
                      }
                      onComplete={setGoalComplete}
                      onReopen={reopenGoal}
                      onDelete={setGoalDelete}
                      onShowConcluded={() => setConcludedOpen(true)}
                    />
                  )
                }
                workspace={
                  workspaces.list && (
                    <WorkspaceButton
                      list={workspaces.list}
                      rail={Boolean(panel)}
                      onSwitch={workspaces.switchTo}
                      onEdit={(workspace) =>
                        workspaces.setComposer({ workspace })
                      }
                      onCreate={() => workspaces.setComposer({})}
                      onOpen={workspaces.open}
                      onManage={() => navigate({ kind: "preferences" })}
                    />
                  )
                }
                onShortcuts={() => setShortcutsOpen(true)}
                rail={Boolean(panel)}
                onPeek={rail && notesTreeHidden ? showPeekSoon : undefined}
                onPeekLeave={rail && notesTreeHidden ? hidePeek : undefined}
              />
            )}
          </SidebarSlot>
          <main className="island">
            <UpdateNotices
              availableVersion={
                updater.updateNoticeDismissed
                  ? null
                  : (updater.availableUpdate?.version ?? null)
              }
              installing={updater.installing}
              restartNotice={
                updater.restartNotice || Boolean(workspaces.list?.organized)
              }
              onDismissRestart={() => {
                updater.dismissRestartNotice();
                // Moving the workspaces into folders also asks agents to reconnect, once.
                if (workspaces.list?.organized)
                  void dismissOrganized().then(workspaces.setList, () => {});
              }}
              onDismissUpdate={updater.dismissUpdate}
              onInstall={() =>
                void updater
                  .install()
                  .catch((e) => notify(errorMessage(e), true))
              }
              onReleaseNotes={() =>
                void openUrl(
                  "https://github.com/builtbyajax/Trama/releases/latest",
                ).catch((e) => notify(errorMessage(e), true))
              }
            />
            {error && (
              <div className="error-banner" role="alert">
                {error}
                <button className="button small" onClick={() => void refresh()}>
                  {t("Refresh")}
                </button>
              </div>
            )}
            {project && !reading && (
              <ProjectHeader
                project={project}
                color={projectColor(project)}
                tasks={projectTasks}
                goals={projectGoals}
                goal={
                  mode === "board" && activeGoal
                    ? {
                        id: activeGoal.id,
                        name: activeGoal.name,
                        description: activeGoal.description,
                        onEdit: () =>
                          setGoalComposer({
                            projectId: project.id,
                            goal: activeGoal,
                          }),
                        onDelete: () => setGoalDelete(activeGoal),
                        onClear: () => changeFilter({ goal: "*" }),
                        summary: (
                          <GoalSummary goal={activeGoal} tasks={data.tasks} />
                        ),
                        actions: (
                          <GoalActions
                            goal={activeGoal}
                            tasks={data.tasks}
                            onComplete={() => setGoalComplete(activeGoal)}
                            onReopen={() => reopenGoal(activeGoal)}
                          />
                        ),
                      }
                    : undefined
                }
                mode={mode}
                filter={filter}
                onMode={setProjectMode}
                onFilter={changeFilter}
                onShowConcluded={() => setConcludedOpen(true)}
                onNewGoal={() => setGoalComposer({ projectId: project.id })}
                onManageCategories={() => setCategoriesOpen(true)}
                onReveal={(path) =>
                  void revealPath(path).catch((e) =>
                    notify(errorMessage(e), true),
                  )
                }
              />
            )}
            <div className="content">
              {project && mode === "notes" ? (
                project.documentsFolder ? (
                  <NotesView
                    key={`${project.id}:${project.documentsFolder}`}
                    projectId={project.id}
                    root={project.documentsFolder}
                    documents={data.documents.filter((d) =>
                      data.tasks.some(
                        (t) => t.id === d.taskId && t.projectId === project.id,
                      ),
                    )}
                    tasks={data.tasks}
                    revision={revision}
                    openRequest={noteRequest}
                    treeHidden={notesTreeHidden}
                    onTreeHidden={hideNotesTree}
                    treePeek={peek}
                    onTreeHover={showPeek}
                    onTreeLeave={hidePeek}
                    onTreePeekEnd={endPeek}
                    onOpenTask={openTask}
                    onChanged={() => void refresh()}
                    notify={notify}
                  />
                ) : (
                  <ProjectNotesSetup
                    project={project}
                    onSaved={() => void refresh()}
                  />
                )
              ) : project ? (
                mode === "project" ? (
                  <ProjectPage
                    key={project.id}
                    tasks={boardTasks}
                    goals={projectGoals}
                    onOpenTask={openTask}
                    onOpenGoal={(goalId) => {
                      setProjectMode("board");
                      changeFilter({ goal: goalId });
                    }}
                    onShowConcluded={() => setConcludedOpen(true)}
                  />
                ) : mode === "git" ? (
                  <GitProject
                    key={project.id}
                    project={project}
                    tasks={data.tasks}
                    revision={revision}
                    focus={gitFocus}
                    listHidden={historyHidden}
                    diffOpen={diffTitle !== null}
                    diffFilesHidden={diffFilesHidden}
                    onDiff={setDiffTitle}
                    notify={notify}
                    onEditProject={() => setProjectComposer({ project })}
                    onOpenTask={openTask}
                    onRefresh={() => void refresh()}
                  />
                ) : boardView === "list" ? (
                  <BoardList
                    tasks={visibleTasks}
                    goals={projectGoals}
                    landedId={landedId}
                    onMove={(id, status, afterId) =>
                      void move(id, status, afterId)
                    }
                    selectedId={selectedTask?.id}
                    menuId={taskMenu?.task.id}
                    onMenu={setTaskMenu}
                    onOpen={openTask}
                  />
                ) : (
                  <Board
                    tasks={visibleTasks}
                    branches={branches}
                    goals={activeGoal ? [] : projectGoals}
                    landedId={landedId}
                    selectedId={selectedTask?.id}
                    menuId={taskMenu?.task.id}
                    onMenu={setTaskMenu}
                    onMove={(id, status, afterId) =>
                      void move(id, status, afterId)
                    }
                    onOpen={openTask}
                  />
                )
              ) : destination.kind === "archive" ? (
                <ArchivePage
                  tasks={data.tasks}
                  goals={data.goals}
                  projects={data.projects}
                  view={archiveView}
                  onView={(patch) =>
                    setArchiveView((v) => ({ ...v, ...patch }))
                  }
                  selectedId={selectedTask?.id}
                  menuId={taskMenu?.task.id}
                  onMenu={setTaskMenu}
                  onOpen={openTask}
                />
              ) : destination.kind === "agents" ? (
                <AgentsPage
                  profiles={data.agentProfiles}
                  tasks={data.tasks}
                  projects={data.projects}
                  highlight={destination.id}
                  onOpen={openTask}
                  onChanged={() => void refresh()}
                  onSetup={() =>
                    navigate({ kind: "preferences", section: "agent" })
                  }
                  onPick={(id) =>
                    setPlace({ destination: { kind: "agents", id }, mode })
                  }
                  notify={notify}
                />
              ) : destination.kind === "notes" ? (
                <Vaults
                  projects={data.projects}
                  tasks={data.tasks}
                  documents={data.documents}
                  revision={revision}
                  onOpen={openNote}
                />
              ) : destination.kind === "preferences" ? (
                <Preferences
                  section={destination.section ?? "general"}
                  data={data}
                  workspaces={workspaces.list}
                  onEditWorkspace={(workspace) =>
                    workspaces.setComposer({ workspace })
                  }
                  onLeaveWorkspace={(workspace, mode) =>
                    setWorkspaceLeave({ workspace, mode })
                  }
                  notify={notify}
                  boardView={boardView}
                  onBoardView={setBoardView}
                  onEdit={(project) => setProjectComposer({ project })}
                  onAddProject={() => setProjectComposer({})}
                  updater={updater}
                />
              ) : data.projects.length === 0 ? (
                <div className="empty-state">
                  <BrandMark size={44} />
                  <strong>{t("No projects yet")}</strong>
                  <p>
                    {t(
                      "Each project has its own task queue and, if you want, a Git repository to look into.",
                    )}
                  </p>
                  <button
                    className="button primary"
                    onClick={() => setProjectComposer({})}
                  >
                    {t("Add project")}
                  </button>
                </div>
              ) : (
                <Overview
                  projects={data.projects}
                  tasks={data.tasks}
                  onOpenProject={(id) => navigate({ kind: "project", id })}
                  onOpenTask={openTask}
                />
              )}
            </div>
            {selectedTask && (
              <TaskSheet
                key={selectedTask.id}
                task={selectedTask}
                project={data.projects.find(
                  (p) => p.id === selectedTask.projectId,
                )}
                categories={categoryNames(
                  data.categories,
                  selectedTask.projectId,
                )}
                branches={sheetBranches}
                goals={data.goals.filter(
                  (g) => g.projectId === selectedTask.projectId,
                )}
                onOpenNote={(path) => {
                  if (closeDetails()) openNote(selectedTask.projectId, path);
                }}
                mode={sheetMode}
                backLabel={
                  !project && destination.kind === "archive"
                    ? t("Archive")
                    : t("Board")
                }
                position={
                  selectedIndex >= 0
                    ? { index: selectedIndex, total: sequence.length }
                    : undefined
                }
                closeGuard={closeGuard}
                onPrevious={step(-1)}
                onNext={step(1)}
                onMode={setSheetMode}
                onClose={closeDetails}
                onChanged={() => void refresh()}
                onDeleted={(task) => {
                  closeGuard.current = null;
                  setSelected(null);
                  setSheetMode("sheet");
                  notify(t("“{0}” was deleted.", [task.title]));
                }}
                onGit={(focus) => {
                  if (!closeDetails()) return;
                  go({
                    destination: {
                      kind: "project",
                      id: selectedTask.projectId,
                    },
                    mode: "git",
                  });
                  setGitFocus(focus);
                }}
              />
            )}
          </main>
        </div>
        <Tooltips />
        <div className="hint-pill" aria-hidden="true">
          <kbd>{isMac ? "⌘" : "Ctrl"}</kbd>
          {t("Release to hide.")} {shortcutLabel(shortcuts.help)}{" "}
          {t("shows all shortcuts.")}
        </div>
        {toast && (
          <div
            key={toast.id}
            className={[
              "toast",
              toast.error && "error",
              toast.leaving && "leaving",
            ]
              .filter(Boolean)
              .join(" ")}
            role={toast.error ? "alert" : "status"}
            onMouseEnter={hold}
            onMouseLeave={release}
            onFocus={hold}
            onBlur={release}
          >
            {toast.error && <Icon name="warning" size={14} />}
            {toast.text}
            {toast.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  dismiss();
                  toast.action!.run();
                }}
              >
                {toast.action.label}
              </button>
            )}
            {toast.action && (
              // Fills up while the action can still be used.
              <span
                className="toast-time"
                style={
                  { "--toast-time": `${toast.duration}ms` } as CSSProperties
                }
                aria-hidden="true"
              />
            )}
          </div>
        )}
        {composer && (
          <TaskComposer
            {...composer}
            branch={
              project?.id === composer.projectId && filter.branch !== "*"
                ? filter.branch || null
                : null
            }
            goalId={
              project?.id === composer.projectId && activeGoal
                ? activeGoal.id
                : null
            }
            projects={snapshot!.projects}
            categories={snapshot!.categories}
            goals={snapshot!.goals.filter((g) => g.completedAt === null)}
            onClose={() => setComposer(null)}
            onSaved={(task) => {
              setComposer(null);
              go({
                destination: { kind: "project", id: task.projectId },
                mode: "board",
              });
              setLandedId(task.id);
              void refresh();
            }}
          />
        )}
        {projectComposer && (
          <ProjectComposer
            {...projectComposer}
            defaultColor={nextColor}
            onClose={() => setProjectComposer(null)}
            onDelete={(p) => {
              setProjectComposer(null);
              setProjectDelete(p);
            }}
            onSaved={(p) => {
              setProjectComposer(null);
              if (!projectComposer.project)
                go({
                  destination: { kind: "project", id: p.id },
                  mode: "board",
                });
              void refresh();
            }}
          />
        )}
        {taskMenu && (
          <ContextMenu
            x={taskMenu.x}
            y={taskMenu.y}
            label={taskMenuLabel(taskMenu.task)}
            items={menuItems(
              data.tasks.find((t) => t.id === taskMenu.task.id) ??
                taskMenu.task,
            )}
            onClose={(restoreFocus) => {
              if (restoreFocus) taskMenu.trigger.focus();
              setTaskMenu(null);
            }}
          />
        )}
        {taskDelete && (
          <TaskDelete
            task={taskDelete}
            projectName={
              data.projects.find((p) => p.id === taskDelete.projectId)?.name
            }
            onBefore={() => {
              // The open sheet would try to save the task it no longer has.
              if (selectedTask?.id === taskDelete.id) {
                closeGuard.current = null;
                setSelected(null);
                setSheetMode("sheet");
              }
            }}
            onClose={() => setTaskDelete(null)}
            onDeleted={(deleted) => {
              setTaskDelete(null);
              notify(t("“{0}” was deleted.", [deleted.title]));
              void refresh();
            }}
          />
        )}
        {taskStatusMenu && (
          <ContextMenu
            x={taskStatusMenu.x}
            y={taskStatusMenu.y}
            // From the Archive a task only goes back to a stage of the board.
            label={
              taskStatusMenu.task.status === "done"
                ? t("Reopen in stage")
                : t("Move to stage")
            }
            heading={
              taskStatusMenu.task.status === "done"
                ? t("Reopen in stage")
                : t("Move to stage")
            }
            items={(taskStatusMenu.task.status === "done"
              ? boardStatuses
              : [...boardStatuses, "done" as const]
            ).map((status) => {
              const task =
                data.tasks.find((t) => t.id === taskStatusMenu.task.id) ??
                taskStatusMenu.task;
              return {
                label: statusTitle[status],
                leading:
                  status === "done" ? undefined : (
                    <StatusIcon status={status} />
                  ),
                icon: status === "done" ? ("check" as const) : undefined,
                checked: task.status === status,
                separated: status === "done",
                onSelect: () =>
                  task.status !== status && void move(task.id, status, null),
              };
            })}
            onClose={(restoreFocus) => {
              if (restoreFocus) taskStatusMenu.trigger.focus();
              setTaskStatusMenu(null);
            }}
          />
        )}
        {taskGoalMenu && (
          <ContextMenu
            x={taskGoalMenu.x}
            y={taskGoalMenu.y}
            label={t("Move to goal")}
            heading={t("Move to goal")}
            items={goalMenuItems(
              data.tasks.find((t) => t.id === taskGoalMenu.task.id) ??
                taskGoalMenu.task,
            )}
            onClose={(restoreFocus) => {
              if (restoreFocus) taskGoalMenu.trigger.focus();
              setTaskGoalMenu(null);
            }}
          />
        )}
        {goalComposer && (
          <GoalComposer
            {...goalComposer}
            onClose={() => setGoalComposer(null)}
            onSaved={(goal) => {
              const created = !goalComposer.goal;
              setGoalComposer(null);
              notify(
                created
                  ? t("Goal “{0}” created.", [goal.name])
                  : t("Goal saved."),
              );
              void refresh();
            }}
          />
        )}
        {goalComplete && (
          <GoalComplete
            goal={goalComplete}
            onClose={() => setGoalComplete(null)}
            onDone={(goal) => {
              setGoalComplete(null);
              // It leaves the list, so the board shows every task again.
              if (filter.goal === goal.id) changeFilter({ goal: "*" });
              notify(t("Goal “{0}” concluded.", [goal.name]));
              void refresh();
            }}
          />
        )}
        {concludedOpen && project && (
          <ConcludedGoals
            goals={projectGoals}
            tasks={data.tasks}
            onOpen={(goal) => {
              setConcludedOpen(false);
              if (mode !== "board") setProjectMode("board");
              changeFilter({ goal: goal.id });
            }}
            onReopen={reopenGoal}
            onDelete={setGoalDelete}
            onClose={() => setConcludedOpen(false)}
          />
        )}
        {goalDelete && (
          <GoalDelete
            goal={goalDelete}
            taskCount={
              data.tasks.filter((t) => t.goalId === goalDelete.id).length
            }
            onClose={() => setGoalDelete(null)}
            onDeleted={(goal) => {
              setGoalDelete(null);
              notify(t("Goal “{0}” deleted.", [goal.name]));
              void refresh();
            }}
          />
        )}
        {projectDelete && (
          <ProjectDelete
            project={projectDelete}
            taskCount={
              data.tasks.filter((t) => t.projectId === projectDelete.id).length
            }
            onClose={() => setProjectDelete(null)}
            onDeleted={(deleted) => {
              setProjectDelete(null);
              if (selectedTask?.projectId === deleted.id) setSelected(null);
              forget(deleted.id);
              notify(t("Project “{0}” deleted.", [deleted.name]));
              void refresh();
            }}
          />
        )}
        {projectMove && (
          <ProjectMove
            project={projectMove}
            taskCount={
              data.tasks.filter((t) => t.projectId === projectMove.id).length
            }
            targets={otherWorkspaces(workspaces.list)}
            onClose={() => setProjectMove(null)}
            onMoved={(moved, target) => {
              setProjectMove(null);
              if (selectedTask?.projectId === moved.id) setSelected(null);
              forget(moved.id);
              notify(
                t("“{0}” moved to {1}.", [moved.name, workspaceName(target)]),
              );
              void refresh();
            }}
          />
        )}
        {workspaceLeave && workspaces.list && (
          <WorkspaceLeave
            {...workspaceLeave}
            fallback={leaveFallback}
            last={
              workspaceLeave.workspace.path === workspaces.list.active &&
              !leaveFallback
            }
            onClose={() => setWorkspaceLeave(null)}
            onDone={(list) => {
              // Leaving the open one switched workspaces, or left none, so the window reloads.
              if (workspaceLeave.workspace.path === workspaces.list?.active)
                return workspaces.enter(list);
              workspaces.setList(list);
              setWorkspaceLeave(null);
              const name = workspaceName(workspaceLeave.workspace);
              notify(
                workspaceLeave.mode === "remove"
                  ? t("“{0}” left the list. The file wasn't touched.", [name])
                  : t("Workspace “{0}” deleted.", [name]),
              );
            }}
          />
        )}
        {workspaces.naming && (
          <WorkspaceNaming
            onClose={() => workspaces.setNaming(null)}
            onSubmit={async (name) =>
              workspaces.enter(
                await openWorkspace(workspaces.naming ?? "", name),
              )
            }
          />
        )}
        {workspaces.composer && workspaces.list && (
          <WorkspaceComposer
            workspace={edited}
            workspaces={workspaces.list.workspaces}
            onClose={() => workspaces.setComposer(null)}
            onSubmit={async (name, color, icon) => {
              const editing = workspaces.composer?.workspace;
              if (editing) {
                workspaces.setList(
                  await editWorkspace(editing.path, name, color, icon),
                );
                workspaces.setComposer(null);
              } else workspaces.enter(await createWorkspace(name, color, icon));
            }}
          />
        )}
        {categoriesOpen && project && (
          <CategoryManager
            project={project}
            categories={data.categories}
            onClose={() => setCategoriesOpen(false)}
            onChanged={(message) => {
              notify(message);
              void refresh();
            }}
          />
        )}
        {shortcutsOpen && (
          <ShortcutsSheet onClose={() => setShortcutsOpen(false)} />
        )}
        {switcher && (
          <ProjectSwitcher
            projects={data.projects}
            openCounts={openCounts}
            currentId={project?.id}
            onClose={() => setSwitcher(false)}
            onOpen={(target) => {
              setSwitcher(false);
              navigate({ kind: "project", id: target.id });
            }}
          />
        )}
        {search && (
          <SearchPanel
            onClose={() => setSearch(false)}
            onOpen={(result) => {
              const task = snapshot?.tasks.find((t) => t.id === result.taskId);
              setSearch(false);
              if (task && closeDetails()) openTask(task);
            }}
          />
        )}
      </div>
    </AgentProfilesContext.Provider>
  );
}
