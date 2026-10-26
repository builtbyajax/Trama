import { useState, type FormEvent } from "react";
import {
  chooseDirectory,
  errorMessage,
  folderExample,
  saveProject,
} from "../../lib/api";
import { isMac } from "../../lib/shortcuts";
import type { Project } from "../../lib/types";
import { Icon } from "../Icon";
import { t } from "../../lib/i18n";

/** A project without a notes folder yet: one vault per project, chosen in the file browser or
 * typed. */
export function ProjectNotesSetup({
  project,
  onSaved,
}: {
  project: Project;
  onSaved: () => void;
}) {
  const [path, setPath] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function use(folder: string) {
    setBusy(true);
    setError("");
    try {
      await saveProject(
        project.name,
        project.repositoryPath,
        project.color,
        project.id,
        folder,
      );
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function choose() {
    try {
      const chosen = await chooseDirectory(
        t("Notes folder for {0}", [project.name]),
      );
      if (chosen) await use(chosen);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <div className="empty-state notes-setup">
      <Icon name="vault" size={24} />
      <strong>
        {t("Choose the notes folder for")} {project.name}
      </strong>
      <p>
        {t(
          "The folder you choose becomes the project's vault: the .md notes in it and its subfolders show up here to read, search and edit. Hidden folders are left out.",
        )}
      </p>
      <form
        className="input-row"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (path.trim()) void use(path.trim());
        }}
      >
        <input
          aria-label={t("Notes folder path")}
          placeholder={folderExample()}
          spellCheck={false}
          value={path}
          onChange={(event) => setPath(event.target.value)}
        />
        <button
          type="button"
          className="button primary"
          disabled={busy}
          onClick={() => void choose()}
        >
          <Icon name="folder" size={14} />
          {t("Choose…")}
        </button>
      </form>
      <p className="notes-setup-hint">
        {isMac
          ? t("Choose in Finder, or type the path and press ↩.")
          : t("Choose in Explorer, or type the path and press Enter.")}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
