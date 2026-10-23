import { useEffect, useState } from "react";
import {
  chooseDatabase,
  errorMessage,
  listWorkspaces,
  openWorkspace,
  switchWorkspace,
} from "../lib/api";
import type { Workspace, Workspaces } from "../lib/types";

/**
 * The workspace list and the open one. Entering another workspace reloads the window: its
 * projects, tasks and everything the screens remember about them belong to the other file.
 */
export function useWorkspaces(
  notify: (message: string, error?: boolean) => void,
) {
  const [list, setList] = useState<Workspaces | null>(null);
  /** The name dialog: `{}` creates, `{ workspace }` renames. */
  const [composer, setComposer] = useState<{ workspace?: Workspace } | null>(
    null,
  );
  useEffect(() => {
    listWorkspaces().then(setList, () => setList(null));
  }, []);
  const enter = (next: Workspaces) => {
    setList(next);
    window.location.reload();
  };
  const fail = (e: unknown) => notify(errorMessage(e), true);
  return {
    list,
    setList,
    composer,
    setComposer,
    enter,
    switchTo: (workspace: Workspace) =>
      void switchWorkspace(workspace.path).then(enter, fail),
    open: () =>
      void chooseDatabase()
        .then((path) => (path ? openWorkspace(path).then(enter) : undefined))
        .catch(fail),
  };
}
