import { useState, type FormEvent } from "react";
import { searchKey } from "../hooks/usePopover";
import { createCategory, deleteCategory, errorMessage } from "../lib/api";
import type { Category, Project } from "../lib/types";
import { Field } from "./Field";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { Select } from "./Select";
import { locale, t } from "../lib/i18n";

/**
 * The project's categories with how many tasks use each one. The field on top searches them
 * (accent insensitive) and creates the typed name when no category has it. Deleting a used
 * category asks where its tasks go; they keep every other field.
 */
export function CategoryManager({
  project,
  categories,
  onClose,
  onChanged,
}: {
  project: Project;
  categories: Category[];
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const own = categories
    .filter((category) => category.projectId === project.id)
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const [removing, setRemoving] = useState<Category | null>(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const key = searchKey(query);
  const shown = own.filter((category) =>
    searchKey(category.name).includes(key),
  );
  const fresh =
    query.trim() && !own.some((category) => searchKey(category.name) === key)
      ? query.trim()
      : null;
  async function create(event?: FormEvent) {
    event?.preventDefault();
    if (!fresh || creating) return;
    setCreating(true);
    setCreateError("");
    try {
      await createCategory(project.id, fresh);
      setQuery("");
      onChanged(t("“{0}” was created.", [fresh]));
    } catch (e) {
      setCreateError(errorMessage(e));
    } finally {
      setCreating(false);
    }
  }
  const others = own.filter((category) => category.name !== removing?.name);
  function start(category: Category) {
    setRemoving(category);
    const first = own.find((c) => c.name !== category.name);
    setTarget(first?.name ?? "");
    setError("");
  }
  async function confirm() {
    if (!removing || busy) return;
    setBusy(true);
    setError("");
    try {
      const { moved } = await deleteCategory(
        project.id,
        removing.name,
        removing.taskCount > 0 ? target : null,
      );
      onChanged(
        moved > 0
          ? moved === 1
            ? t("“{0}” was deleted. 1 task moved to “{1}”.", [
                removing.name,
                target,
              ])
            : t("“{0}” was deleted. {1} tasks moved to “{2}”.", [
                removing.name,
                moved,
                target,
              ])
          : t("“{0}” was deleted.", [removing.name]),
      );
      setRemoving(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={removing ? t("Delete “{0}”?", [removing.name]) : t("Categories")}
      onClose={removing ? () => setRemoving(null) : onClose}
      className="categories-modal"
    >
      {removing ? (
        <>
          <div className="modal-body">
            {removing.taskCount > 0 ? (
              <>
                <p className="modal-text">
                  {removing.taskCount === 1
                    ? t(
                        "One task uses this category. It changes category and keeps everything else.",
                      )
                    : t(
                        "{0} tasks use this category. They change category and keep everything else.",
                        [removing.taskCount],
                      )}
                </p>
                {others.length > 0 ? (
                  <Field label={t("Move the tasks to")}>
                    {({ id, labelId }) => (
                      <Select
                        id={id}
                        labelledBy={labelId}
                        value={target}
                        options={others.map((c) => ({
                          value: c.name,
                          label: c.name,
                        }))}
                        onChange={setTarget}
                      />
                    )}
                  </Field>
                ) : (
                  <p className="form-error">
                    {t(
                      "This is the project's only category. Create another one before deleting it.",
                    )}
                  </p>
                )}
              </>
            ) : (
              <p className="modal-text">
                {t(
                  "No tasks use this category. It disappears from the suggestions.",
                )}
              </p>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <footer className="modal-footer">
            <span className="footer-hint" />
            <button
              type="button"
              className="button"
              onClick={() => setRemoving(null)}
            >
              {t("Cancel")}
            </button>
            <button
              type="button"
              className="button danger"
              disabled={busy || (removing.taskCount > 0 && !target)}
              aria-busy={busy}
              onClick={() => void confirm()}
            >
              {busy ? t("Deleting…") : t("Delete category")}
            </button>
          </footer>
        </>
      ) : (
        <>
          <div className="modal-body category-manager">
            <form className="category-search" onSubmit={(e) => void create(e)}>
              <Icon name="search" size={14} />
              <input
                data-autofocus
                aria-label={t("Search or create a category")}
                aria-describedby={
                  createError ? "category-create-error" : undefined
                }
                aria-invalid={createError ? true : undefined}
                autoComplete="off"
                spellCheck={false}
                maxLength={80}
                placeholder={t("Search or create a category…")}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCreateError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && query) {
                    event.preventDefault();
                    event.stopPropagation();
                    setQuery("");
                    setCreateError("");
                  }
                }}
              />
            </form>
            {createError && (
              <p className="form-error" id="category-create-error" role="alert">
                {createError}
              </p>
            )}
            <ul
              className="category-list scroll"
              aria-label={t("Project categories")}
            >
              {fresh && (
                <li className="category-row">
                  <button
                    type="button"
                    className="category-create"
                    disabled={creating}
                    aria-busy={creating}
                    onClick={() => void create()}
                  >
                    <Icon name="plus" size={13} />
                    <span className="truncate">
                      {t("Create category “")}
                      {fresh}”
                    </span>
                    <kbd>↵</kbd>
                  </button>
                </li>
              )}
              {shown.map((category) => (
                <li key={category.name} className="category-row">
                  <span className="truncate">{category.name}</span>
                  <span className="category-count">
                    {category.taskCount === 0
                      ? t("no tasks")
                      : category.taskCount === 1
                        ? t("1 task")
                        : t("{0} tasks", [category.taskCount])}
                  </span>
                  <button
                    type="button"
                    className="icon-button small danger-hover"
                    aria-label={t("Delete category {0}…", [category.name])}
                    data-tooltip={t("Delete category…")}
                    data-tooltip-align="end"
                    onClick={() => start(category)}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </li>
              ))}
            </ul>
            {!own.length && !fresh && (
              <p className="muted">
                {t(
                  "This project has no categories yet. Type a name above to create the first one.",
                )}
              </p>
            )}
          </div>
          <footer className="modal-footer">
            <span className="footer-hint">{project.name}</span>
            <button type="button" className="button small" onClick={onClose}>
              {t("Done")}
            </button>
          </footer>
        </>
      )}
    </Modal>
  );
}
