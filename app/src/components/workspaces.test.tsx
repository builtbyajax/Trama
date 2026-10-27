// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAppUpdater } from "../hooks/useAppUpdater";
import type { Snapshot, Workspace, Workspaces } from "../lib/types";
import { Root } from "../Root";
import { Preferences } from "./Preferences";
import {
  FirstWorkspace,
  needsName,
  WorkspaceComposer,
  WorkspaceLeave,
} from "./Workspaces";

const api = vi.hoisted(() => ({
  listWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  openWorkspace: vi.fn(),
  chooseDatabase: vi.fn(),
  deleteWorkspace: vi.fn(),
  removeWorkspace: vi.fn(),
}));
vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  ...api,
}));
vi.mock("../App", () => ({ App: () => <p>Board</p> }));
vi.mock("../lib/updater", () => ({
  checkAppUpdate: vi.fn().mockResolvedValue(null),
  installAppUpdate: vi.fn(),
  installedAppVersion: vi.fn().mockResolvedValue("0.3.1"),
  isDesktopApp: vi.fn().mockReturnValue(false),
  restartUpdatedApp: vi.fn(),
}));
vi.mock("../hooks/useScrollbarRoom", () => ({ useScrollbarRoom: vi.fn() }));

const space = (name: string, path: string, missing = false): Workspace => ({
  name,
  path,
  missing,
  color: null,
  icon: null,
});
const list = (
  active: string,
  workspaces: Workspace[],
  pinned = false,
): Workspaces => ({ active, pinned, organized: false, workspaces });
const alpha = space("Alpha", "/synthetic/Workspaces/aaaaaaaa/workspace.sqlite");
const beta = space("Beta", "/synthetic/Workspaces/bbbbbbbb/workspace.sqlite");

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("opens the first screen only while no workspace can be opened", async () => {
  api.listWorkspaces.mockResolvedValueOnce(list("", []));
  render(<Root />);
  expect(
    await screen.findByRole("heading", { name: "Create your first workspace" }),
  ).toBeInTheDocument();
  cleanup();
  // Workspaces whose files are gone leave nothing to open either.
  api.listWorkspaces.mockResolvedValueOnce(
    list("", [space("Gone", "/synthetic/gone.sqlite", true)]),
  );
  render(<Root />);
  expect(
    await screen.findByRole("heading", { name: "Create your first workspace" }),
  ).toBeInTheDocument();
  cleanup();
  api.listWorkspaces.mockResolvedValueOnce(list(alpha.path, [alpha]));
  render(<Root />);
  expect(await screen.findByText("Board")).toBeInTheDocument();
  cleanup();
  // TRAMA_DB chooses the database, so there is never a first screen.
  api.listWorkspaces.mockResolvedValueOnce(
    list("/synthetic/pinned.sqlite", [], true),
  );
  render(<Root />);
  expect(await screen.findByText("Board")).toBeInTheDocument();
});

it("enters the board after creating the first workspace", async () => {
  const user = userEvent.setup();
  api.listWorkspaces.mockResolvedValueOnce(list("", []));
  api.createWorkspace.mockResolvedValueOnce(list(alpha.path, [alpha]));
  render(<Root />);
  await user.type(
    await screen.findByLabelText("Workspace name"),
    "Alpha{Enter}",
  );
  expect(await screen.findByText("Board")).toBeInTheDocument();
});

it("asks for the first workspace with nothing filled in and creates it as chosen", async () => {
  const user = userEvent.setup();
  const enter = vi.fn();
  const created = list(alpha.path, [alpha]);
  api.createWorkspace.mockResolvedValueOnce(created);
  render(<FirstWorkspace onEnter={enter} />);
  const name = screen.getByLabelText("Workspace name");
  expect(name).toHaveValue("");
  for (const radio of screen.getAllByRole("radio")) {
    // The icon picker's first option is the name's initial, which stands for no icon.
    if (radio.closest(".color-picker")) expect(radio).not.toBeChecked();
  }
  await user.click(screen.getByRole("button", { name: "Create workspace" }));
  expect(api.createWorkspace).not.toHaveBeenCalled();
  await user.type(name, "  Work  ");
  await user.click(screen.getAllByRole("radio")[2]);
  await user.click(screen.getByRole("button", { name: "Create workspace" }));
  await waitFor(() => expect(enter).toHaveBeenCalledWith(created));
  expect(api.createWorkspace).toHaveBeenCalledExactlyOnceWith(
    "  Work  ",
    2,
    null,
  );
});

it("opens an existing database from the first screen and stays when the picker is cancelled", async () => {
  const user = userEvent.setup();
  const enter = vi.fn();
  const opened = list("/synthetic/elsewhere.sqlite", []);
  render(<FirstWorkspace onEnter={enter} />);
  const open = screen.getByRole("button", { name: "Open existing workspace…" });
  api.chooseDatabase.mockResolvedValueOnce(null);
  await user.click(open);
  expect(api.openWorkspace).not.toHaveBeenCalled();
  expect(enter).not.toHaveBeenCalled();
  api.chooseDatabase.mockResolvedValueOnce("/synthetic/elsewhere.sqlite");
  api.openWorkspace.mockRejectedValueOnce(new Error("Newer version"));
  await user.click(open);
  expect(await screen.findByRole("alert")).toHaveTextContent("Newer version");
  expect(enter).not.toHaveBeenCalled();
  api.chooseDatabase.mockResolvedValueOnce("/synthetic/elsewhere.sqlite");
  api.openWorkspace.mockResolvedValueOnce(opened);
  await user.click(open);
  await waitFor(() => expect(enter).toHaveBeenCalledWith(opened));
  expect(api.openWorkspace).toHaveBeenLastCalledWith(
    "/synthetic/elsewhere.sqlite",
  );
});

