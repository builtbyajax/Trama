// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { WorkspaceLeave } from "./Workspaces";
import { ContextMenu } from "./Sidebar";
import { Markdown } from "./Markdown";
import { parseMarkdown } from "../lib/markdown";
import { deleteWorkspace, switchWorkspace, removeWorkspace } from "../lib/api";
vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  deleteWorkspace: vi.fn(),
  switchWorkspace: vi.fn(),
  removeWorkspace: vi.fn(),
}));
const workspace = {
  name: "Test Space",
  path: "/synthetic/test.sqlite",
  missing: false,
  color: null,
  icon: null,
};
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
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it("requires the exact workspace name even when Enter submits the form", async () => {
  const user = userEvent.setup();
  const done = vi.fn();
  vi.mocked(deleteWorkspace).mockResolvedValue({
    active: "",
    pinned: false,
    organized: false,
    workspaces: [],
  });
  render(
    <WorkspaceLeave
      workspace={workspace}
      mode="delete"
      onClose={vi.fn()}
      onDone={done}
    />,
  );
  const input = screen.getByRole("textbox");
  const submit = screen.getByRole("button", { name: "Delete workspace" });
  expect(submit).toBeDisabled();
  fireEvent.submit(input.closest("form")!);
  expect(deleteWorkspace).not.toHaveBeenCalled();
  await user.type(input, "Wrong{Enter}");
  expect(deleteWorkspace).not.toHaveBeenCalled();
  await user.clear(input);
  await user.type(input, "Test Space{Enter}");
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect(deleteWorkspace).toHaveBeenCalledExactlyOnceWith(workspace.path);
});
it("deletes the open workspace without switching first and shows a failure", async () => {
  const user = userEvent.setup();
  vi.mocked(deleteWorkspace).mockRejectedValueOnce(new Error("Delete failed"));
  render(
    <WorkspaceLeave
      workspace={workspace}
      fallback={{
        ...workspace,
        name: "Other",
        path: "/synthetic/other.sqlite",
      }}
      mode="delete"
      onClose={vi.fn()}
      onDone={vi.fn()}
    />,
  );
  expect(screen.getByText(/Trama then opens “Other”/)).toBeInTheDocument();
  await user.type(screen.getByRole("textbox"), "Test Space{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent("Delete failed");
  expect(deleteWorkspace).toHaveBeenCalledWith(workspace.path);
  expect(switchWorkspace).not.toHaveBeenCalled();
});
it("removing from the list calls removal rather than file deletion", async () => {
  vi.mocked(removeWorkspace).mockResolvedValue({
    active: "",
    pinned: false,
    organized: false,
    workspaces: [],
  });
  render(
    <WorkspaceLeave
      workspace={workspace}
      mode="remove"
      onClose={vi.fn()}
      onDone={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove from list" }));
  await waitFor(() =>
    expect(removeWorkspace).toHaveBeenCalledWith(workspace.path),
  );
  expect(deleteWorkspace).not.toHaveBeenCalled();
});
it("clamps context menus to the viewport and supports keyboard focus and Escape", async () => {
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(240);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(120);
  const close = vi.fn(),
    select = vi.fn();
  render(
    <ContextMenu
      x={100000}
      y={100000}
      label="Actions"
      items={[
        { label: "First", onSelect: select },
        { label: "Second", onSelect: select },
      ]}
      onClose={close}
    />,
  );
  const menu = screen.getByRole("menu");
  expect(menu).toHaveStyle({
    left: `${window.innerWidth - 248}px`,
    top: `${window.innerHeight - 128}px`,
  });
  expect(screen.getByRole("menuitem", { name: "First" })).toHaveFocus();
  fireEvent.keyDown(menu, { key: "ArrowDown" });
  expect(screen.getByRole("menuitem", { name: "Second" })).toHaveFocus();
  fireEvent.keyDown(menu, { key: "Escape" });
  expect(close).toHaveBeenCalledWith(true);
  fireEvent.click(screen.getByRole("menuitem", { name: "Second" }));
  expect(select).toHaveBeenCalledTimes(1);
});
it("does not send unsafe note links to the browser and renders raw HTML as text", async () => {
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  const error = vi.fn();
  render(
    <Markdown
      doc={parseMarkdown(
        "[unsafe](javascript:evil) [file](file:///secret) [safe](https://example.com)\n\n<script>evil</script>",
      )}
      context={{
        projectId: "project",
        path: "note.md",
        notes: [],
        images: [],
        onError: error,
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "unsafe" }));
  fireEvent.click(screen.getByRole("button", { name: "file" }));
  await waitFor(() => expect(error).toHaveBeenCalledTimes(2));
  expect(open).not.toHaveBeenCalled();
  expect(document.querySelector("script")).toBeNull();
  expect(screen.getByText("<script>evil</script>")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "safe" }));
  expect(open).toHaveBeenCalledExactlyOnceWith(
    "https://example.com",
    "_blank",
    "noopener,noreferrer",
  );
});
