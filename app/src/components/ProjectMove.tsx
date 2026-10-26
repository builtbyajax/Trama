import { useState } from "react";
import { errorMessage, moveProject } from "../lib/api";
import type { Project, Workspace } from "../lib/types";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { workspaceName } from "./Workspaces";
import { t } from "../lib/i18n";

/** Sends a project, with everything in it, to another workspace. */
export function ProjectMove({
  project,
  taskCount,
  targets,
  onClose,
  onMoved,
}: {
  project: Project;
  taskCount: number;
  targets: Workspace[];
  onClose: () => void;
  onMoved: (project: Project, target: Workspace) => void;
}) {
  const [target, setTarget] = useState(targets[0]?.path ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chosen = targets.find((w) => w.path === target);
  return (
    <Modal
      title={t("Move to another workspace")}
      className="confirm-modal"
      onClose={onClose}
    >
      <div className="modal-body">
        {targets.length === 0 ? (
          <p className="modal-text">
            {t(
              "There's no other workspace yet. Create one from the menu at the top of the sidebar.",
            )}
          </p>
        ) : (
          <>
            <p className="modal-text">
              {taskCount === 1
                ? t(
                    "“{0}” leaves this workspace with 1 task and everything in it: activity, checklist, annotations and categories.",
                    [project.name],
                  )
                : t(
                    "“{0}” leaves this workspace with {1} tasks and everything in them: activity, checklists, annotations and categories.",
                    [project.name, taskCount],
                  )}
            </p>
            <div
              className="workspace-targets"
              role="radiogroup"
              aria-label={t("Destination")}
            >
              {targets.map((workspace) => (
                <button
                  key={workspace.path}
                  type="button"
                  role="radio"
                  aria-checked={workspace.path === target}
                  className="workspace-target"
                  onClick={() => setTarget(workspace.path)}
                >
                  <span className="truncate">{workspaceName(workspace)}</span>
                  {workspace.path === target && <Icon name="check" size={14} />}
                </button>
              ))}
            </div>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="modal-footer">
        <span className="footer-hint" />
        <button type="button" className="button" onClick={onClose}>
          {t("Cancel")}
        </button>
        {chosen && (
          <button
            type="button"
            className="button primary"
            disabled={busy}
            aria-busy={busy}
            onClick={() => {
              setBusy(true);
              moveProject(project.id, chosen.path)
                .then(() => onMoved(project, chosen))
                .catch((e) => {
                  setError(errorMessage(e));
                  setBusy(false);
                });
            }}
          >
            {busy ? t("Moving…") : t("Move project")}
          </button>
        )}
      </footer>
    </Modal>
  );
}
