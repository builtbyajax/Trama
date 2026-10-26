import { useCallback, useEffect, useRef, useState } from "react";
import { editTask, errorMessage, taskDetails } from "../lib/api";
import type { Task, TaskDetails, TaskInput } from "../lib/types";

type Edit = Pick<
  TaskInput,
  "title" | "details" | "category" | "assignee" | "status" | "repositoryBranch"
>;
type Key = keyof Edit;
export type SaveState =
  "idle" | "pending" | "saving" | "saved" | "invalid" | "error";

/**
 * Saves the person's edits to a task on its own: text after a short pause, properties at once.
 * Local values win only for the fields being edited; every other field follows the task as the
 * agent or another window changes it. A saved field hands back to the task once the task shows
 * that save (or something newer). Pending edits are written when the sheet closes.
 */
export function useTaskAutosave(task: Task, onSaved: () => void) {
  const [draft, setDraft] = useState<Partial<Edit>>({});
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const latest = useRef({ task, draft, onSaved });
  latest.current = { task, draft: latest.current.draft, onSaved };
  // Fields changed since the last write, and fields written but not yet seen on the task.
  const dirty = useRef(new Set<Key>());
  const settled = useRef(new Map<Key, number>());
  const timer = useRef<number | undefined>(undefined);
  const running = useRef<Promise<boolean> | null>(null);
  const put = (next: Partial<Edit>) => {
    latest.current.draft = next;
    setDraft(next);
  };
  useEffect(() => {
    const next = { ...latest.current.draft };
    let changed = false;
    for (const [key, stamp] of settled.current)
      if (task.updatedAt >= stamp && !dirty.current.has(key)) {
        delete next[key];
        settled.current.delete(key);
        changed = true;
      }
    if (changed) put(next);
  }, [task.updatedAt]);
  const flush = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timer.current);
    while (running.current) await running.current;
    if (!dirty.current.size) return true;
    const { task, draft } = latest.current;
    if (dirty.current.has("title") && !draft.title?.trim()) {
      setState("invalid");
      return false;
    }
    const keys = [...dirty.current];
    dirty.current.clear();
    setState("saving");
    const run = editTask(
      {
        projectId: task.projectId,
        ...Object.fromEntries(keys.map((key) => [key, draft[key]])),
      },
      task.id,
    ).then(
      (saved) => {
        for (const key of keys)
          if (!dirty.current.has(key))
            settled.current.set(key, saved.updatedAt);
        setError("");
        setState(dirty.current.size ? "pending" : "saved");
        latest.current.onSaved();
        return true;
      },
      (e) => {
        for (const key of keys) dirty.current.add(key);
        setError(errorMessage(e));
        setState("error");
        return false;
      },
    );
    running.current = run;
    const ok = await run;
    running.current = null;
    return ok;
  }, []);
  const change = useCallback(
    (patch: Partial<Edit>, delay = 700) => {
      for (const key of Object.keys(patch) as Key[]) {
        dirty.current.add(key);
        settled.current.delete(key);
      }
      put({ ...latest.current.draft, ...patch });
      setState("pending");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), delay);
    },
    [flush],
  );
  const discard = useCallback(() => {
    window.clearTimeout(timer.current);
    dirty.current.clear();
    settled.current.clear();
    put({});
    setError("");
    setState("idle");
  }, []);
  // Leaving the task (closing, switching to another) writes what is still pending.
  useEffect(
    () => () => {
      if (dirty.current.size) void flush();
    },
    [flush],
  );
  const value: Edit = {
    title: task.title,
    details: task.details,
    category: task.category,
    assignee: task.assignee,
    status: task.status,
    repositoryBranch: task.repositoryBranch,
    ...draft,
  };
  return {
    value,
    state,
    error,
    change,
    flush,
    discard,
    pending: () => dirty.current.size > 0,
  };
}

/** The task's notes, messages and events, reloaded whenever the task changes. */
export function useTaskDetails(task: Task) {
  const [details, setDetails] = useState<TaskDetails | null>(null);
  const [error, setError] = useState("");
  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current;
    try {
      const loaded = await taskDetails(task);
      if (id === request.current) {
        setDetails(loaded);
        setError("");
      }
    } catch (e) {
      if (id === request.current) setError(errorMessage(e));
    }
    // A task keeps its id and project while the sheet is open.
  }, [task.id, task.projectId]);
  useEffect(() => {
    void load();
  }, [load, task.updatedAt, task.messageCount]);
  return { details, error, reload: load };
}
