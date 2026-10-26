// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppUpdater } from "./useAppUpdater";

const mocks = vi.hoisted(() => ({
  checkAppUpdate: vi.fn(),
  installAppUpdate: vi.fn(),
  installedAppVersion: vi.fn(),
  isDesktopApp: vi.fn(),
  restartUpdatedApp: vi.fn(),
}));

vi.mock("../lib/updater", () => mocks);

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  mocks.checkAppUpdate.mockResolvedValue(null);
  mocks.installedAppVersion.mockResolvedValue("0.2.2");
  mocks.isDesktopApp.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useAppUpdater", () => {
  it("checks on launch and once a day while automatic checks are enabled", async () => {
    renderHook(() => useAppUpdater());
    await act(async () => Promise.resolve());
    expect(mocks.checkAppUpdate).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000));
    expect(mocks.checkAppUpdate).toHaveBeenCalledTimes(2);
  });

  it("persists the automatic-check preference and keeps manual checks available", async () => {
    localStorage.setItem("trama.updater.auto-check", "false");
    const { result } = renderHook(() => useAppUpdater());
    await act(async () => Promise.resolve());
    expect(mocks.checkAppUpdate).not.toHaveBeenCalled();

    await act(async () => result.current.check());
    expect(mocks.checkAppUpdate).toHaveBeenCalledOnce();
    expect(result.current.status).toBe("current");

    act(() => result.current.setAutoCheck(true));
    await act(async () => Promise.resolve());
    expect(localStorage.getItem("trama.updater.auto-check")).toBe("true");
    expect(mocks.checkAppUpdate).toHaveBeenCalledTimes(2);
  });

  it("installs the checked update and restarts the desktop app", async () => {
    const update = { version: "0.2.3", close: vi.fn() };
    mocks.checkAppUpdate.mockResolvedValue(update);
    const { result } = renderHook(() => useAppUpdater());
    await act(async () => Promise.resolve());
    expect(result.current.availableUpdate).toBe(update);

    await act(async () => result.current.install());
    expect(mocks.installAppUpdate).toHaveBeenCalledWith(update);
    expect(mocks.restartUpdatedApp).toHaveBeenCalledOnce();
    expect(result.current.availableUpdate).toBeNull();
  });

  it("keeps a dismissed update installable and shows the notice again for a newer release", async () => {
    const update = {
      version: "0.2.3",
      close: vi.fn().mockResolvedValue(undefined),
    };
    mocks.checkAppUpdate.mockResolvedValue(update);
    const { result } = renderHook(() => useAppUpdater());
    await act(async () => Promise.resolve());

    act(() => result.current.dismissUpdate());
    expect(result.current.availableUpdate).toBe(update);
    expect(result.current.updateNoticeDismissed).toBe(true);
    expect(update.close).not.toHaveBeenCalled();

    await act(async () => result.current.check());
    expect(result.current.updateNoticeDismissed).toBe(true);

    mocks.checkAppUpdate.mockResolvedValue({
      version: "0.2.4",
      close: vi.fn().mockResolvedValue(undefined),
    });
    await act(async () => result.current.check());
    expect(result.current.availableUpdate?.version).toBe("0.2.4");
    expect(result.current.updateNoticeDismissed).toBe(false);
  });

  it("shows the agent-session notice once after an app version changes", async () => {
    localStorage.setItem("trama.updater.installed-version", "0.2.1");
    const first = renderHook(() => useAppUpdater());
    await act(async () => Promise.resolve());
    expect(first.result.current.restartNotice).toBe(true);

    act(() => first.result.current.dismissRestartNotice());
    expect(localStorage.getItem("trama.updater.pending-restart-version")).toBe(
      "",
    );
    first.unmount();

    const next = renderHook(() => useAppUpdater());
    await act(async () => Promise.resolve());
    expect(next.result.current.restartNotice).toBe(false);
  });

  it("keeps a pending reconnection notice across reopening and resets dismissal for each version change", async () => {
    const openVersion = async (version: string) => {
      mocks.installedAppVersion.mockResolvedValue(version);
      const hook = renderHook(() => useAppUpdater());
      await act(async () => Promise.resolve());
      return hook;
    };
    const initial = await openVersion("0.2.2");
    expect(initial.result.current.restartNotice).toBe(false);
    initial.unmount();

    const upgrade = await openVersion("0.2.3");
    expect(upgrade.result.current.restartNotice).toBe(true);
    upgrade.unmount();
    const reopened = await openVersion("0.2.3");
    expect(reopened.result.current.restartNotice).toBe(true);
    act(() => reopened.result.current.dismissRestartNotice());
    reopened.unmount();

    const same = await openVersion("0.2.3");
    expect(same.result.current.restartNotice).toBe(false);
    same.unmount();
    const downgrade = await openVersion("0.2.2");
    expect(downgrade.result.current.restartNotice).toBe(true);
    act(() => downgrade.result.current.dismissRestartNotice());
    downgrade.unmount();
    localStorage.setItem("trama.updater.dismissed-restart-version", "0.2.3");
    const upgradeAgain = await openVersion("0.2.3");
    expect(upgradeAgain.result.current.restartNotice).toBe(true);
  });

  it("restores a dismissed update after reopening and clears the indicator when a check finds no update", async () => {
    const update = {
      version: "0.2.3",
      close: vi.fn().mockResolvedValue(undefined),
    };
    mocks.checkAppUpdate.mockResolvedValue(update);
    const first = renderHook(() => useAppUpdater());
    await act(async () => Promise.resolve());
    act(() => first.result.current.dismissUpdate());
    first.unmount();
    const next = renderHook(() => useAppUpdater());
    await act(async () => Promise.resolve());
    expect(next.result.current.updateNoticeDismissed).toBe(true);
    expect(next.result.current.availableUpdate?.version).toBe("0.2.3");
    mocks.checkAppUpdate.mockResolvedValue(null);
    await act(async () => next.result.current.check());
    expect(next.result.current.updateNoticeDismissed).toBe(false);
    expect(next.result.current.availableUpdate).toBeNull();
    expect(next.result.current.status).toBe("current");
  });

  it("keeps the available update after a failed install and restarts after a successful retry", async () => {
    const update = { version: "0.2.3", close: vi.fn() };
    mocks.checkAppUpdate.mockResolvedValue(update);
    mocks.installAppUpdate
      .mockRejectedValueOnce(new Error("network failure"))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAppUpdater());
    await act(async () => Promise.resolve());

    await act(async () => {
      await expect(result.current.install()).rejects.toThrow("network failure");
    });
    expect(result.current.availableUpdate).toBe(update);
    expect(result.current.installing).toBe(false);
    expect(mocks.restartUpdatedApp).not.toHaveBeenCalled();

    await act(async () => result.current.install());
    expect(mocks.restartUpdatedApp).toHaveBeenCalledOnce();
    expect(result.current.availableUpdate).toBeNull();
  });

  it("does not replace the update or start a second install while installing", async () => {
    const update = { version: "0.2.3", close: vi.fn() };
    let finish = () => {};
    const pendingInstall = new Promise<void>((resolve) => {
      finish = resolve;
    });
    mocks.checkAppUpdate.mockResolvedValue(update);
    mocks.installAppUpdate.mockReturnValueOnce(pendingInstall);
    const { result } = renderHook(() => useAppUpdater());
    await act(async () => Promise.resolve());

    await act(async () => {
      const installing = result.current.install();
      await result.current.check();
      await result.current.install();
      expect(mocks.checkAppUpdate).toHaveBeenCalledOnce();
      expect(mocks.installAppUpdate).toHaveBeenCalledOnce();
      expect(update.close).not.toHaveBeenCalled();
      finish();
      await installing;
    });
    expect(mocks.restartUpdatedApp).toHaveBeenCalledOnce();
  });
});
