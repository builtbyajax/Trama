import { useState } from "react";
import { deleteTask, errorMessage } from "../lib/api";
import type { Task } from "../lib/types";
import { Modal } from "./Modal";
import { t } from "../lib/i18n";

/** Asks before a task leaves for good; nothing is deleted until the person confirms. */
export function TaskDelete({
  task,
  projectName,
  onBefore,
  onClose,
  onDeleted,
}: {
  task: Task;
  projectName?: string;
  /** Runs right before the deletion, e.g. to drop unsaved edits of the open task. */
  onBefore?: () => void;
  onClose: () => void;
  onDeleted: (task: Task) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title={t("Delete task?")}
      className="confirm-modal"
      onClose={onClose}
    >
      <div className="modal-body">
        <p className="modal-text">
          “{task.title}
          {t("” leaves the board of")} {projectName ?? t("this project")}{" "}
          {t(
            "with its briefing, annotations and activity. This can't be undone.",
          )}
        </p>
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
        <button
          type="button"
          className="button danger"
          disabled={busy}
          aria-busy={busy}
          onClick={() => {
            setBusy(true);
            onBefore?.();
            deleteTask(task)
              .then(() => onDeleted(task))
              .catch((e) => {
                setError(errorMessage(e));
                setBusy(false);
              });
          }}
        >
          {busy ? t("Deleting…") : t("Delete task")}
        </button>
      </footer>
    </Modal>
  );
}
