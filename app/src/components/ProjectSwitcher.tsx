import { useEffect, useId, useRef, useState } from "react";
import { searchKey } from "../hooks/usePopover";
import { projectShortcut, shortcutLabel } from "../lib/shortcuts";
import type { Project } from "../lib/types";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { ProjectMark } from "./ProjectMark";
import { t } from "../lib/i18n";

/** Goes to a project by typing part of its name, in sidebar order. */
export function ProjectSwitcher({
  projects,
  openCounts,
  currentId,
  onClose,
  onOpen,
}: {
  projects: Project[];
  openCounts: Record<string, number>;
  currentId?: string;
  onClose: () => void;
  onOpen: (project: Project) => void;
}) {
  const listId = useId();
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const key = searchKey(query);
  const found = projects
    .map((project, index) => ({ project, index }))
    .filter(({ project }) => searchKey(project.name).includes(key));
  useEffect(() => setSelected(0), [query]);
  useEffect(() => {
    list.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <Modal
      title={t("Go to project")}
      onClose={onClose}
      className="search-modal"
    >
      <div className="search-body">
        <div className="search-field">
          <Icon name="search" size={15} />
          <input
            autoFocus
            data-autofocus
            role="combobox"
            aria-expanded={found.length > 0}
            aria-controls={listId}
            aria-activedescendant={
              found[selected] ? `${listId}-${selected}` : undefined
            }
            aria-label={t("Project name")}
            autoComplete="off"
            spellCheck={false}
            placeholder={t("Project name…")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected((v) => Math.min(found.length - 1, v + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((v) => Math.max(0, v - 1));
              }
              if (e.key === "Enter" && found[selected]) {
                e.preventDefault();
                onOpen(found[selected].project);
              }
            }}
          />
        </div>
        <div
          ref={list}
          id={listId}
          className="search-results scroll"
          role="listbox"
          aria-label={t("Projects")}
        >
          {found.map(({ project, index }, at) => {
            const keys = projectShortcut(index);
            const open = openCounts[project.id] ?? 0;
            return (
              <div
                key={project.id}
                id={`${listId}-${at}`}
                data-index={at}
                role="option"
                aria-selected={at === selected}
                className={`search-result switch-result ${at === selected ? "selected" : ""}`}
                onMouseMove={() => setSelected(at)}
                onClick={() => onOpen(project)}
              >
                <ProjectMark project={project} />
                <div className="search-text">
                  <strong>{project.name}</strong>
                  <span>
                    {project.id === currentId
                      ? t("Open now")
                      : open === 1
                        ? t("1 open task")
                        : t("{0} open tasks", [open])}
                  </span>
                </div>
                {keys && <kbd>{shortcutLabel(keys)}</kbd>}
              </div>
            );
          })}
          {found.length === 0 && (
            <p className="search-empty">{t("No project with that name.")}</p>
          )}
        </div>
      </div>
      <footer className="search-foot" aria-hidden="true">
        <span className="search-count" />
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> {t("navigate")}
        </span>
        <span>
          <kbd>↩</kbd> {t("open")}
        </span>
        <span>
          <kbd>{t("esc")}</kbd> {t("close")}
        </span>
      </footer>
    </Modal>
  );
}
