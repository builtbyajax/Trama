// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAppUpdater } from "../hooks/useAppUpdater";
import type { Snapshot } from "../lib/types";
import { Preferences } from "./Preferences";
import { Sidebar } from "./Sidebar";
import { UpdateNotices } from "./UpdateNotices";

const mocks = vi.hoisted(() => ({
  checkAppUpdate: vi.fn(),
  installAppUpdate: vi.fn(),
  installedAppVersion: vi.fn(),
  isDesktopApp: vi.fn(),
  restartUpdatedApp: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("../lib/updater", () => mocks);
vi.mock("../hooks/useScrollbarRoom", () => ({ useScrollbarRoom: vi.fn() }));
const data: Snapshot = {
  source: "database",
  databasePath: "/isolated/test.sqlite",
  projects: [],
  tasks: [],
  categories: [],
  documents: [],
  goals: [],
};
function UpdaterPreferences() {
  const updater = useAppUpdater();
  return (
    <>
      <Sidebar
        projects={[]}
        openCounts={{}}
        workingCount={0}
        updateAvailable={updater.updateNoticeDismissed}
        destination={{ kind: "preferences" }}
        onNavigate={vi.fn()}
        onAddProject={vi.fn()}
        onEditProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onMoveProject={vi.fn()}
        onShortcuts={vi.fn()}
      />
      <UpdateNotices
        availableVersion={
          updater.updateNoticeDismissed
            ? null
            : (updater.availableUpdate?.version ?? null)
        }
        installing={updater.installing}
        restartNotice={updater.restartNotice}
        onDismissRestart={updater.dismissRestartNotice}
        onDismissUpdate={updater.dismissUpdate}
        onInstall={() => void updater.install().catch(mocks.notify)}
        onReleaseNotes={vi.fn()}
      />
      <Preferences
        data={data}
        workspaces={null}
        onEditWorkspace={vi.fn()}
        onLeaveWorkspace={vi.fn()}
        notify={mocks.notify}
        onEdit={vi.fn()}
        onAddProject={vi.fn()}
        boardView="kanban"
        onBoardView={vi.fn()}
        updater={updater}
      />
    </>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  mocks.checkAppUpdate.mockResolvedValue({
    version: "0.2.3",
    close: vi.fn().mockResolvedValue(undefined),
  });
  mocks.installedAppVersion.mockResolvedValue("0.2.2");
  mocks.isDesktopApp.mockReturnValue(true);
  mocks.installAppUpdate.mockResolvedValue(undefined);
  mocks.restartUpdatedApp.mockResolvedValue(undefined);
});
afterEach(cleanup);
it("keeps installation and manual checking available in Preferences after dismissing the banner", async () => {
  render(<UpdaterPreferences />);
  await screen.findByRole("button", { name: "Dismiss update notice" });
  fireEvent.click(
    screen.getByRole("button", { name: "Dismiss update notice" }),
  );
  expect(screen.queryByRole("region", { name: "Updates" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Preferences, Update available" }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Check now" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Update and restart" }),
  ).toBeTruthy();
  mocks.checkAppUpdate.mockResolvedValue(null);
  fireEvent.click(screen.getByRole("button", { name: "Check now" }));
  await screen.findByText("Trama is up to date.");
  expect(
    screen.queryByRole("button", { name: "Update and restart" }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Preferences" })).toBeTruthy();
});
it("reports installation failure, allows retry and disables both actions while installing", async () => {
  render(<UpdaterPreferences />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Dismiss update notice" }),
  );
  mocks.installAppUpdate.mockRejectedValueOnce(new Error("download failed"));
  fireEvent.click(screen.getByRole("button", { name: "Update and restart" }));
  await waitFor(() =>
    expect(mocks.notify).toHaveBeenCalledWith("download failed", true),
  );
  expect(mocks.restartUpdatedApp).not.toHaveBeenCalled();
  let finish!: () => void;
  mocks.installAppUpdate.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Update and restart" }));
  expect(
    (
      screen.getByRole("button", {
        name: "Installing update…",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("button", { name: "Check now" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Check now" }));
  expect(mocks.checkAppUpdate).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  expect(mocks.restartUpdatedApp).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole("button", { name: "Preferences, Update available" }),
  ).toBeNull();
});
