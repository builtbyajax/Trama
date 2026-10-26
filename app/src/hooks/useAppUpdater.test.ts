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

  it("shows the agent-session notice once after an app version changes", async () => {
    localStorage.setItem("trama.updater.installed-version", "0.2.1");
    const first = renderHook(() => useAppUpdater());
    await act(async () => Promise.resolve());
    expect(first.result.current.restartNotice).toBe(true);

    act(() => first.result.current.dismissRestartNotice());
    expect(
      localStorage.getItem("trama.updater.dismissed-restart-version"),
    ).toBe("0.2.2");
    first.unmount();

    const next = renderHook(() => useAppUpdater());
    await act(async () => Promise.resolve());
    expect(next.result.current.restartNotice).toBe(false);
  });
});
