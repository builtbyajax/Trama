import { useEffect, useState } from "react";
import { listBranches } from "../lib/api";
import type { Project } from "../lib/types";

/**
 * The project's local branches, read from Git (never stored): again when `revision` changes and
 * when the window regains focus, so a branch created in the terminal shows up on return.
 * Null while unknown: no repository, not loaded yet or Git unavailable.
 */
export function useBranches(project: Project | undefined, revision = 0) {
  const key = project?.repositoryPath
    ? `${project.id}\n${project.repositoryPath}`
    : null;
  const [loaded, setLoaded] = useState<{ key: string; names: string[] }>();
  useEffect(() => {
    if (!key) return;
    const id = key.split("\n")[0];
    let active = true;
    const load = () =>
      void listBranches(id).then(
        (names) =>
          active &&
          setLoaded((current) =>
            current?.key === key &&
            current.names.join("\n") === names.join("\n")
              ? current
              : { key, names },
          ),
        () => active && setLoaded(undefined),
      );
    load();
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
    };
  }, [key, revision]);
  return key && loaded?.key === key ? loaded.names : null;
}
