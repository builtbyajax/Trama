import {
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  chooseDirectory,
  deleteProject,
  saveProject,
  validateRepository,
  errorMessage,
  folderExample,
} from "../lib/api";
import type { Project } from "../lib/types";
import { Field } from "./Field";
import { Icon, type IconName } from "./Icon";
import { Modal } from "./Modal";
import { initialOf, projectIcons } from "./ProjectMark";
import { projectHues } from "./Sidebar";
import { t } from "../lib/i18n";

const hueNames = [
  t("Amber"),
  t("Green"),
  t("Coral"),
  t("Cyan"),
  t("Pink"),
  t("Olive"),
];

/**
 * Creates or edits a project. Tasks belong to the project, not to the folder, so pointing it at
 * a repository that moved keeps the whole board and its activity.
 */
export function ProjectComposer({
  project,
  defaultColor = 0,
  onClose,
  onSaved,
  onDelete,
}: {
  project?: Project;
  /** Color offered to a new project: the least used one. */
  defaultColor?: number;
  onClose: () => void;
  onSaved: (project: Project) => void;
  onDelete?: (project: Project) => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [path, setPath] = useState(project?.repositoryPath ?? "");
  const [color, setColor] = useState(project?.color ?? defaultColor);
  const [icon, setIcon] = useState<string | null>(project?.icon ?? null);
  const [notesFolder, setNotesFolder] = useState(
    project?.documentsFolder ?? "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function choose() {
    try {
      const chosen = await chooseDirectory();
      if (chosen) setPath(chosen);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (path.trim()) await validateRepository(path.trim());
      onSaved(
        await saveProject(
          name,
          path.trim() || null,
          color,
          project?.id,
          notesFolder.trim() || null,
          icon,
        ),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={project ? t("Edit project") : t("Add project")}
      onClose={onClose}
      className="project-modal"
    >
      <form className="modal-form" onSubmit={submit}>
        <div className="modal-body scroll">
          <Field label={t("Project name")}>
            {({ id }) => (
              <input
                id={id}
                autoFocus
                data-autofocus
                required
                autoComplete="off"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("E.g. Atlas")}
              />
            )}
          </Field>
          <Field label={t("Color")}>
            {({ id, labelId }) => (
              <ColorPicker
                id={id}
                labelId={labelId}
                value={color}
                onChange={setColor}
              />
            )}
          </Field>
          <Field label={t("Icon")}>
            {({ id, labelId }) => (
              <IconPicker
                id={id}
                labelId={labelId}
                name={name}
                hue={projectHues[color % projectHues.length]}
                value={icon}
                onChange={setIcon}
              />
            )}
          </Field>
          <Field
            label={t("Local repository, optional")}
            hint={
              project
                ? t(
                    "If the repository moved, point to the new folder. The tasks and activity stay in the project.",
                  )
                : t(
                    "Without a repository, the board works normally, but the Git history is unavailable.",
                  )
            }
          >
            {({ id, describedBy }) => (
              <div className="input-row">
                <input
                  id={id}
                  className="path-input"
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(error) || undefined}
                  autoComplete="off"
                  spellCheck={false}
                  value={path}
                  title={path || undefined}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder={t("/path/to/repository")}
                />
                <button
                  type="button"
                  className="button"
                  aria-label={t("Choose repository folder")}
                  onClick={choose}
                >
                  <Icon name="folder" size={14} />
                  {t("Choose…")}
                </button>
              </div>
            )}
          </Field>
          <Field
            label={t("Notes folder, optional")}
            hint={t(
              "The project's vault, with its .md notes. They show up in the Notes tab.",
            )}
          >
            {({ id, describedBy }) => (
              <div className="input-row">
                <input
                  id={id}
                  className="path-input"
                  aria-describedby={describedBy}
                  autoComplete="off"
                  spellCheck={false}
                  value={notesFolder}
                  title={notesFolder || undefined}
                  onChange={(e) => setNotesFolder(e.target.value)}
                  placeholder={folderExample()}
                />
                <button
                  type="button"
                  className="button"
                  aria-label={t("Choose notes folder")}
                  onClick={() =>
                    void chooseDirectory(t("Project notes folder"))
                      .then((chosen) => chosen && setNotesFolder(chosen))
                      .catch((e) => setError(errorMessage(e)))
                  }
                >
                  <Icon name="folder" size={14} />
                  {t("Choose…")}
                </button>
              </div>
            )}
          </Field>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="modal-footer">
          {project && onDelete ? (
            <span className="footer-hint">
              <button
                type="button"
                className="button danger"
                onClick={() => onDelete(project)}
              >
                {t("Delete project…")}
              </button>
            </span>
          ) : (
            <span className="footer-hint">
              {t("Each project keeps its own queue.")}
            </span>
          )}
          <button type="button" className="button" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="button primary" disabled={busy} aria-busy={busy}>
            {busy
              ? t("Saving…")
              : project
                ? t("Save project")
                : t("Create project")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

/** Palette as a radio group: arrows move and choose, like native radios. */
export function ColorPicker({
  id,
  labelId,
  value,
  onChange,
  palette = projectHues.map((hue, index) => ({
    value: hue,
    name: hueNames[index],
  })),
}: {
  id: string;
  labelId: string;
  /** None chosen yet: the first color takes the focus. */
  value: number | null;
  onChange: (value: number) => void;
  /** The colors to choose from; the projects' by default. */
  palette?: { value: string; name: string }[];
}) {
  const focused = value ?? 0;
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = (focused + step + palette.length) % palette.length;
    onChange(next);
    event.currentTarget
      .querySelector<HTMLElement>(`[data-hue="${next}"]`)
      ?.focus();
  }
  return (
    <div
      className="color-picker"
      role="radiogroup"
      aria-labelledby={labelId}
      onKeyDown={keyDown}
    >
      {palette.map(({ value: hue, name }, index) => (
        <button
          key={hue}
          id={index === focused ? id : undefined}
          type="button"
          role="radio"
          aria-checked={index === value}
          aria-label={name}
          data-tooltip={name}
          data-hue={index}
          tabIndex={index === focused ? 0 : -1}
          className="color-option"
          style={{ background: hue }}
          onClick={() => onChange(index)}
        />
      ))}
    </div>
  );
}

/** The initial, then the project glyphs, as one radio group tinted with the chosen color. */
export function IconPicker({
  id,
  labelId,
  name,
  hue,
  value,
  onChange,
}: {
  id: string;
  labelId: string;
  name: string;
  hue: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const options: { value: string | null; label: string }[] = [
    { value: null, label: t("Name's initial") },
    ...projectIcons.map((icon) => ({ value: icon.name, label: icon.label })),
  ];
  const at = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = (at + step + options.length) % options.length;
    onChange(options[next].value);
    event.currentTarget
      .querySelector<HTMLElement>(`[data-option="${next}"]`)
      ?.focus();
  }
  return (
    <div
      className="icon-picker"
      role="radiogroup"
      aria-labelledby={labelId}
      style={{ "--hue": hue } as CSSProperties}
      onKeyDown={keyDown}
    >
      {options.map((option, index) => (
        <button
          key={option.value ?? ""}
          id={index === at ? id : undefined}
          type="button"
          role="radio"
          aria-checked={index === at}
          aria-label={option.label}
          data-tooltip={option.label}
          data-option={index}
          tabIndex={index === at ? 0 : -1}
          className="icon-option"
          onClick={() => onChange(option.value)}
        >
          {option.value ? (
            <Icon name={option.value as IconName} size={15} />
          ) : (
            initialOf(name || "A")
          )}
        </button>
      ))}
    </div>
  );
}

/** Confirmation before a project and everything in it is removed. */
export function ProjectDelete({
  project,
  taskCount,
  onClose,
  onDeleted,
}: {
  project: Project;
  taskCount: number;
  onClose: () => void;
  onDeleted: (project: Project) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title={t("Delete project?")}
      className="confirm-modal"
      onClose={onClose}
    >
      <div className="modal-body">
        <p className="modal-text">
          “{project.name}
          {t("” leaves Trama with")}{" "}
          {taskCount === 0
            ? t("its categories")
            : taskCount === 1
              ? t("1 task, its briefing, annotations and activity")
              : t("{0} tasks, their briefings, annotations and activity", [
                  taskCount,
                ])}
          {t(". The repository folder is not touched. This can't be undone.")}
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
            deleteProject(project.id)
              .then(() => onDeleted(project))
              .catch((e) => {
                setError(errorMessage(e));
                setBusy(false);
              });
          }}
        >
          {busy ? t("Deleting…") : t("Delete project")}
        </button>
      </footer>
    </Modal>
  );
}
