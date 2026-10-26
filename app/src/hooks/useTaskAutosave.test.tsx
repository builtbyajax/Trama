// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useTaskAutosave } from "./useTaskAutosave";
import { editTask } from "../lib/api";
import { task } from "../test/fixtures";
vi.mock("../lib/api", () => ({
  editTask: vi.fn(),
  errorMessage: (e: unknown) => String(e),
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(editTask).mockResolvedValue(task({ updatedAt: 200 }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("sends only edited fields when the agent changes status while the person types", async () => {
  const saved = vi.fn();
  const { result, rerender } = renderHook(
    ({ current }) => useTaskAutosave(current, saved),
    { initialProps: { current: task() } },
  );
  act(() => result.current.change({ title: "Edited title" }));
  rerender({ current: task({ status: "review", updatedAt: 150 }) });
  expect(result.current.value.status).toBe("review");
  await act(() => vi.advanceTimersByTimeAsync(700));
  expect(editTask).toHaveBeenCalledExactlyOnceWith(
    { projectId: "project", title: "Edited title" },
    "task",
  );
  expect(saved).toHaveBeenCalledTimes(1);
  rerender({
    current: task({ title: "Edited title", status: "review", updatedAt: 200 }),
  });
  expect(result.current.state).toBe("saved");
});
it("flushes to the original task on a keyed sheet switch and cancels its timer", async () => {
  const first = renderHook(() =>
    useTaskAutosave(task({ id: "first" }), vi.fn()),
  );
  act(() => first.result.current.change({ title: "First edit" }));
  await act(async () => first.unmount());
  const second = renderHook(() =>
    useTaskAutosave(task({ id: "second", title: "Second" }), vi.fn()),
  );
  expect(second.result.current.value.title).toBe("Second");
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(editTask).toHaveBeenCalledExactlyOnceWith(
    { projectId: "project", title: "First edit" },
    "first",
  );
});
it("keeps failed edits for retry and rejects an empty title without writing", async () => {
  const { result } = renderHook(() => useTaskAutosave(task(), vi.fn()));
  act(() => result.current.change({ title: " " }));
  await act(() => vi.advanceTimersByTimeAsync(700));
  expect(result.current.state).toBe("invalid");
  expect(editTask).not.toHaveBeenCalled();
  vi.mocked(editTask).mockRejectedValueOnce(new Error("Offline"));
  act(() => result.current.change({ title: "Recovered" }));
  await act(() => vi.advanceTimersByTimeAsync(700));
  expect(result.current.state).toBe("error");
  expect(result.current.pending()).toBe(true);
  await act(async () => {
    expect(await result.current.flush()).toBe(true);
  });
  expect(result.current.state).toBe("saved");
  expect(editTask).toHaveBeenCalledTimes(2);
});
it("serializes in-flight saves and retains newer edits", async () => {
  let finish!: (value: ReturnType<typeof task>) => void;
  vi.mocked(editTask).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { result } = renderHook(() => useTaskAutosave(task(), vi.fn()));
  act(() => result.current.change({ title: "First" }));
  await act(() => vi.advanceTimersByTimeAsync(700));
  expect(result.current.state).toBe("saving");
  act(() => result.current.change({ title: "Second" }));
  await act(async () => {
    finish(task({ title: "First", updatedAt: 200 }));
  });
  expect(result.current.value.title).toBe("Second");
  await act(() => vi.advanceTimersByTimeAsync(700));
  expect(editTask).toHaveBeenLastCalledWith(
    { projectId: "project", title: "Second" },
    "task",
  );
});
it("discards pending changes without saving", async () => {
  const { result } = renderHook(() => useTaskAutosave(task(), vi.fn()));
  act(() => result.current.change({ details: "Discard me" }));
  act(() => result.current.discard());
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(editTask).not.toHaveBeenCalled();
  expect(result.current.value.details).toBe("");
});
