import type {
  Category,
  Snapshot,
  Task,
  TaskInput,
  Project,
  TaskDetails,
  TaskEvent,
  TaskNote,
  SearchResult,
  GitSnapshot,
  CommitDetails,
  FileDiff,
  PullRequests,
  DocumentFile,
  DocumentHit,
  DocumentListing,
  TaskDocument,
  Workspaces,
  Goal,
} from "./types";
import { known, t } from "./i18n";
import { isMac, isWindows } from "./shortcuts";
export const inTauri = () => "__TAURI_INTERNALS__" in window;
export async function call<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (inTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>("call", { command, args });
  }
  const response = await fetch("/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, args }),
  });
  const body = await response.json();
  if (!response.ok || body.error)
    throw new Error(body.error ?? t("The local core didn't respond."));
  return body.result;
}
export const loadSnapshot = () => call<Snapshot>("load_snapshot");
export const saveProject = (
  name: string,
  repositoryPath: string | null,
  color: number,
  projectId: string | null = null,
  documentsFolder: string | null = null,
  /** Left out, the project keeps its icon; `null` brings back its initial. */
  icon?: string | null,
) =>
  call<Project>("save_project", {
    projectId,
    name,
    repositoryPath,
    color,
    documentsFolder,
    icon,
  });
/** Deletes the project with all its tasks, categories and activity. */
export const deleteProject = (projectId: string) =>
  call<null>("delete_project", { projectId });
export const saveTask = (input: TaskInput, taskId: string | null = null) =>
  call<Task>("save_task", { taskId, input });
/** A person's edit: only the fields present change, so concurrent agent updates survive. */
export const editTask = (
  input: Partial<TaskInput> & Pick<TaskInput, "projectId">,
  taskId: string,
) => call<Task>("edit_task", { taskId, input });
/** Moves a task into `status`, right after `afterId` (or to the top of the column). */
export const moveTask = (
  task: Task,
  status: Task["status"],
  afterId: string | null,
) =>
  call<Task>("move_task", {
    taskId: task.id,
    projectId: task.projectId,
    status,
    afterId,
  });
/** Creates a goal, or edits one when `goalId` is given. */
export const saveGoal = (
  projectId: string,
  name: string,
  description: string,
  targetDate: string | null,
  goalId: string | null = null,
) =>
  call<Goal>("save_goal", {
    goalId,
    projectId,
    name,
    description,
    targetDate,
  });
export const completeGoal = (goal: Goal, completed: boolean) =>
  call<Goal>("complete_goal", {
    goalId: goal.id,
    projectId: goal.projectId,
    completed,
  });
/** Deletes the goal; its tasks stay, without one. */
export const deleteGoal = (goal: Goal) =>
  call<null>("delete_goal", { goalId: goal.id, projectId: goal.projectId });
export const createCategory = (projectId: string, name: string) =>
  call<Category>("create_category", { projectId, name });
export const deleteCategory = (
  projectId: string,
  name: string,
  replacement: string | null,
) =>
  call<{ moved: number }>("delete_category", {
    projectId,
    name,
    replacement,
  });
export const deleteTask = (task: Task) =>
  call<void>("delete_task", { taskId: task.id, projectId: task.projectId });
export const taskDetails = (task: Task) =>
  call<TaskDetails>("task_details", {
    taskId: task.id,
    projectId: task.projectId,
  });
export const handoffEvents = (since: number) =>
  call<TaskEvent[]>("handoff_events", { since });
export const addNote = (task: Task, body: string) =>
  call<TaskNote>("add_note", {
    taskId: task.id,
    projectId: task.projectId,
    body,
  });
export const deleteNote = (task: Task, noteId: string) =>
  call<void>("delete_note", {
    noteId,
    taskId: task.id,
    projectId: task.projectId,
  });
export const searchTasks = (query: string) =>
  call<SearchResult[]>("search_tasks", { query });
/** Local branches of the project's repository, most recently committed first. */
export const listBranches = (projectId: string) =>
  call<string[]>("list_branches", { projectId });
export const gitSnapshot = (projectId: string) =>
  call<GitSnapshot>("git_snapshot", { projectId });
export const gitCommitDetails = (projectId: string, commitId: string) =>
  call<CommitDetails>("git_commit_details", { projectId, commitId });
export const gitWorkingDiff = (projectId: string) =>
  call<FileDiff[]>("git_working_diff", { projectId });
/** What the commits after `base` up to `head` changed together. */
export const gitRangeDiff = (projectId: string, base: string, head: string) =>
  call<FileDiff[]>("git_range_diff", { projectId, base, head });
export const listPullRequests = (projectId: string) =>
  call<PullRequests>("list_pull_requests", { projectId });
export const validateRepository = (path: string) =>
  call<void>("validate_repository", { path });
