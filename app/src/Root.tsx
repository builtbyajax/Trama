import { useEffect, useState } from "react";
import { App } from "./App";
import { FirstWorkspace } from "./components/Workspaces";
import { listWorkspaces } from "./lib/api";
import type { Workspaces } from "./lib/types";

/** The board, or the first screen while there is no workspace to open. */
export function Root() {
  const [list, setList] = useState<Workspaces | null>();
  useEffect(() => {
    listWorkspaces().then(setList, () => setList(null));
  }, []);
  if (list === undefined) return null;
  if (list && !list.pinned && !list.active)
    return <FirstWorkspace onEnter={setList} />;
  return <App />;
}