it("asks for the name of a workspace file it reopens, and keeps it closed when cancelled", async () => {
  const user = userEvent.setup();
  const enter = vi.fn();
  const opened = list(alpha.path, [alpha]);
  render(<FirstWorkspace onEnter={enter} />);
  const open = screen.getByRole("button", { name: "Open existing workspace…" });
  api.chooseDatabase.mockResolvedValueOnce(alpha.path);
  await user.click(open);
  expect(
    await screen.findByRole("dialog", { name: "Name the workspace" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(api.openWorkspace).not.toHaveBeenCalled();
  api.chooseDatabase.mockResolvedValueOnce(alpha.path);
  api.openWorkspace.mockResolvedValueOnce(opened);
  await user.click(open);
  const dialog = await screen.findByRole("dialog", {
    name: "Name the workspace",
  });
  const name = within(dialog).getByLabelText("Workspace name");
  expect(name).toHaveValue("");
  await user.type(name, "Again{Enter}");
  await waitFor(() => expect(enter).toHaveBeenCalledWith(opened));
  expect(api.openWorkspace).toHaveBeenCalledExactlyOnceWith(
    alpha.path,
    "Again",
  );
});

it("asks for a name only for a workspace file the list doesn't have", () => {
  expect(needsName(alpha.path, null)).toBe(true);
  expect(needsName("C:\\Trama\\Workspaces\\a\\workspace.sqlite", null)).toBe(
    true,
  );
  expect(needsName(alpha.path, list(alpha.path, [alpha]))).toBe(false);
  expect(needsName("/synthetic/team.sqlite", null)).toBe(false);
  expect(needsName("/synthetic/my-workspace.sqlite", null)).toBe(false);
});

it("creates a workspace without asking for a folder", async () => {
  const user = userEvent.setup();
  const submit = vi.fn().mockResolvedValue(undefined);
  render(
    <WorkspaceComposer workspaces={[]} onClose={vi.fn()} onSubmit={submit} />,
  );
  expect(screen.queryByLabelText("Folder")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Choose workspace folder" }),
  ).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Workspace name"), "Beta{Enter}");
  await waitFor(() =>
    expect(submit).toHaveBeenCalledExactlyOnceWith("Beta", 0, null),
  );
});

it("tells which workspace opens next, or that the first screen follows the last one", () => {
  render(
    <WorkspaceLeave
      workspace={beta}
      fallback={alpha}
      mode="remove"
      onClose={vi.fn()}
      onDone={vi.fn()}
    />,
  );
  expect(screen.getByText(/Trama then opens “Alpha”/)).toBeInTheDocument();
  expect(screen.queryByText(/your only workspace/)).not.toBeInTheDocument();
  cleanup();
  render(
    <WorkspaceLeave
      workspace={alpha}
      last
      mode="delete"
      onClose={vi.fn()}
      onDone={vi.fn()}
    />,
  );
  expect(
    screen.getByText(/It's your only workspace, so Trama then asks you/),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Trama then opens/)).not.toBeInTheDocument();
});

const data: Snapshot = {
  source: "database",
  databasePath: alpha.path,
  projects: [],
  tasks: [],
  categories: [],
  documents: [],
  goals: [],
  agentProfiles: [],
};
function General({
  workspaces,
  onLeave,
}: {
  workspaces: Workspaces;
  onLeave: (workspace: Workspace, mode: "remove" | "delete") => void;
}) {
  return (
    <Preferences
      data={data}
      workspaces={workspaces}
      onEditWorkspace={vi.fn()}
      onLeaveWorkspace={onLeave}
      notify={vi.fn()}
      onEdit={vi.fn()}
      onAddProject={vi.fn()}
      boardView="kanban"
      onBoardView={vi.fn()}
      updater={useAppUpdater()}
      section="general"
    />
  );
}

it("offers removing and deleting the open workspace, even the only one", async () => {
  const user = userEvent.setup();
  const leave = vi.fn();
  render(<General workspaces={list(alpha.path, [alpha])} onLeave={leave} />);
  await user.click(screen.getByRole("button", { name: "Actions for Alpha" }));
  await user.click(screen.getByRole("menuitem", { name: "Delete…" }));
  expect(leave).toHaveBeenLastCalledWith(alpha, "delete");
  await user.click(screen.getByRole("button", { name: "Actions for Alpha" }));
  await user.click(screen.getByRole("menuitem", { name: "Remove from list…" }));
  expect(leave).toHaveBeenLastCalledWith(alpha, "remove");
});

it("offers only removal for a workspace whose file is gone", async () => {
  const user = userEvent.setup();
  const gone = space("Gone", "/synthetic/gone.sqlite", true);
  render(
    <General workspaces={list(alpha.path, [alpha, gone])} onLeave={vi.fn()} />,
  );
  await user.click(screen.getByRole("button", { name: "Actions for Gone" }));
  expect(
    screen.getByRole("menuitem", { name: "Remove from list…" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("menuitem", { name: "Delete…" }),
  ).not.toBeInTheDocument();
});