/** A folder from the system's picker (Finder on macOS); null when cancelled. */
export async function chooseDirectory(
  title = t("Use repository"),
  defaultPath?: string,
): Promise<string | null> {
  if (!inTauri())
    return call<string | null>("choose_directory", { title, defaultPath });
  const { open } = await import("@tauri-apps/plugin-dialog");
  return open({ directory: true, multiple: false, title, defaultPath });
}
/** A Trama database file from the system's picker; null when cancelled. */
export async function chooseDatabase(
  title = t("Open workspace"),
): Promise<string | null> {
  if (!inTauri()) return call<string | null>("choose_file", { title });
  const { open } = await import("@tauri-apps/plugin-dialog");
  return open({
    multiple: false,
    directory: false,
    title,
    filters: [{ name: "Trama", extensions: ["sqlite", "db"] }],
  });
}
export const listWorkspaces = () => call<Workspaces>("list_workspaces");
/** Creates `<folder>/<name>.sqlite` and opens it. */
export const createWorkspace = (
  name: string,
  folder: string,
  color: number | null,
  icon: string | null,
) => call<Workspaces>("create_workspace", { name, folder, color, icon });
/** Opens an existing database file, adding it to the list. */
export const openWorkspace = (path: string) =>
  call<Workspaces>("open_workspace", { path });
export const switchWorkspace = (path: string) =>
  call<Workspaces>("switch_workspace", { path });
/** Renames it and saves its color and icon inside its file. */
export const editWorkspace = (
  path: string,
  name: string,
  color: number | null,
  icon: string | null,
) => call<Workspaces>("edit_workspace", { path, name, color, icon });
/** Takes it off the list; the file stays. */
export const removeWorkspace = (path: string) =>
  call<Workspaces>("remove_workspace", { path });
/** Takes it off the list and deletes its file, with every project and task in it. */
export const deleteWorkspace = (path: string) =>
  call<Workspaces>("delete_workspace", { path });
/** Moves a project, with everything in it, to the workspace at `path`. */
export const moveProject = (projectId: string, path: string) =>
  call<null>("move_project", { projectId, path });
/** Notes and images of the project's notes folder. */
export const listDocuments = (projectId: string) =>
  call<DocumentListing>("list_documents", { projectId });
/** Notes whose text contains `query`, ignoring case and accents. */
export const searchDocuments = (projectId: string, query: string) =>
  call<DocumentHit[]>("search_documents", { projectId, query });
export const readDocument = (projectId: string, path: string) =>
  call<DocumentFile>("read_document", { projectId, path });
/** Saves a note; refused when the file changed since `version` was read. */
export const writeDocument = (
  projectId: string,
  path: string,
  text: string,
  version: string,
) => call<DocumentFile>("write_document", { projectId, path, text, version });
/** Creates an empty note (`.md` added when missing); refused when the name is taken. */
export const createDocument = (projectId: string, path: string) =>
  call<DocumentFile>("create_document", { projectId, path });
/** Creates an empty folder in the notes folder and returns its path. */
export const createDocumentFolder = (projectId: string, path: string) =>
  call<string>("create_document_folder", { projectId, path });
/** Renames a note or folder in place and returns its new path; attachments follow it. */
export const renameDocument = (projectId: string, path: string, name: string) =>
  call<string>("rename_document", { projectId, path, name });
/** Moves a note or folder, with what is inside it, to the system's trash. */
export const trashDocument = (projectId: string, path: string) =>
  call<void>("trash_document", { projectId, path });
/** An image of the notes folder as a data: URL. */
export const documentImage = (projectId: string, path: string) =>
  call<string>("document_image", { projectId, path });
export const attachDocument = (task: Task, path: string) =>
  call<TaskDocument>("attach_document", {
    taskId: task.id,
    projectId: task.projectId,
    path,
  });
export const detachDocument = (task: Task, path: string) =>
  call<null>("detach_document", {
    taskId: task.id,
    projectId: task.projectId,
    path,
  });
export async function openUrl(url: string) {
  if (!url.startsWith("https://")) throw new Error(t("Invalid URL."));
  if (inTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else window.open(url, "_blank", "noopener,noreferrer");
}

export async function copyText(text: string): Promise<void> {
  if (inTauri()) {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(text);
  } else {
    if (!navigator.clipboard)
      throw new Error(t("Copying isn't available in this browser."));
    await navigator.clipboard.writeText(text);
  }
}

/** The system's file browser by name: Finder on macOS, Explorer elsewhere. */
export const revealLabel = () =>
  isMac ? t("Show in Finder") : t("Show in Explorer");

/** A folder path as the system writes them, for placeholders. */
export const folderExample = () =>
  isWindows ? t("C:\\Users\\you\\Projects\\Vault") : t("~/Projects/Vault");

export async function revealPath(path: string): Promise<void> {
  if (!inTauri())
    throw new Error(t("The file browser is available in the app."));
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

/** Readable message for errors from the Tauri IPC (strings) and the dev bridge (Error). */
export const errorMessage = (error: unknown) =>
  known(error instanceof Error ? error.message : String(error));
