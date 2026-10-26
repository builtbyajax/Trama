import { useEffect, useId, useState, type FormEvent } from "react";
import { useBranches } from "../hooks/useBranches";
import { saveTask, errorMessage } from "../lib/api";
import {
  emptyInput,
  isDraft,
  type Category,
  type Project,
  type Task,
  type TaskStatus,
} from "../lib/types";
import { Field } from "./Field";
import { Modal } from "./Modal";
import { Select } from "./Select";
import { categoryNames, TaskFields } from "./TaskFields";
import { t } from "../lib/i18n";

/**
 * Prefer the general task type ("Funcionalidade" in projects created while the default categories
 * were in Portuguese), otherwise keep the project's first category.
 */
const defaultCategory = (categories: Category[], projectId: string) => {
  const names = categoryNames(categories, projectId);
  return (
    ["Feature", "Funcionalidade"].find((name) => names.includes(name)) ??
    names[0] ??
    "Feature"
  );
};

export function TaskComposer({
  projects,
  categories,
  projectId,
  status,
  branch = null,
  onClose,
  onSaved,
}: {
  projects: Project[];
  categories: Category[];
  projectId: string;
  status: TaskStatus;
  /** Starts on this branch, e.g. the one the board is filtered by. */
  branch?: string | null;
  onClose: () => void;
  onSaved: (task: Task) => void;
}) {
  const [input, setInput] = useState(() => ({
    ...emptyInput(projectId, status, defaultCategory(categories, projectId)),
    repositoryBranch: branch,
  }));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const destinationId = useId();
  const project = projects.find((p) => p.id === input.projectId);
  const branches = useBranches(project);
  // A branch that left the repository cannot be chosen.
  const stale = Boolean(
    branches &&
    input.repositoryBranch &&
    !branches.includes(input.repositoryBranch),
  );
  useEffect(() => {
    if (stale) setInput((v) => ({ ...v, repositoryBranch: null }));
  }, [stale]);
  const draft = isDraft(input.status);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      onSaved(await saveTask(input));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={t("New task")} onClose={onClose} className="task-modal">
      <form className="modal-form" onSubmit={submit}>
        <div className="modal-body scroll">
          <div className="form-row">
            <Field label={t("Project")} className="grow">
              {({ id, labelId }) => (
                <Select
                  id={id}
                  labelledBy={labelId}
                  value={input.projectId}
                  options={projects.map((p) => ({
                    value: p.id,
                    label: p.name,
                  }))}
                  onChange={(value) =>
                    setInput({
                      ...input,
                      projectId: value,
                      repositoryBranch: null,
                    })
                  }
                />
              )}
            </Field>
            <div className="field">
              <span className="field-label" id={destinationId}>
                {t("Save to")}
              </span>
              <div
                className="segmented segmented-field"
                role="radiogroup"
                aria-labelledby={destinationId}
              >
                {(
                  [
                    ["todo", t("Board")],
                    ["preparing", t("Drafts")],
                  ] as const
                ).map(([value, label]) => {
                  const on = (value === "preparing") === draft;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={on ? "on" : ""}
                      onClick={() =>
                        !on && setInput({ ...input, status: value })
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <TaskFields
            input={input}
            onChange={setInput}
            categories={categoryNames(categories, input.projectId)}
            allStates={false}
            autoFocus
            branches={project?.repositoryPath ? branches : undefined}
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="modal-footer">
          <p className="footer-hint">
            {draft
              ? t("The draft stays off the board until it's ready.")
              : t("The task joins the project's queue.")}
          </p>
          <button type="button" className="button" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="button primary" disabled={busy} aria-busy={busy}>
            {busy ? t("Creating…") : t("Create task")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
