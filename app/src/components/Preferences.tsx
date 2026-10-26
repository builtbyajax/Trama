import { useState } from "react";
import { copyText } from "../lib/api";
import type { Project, Snapshot } from "../lib/types";
import { Icon } from "./Icon";
import { language, languages, setLanguage, t } from "../lib/i18n";

export function Preferences({
  data,
  onEdit,
}: {
  data: Snapshot;
  onEdit: (project: Project) => void;
}) {
  const [copied, setCopied] = useState("");
  const copy = (value: string, label: string) =>
    void copyText(value)
      .then(() => setCopied(label))
      .catch(() => setCopied(t("Couldn't copy.")));
  return (
    <div className="page scroll">
      <div className="page-inner narrow preferences">
        <header className="page-hero">
          <h1>{t("Preferences")}</h1>
          <p>
            {t(
              "The language, where your data lives and how the agent connects.",
            )}
          </p>
        </header>
        <section className="settings-group">
          <h2 id="language-title">{t("Language")}</h2>
          <p className="muted">
            {t("Trama reloads to show everything in the chosen language.")}
          </p>
          {/* Each language is named in itself, so it can be found from the other one. */}
          <div
            className="segmented"
            role="group"
            aria-labelledby="language-title"
          >
            {languages.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={language === option.value}
                className={language === option.value ? "on" : ""}
                onClick={() =>
                  language !== option.value && setLanguage(option.value)
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>
        <section className="settings-group">
          <h2>{t("Database")}</h2>
          <p className="muted">
            {t(
              "This Trama's data stays on this computer. The Git screen is read-only: Trama doesn't change branches or push anything.",
            )}
          </p>
          <div className="settings-row">
            <code className="path-text" title={data.databasePath}>
              {data.databasePath}
            </code>
            <button
              type="button"
              className="icon-button"
              aria-label={t("Copy database path")}
              onClick={() => copy(data.databasePath, t("Path copied."))}
            >
              <Icon name="copy" size={14} />
            </button>
          </div>
        </section>
        <section className="settings-group">
          <h2>{t("Projects and MCP integration")}</h2>
          <p className="muted">
            {t("Each agent connects to a single project using the ID below.")}
          </p>
          <ul className="settings-list">
            {data.projects.map((project) => (
              <li className="settings-row" key={project.id}>
                <div className="settings-text">
                  <span className="truncate">{project.name}</span>
                  <code className="selectable">{project.id}</code>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("Copy ID of {0}", [project.name])}
                  onClick={() => copy(project.id, t("ID copied."))}
                >
                  <Icon name="copy" size={14} />
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => onEdit(project)}
                >
                  {t("Edit project")}
                </button>
              </li>
            ))}
          </ul>
          {data.projects.length === 0 && (
            <p className="muted">{t("No projects created.")}</p>
          )}
        </section>
        <p className="muted small" role="status">
          {copied}
        </p>
      </div>
    </div>
  );
}
