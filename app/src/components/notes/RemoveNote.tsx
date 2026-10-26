import { noteName } from "../../lib/markdown";
import type { TaskDocument } from "../../lib/types";
import { Modal } from "../Modal";
import { under } from "./NoteTree";
import { t } from "../../lib/i18n";

/** Asks before a note or folder goes to the trash, saying what goes with it. */
export function RemoveNote({
  removing,
  notes,
  documents,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  removing: { path: string; folder: boolean };
  notes: string[];
  documents: TaskDocument[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const removingNotes = notes.filter((n) => under(n, removing.path));
  const removingTasks = new Set(
    documents.filter((d) => under(d.path, removing.path)).map((d) => d.taskId),
  ).size;
  return (
    <Modal
      title={removing.folder ? t("Delete folder?") : t("Delete note?")}
      className="confirm-modal"
      onClose={onClose}
    >
      <div className="modal-body">
        <p className="modal-text">
          {removing.folder
            ? removingNotes.length === 0
              ? t(
                  "“{0}” goes to the Trash empty. You can restore it from there.",
                  [removing.path.split("/").pop()],
                )
              : removingNotes.length === 1
                ? t(
                    "“{0}” goes to the Trash with the note inside it. You can restore it from there.",
                    [removing.path.split("/").pop()],
                  )
                : t(
                    "“{0}” goes to the Trash with the {1} notes inside it. You can restore it from there.",
                    [removing.path.split("/").pop(), removingNotes.length],
                  )
            : t("“{0}” goes to the Trash. You can restore it from there.", [
                noteName(removing.path),
              ])}
          {removingTasks > 0 &&
            ` ${
              removing.folder
                ? removingTasks === 1
                  ? t(
                      "The task with notes from here attached will show the attachment as unavailable.",
                    )
                  : t(
                      "The {0} tasks with notes from here attached will show the attachment as unavailable.",
                      [removingTasks],
                    )
                : removingTasks === 1
                  ? t(
                      "The task that has it attached will show the attachment as unavailable.",
                    )
                  : t(
                      "The {0} tasks that have it attached will show the attachment as unavailable.",
                      [removingTasks],
                    )
            }`}
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
          onClick={onConfirm}
        >
          {busy ? t("Moving…") : t("Move to Trash")}
        </button>
      </footer>
    </Modal>
  );
}
