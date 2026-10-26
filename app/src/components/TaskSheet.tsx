import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
} from "react";
import {
  useTaskAutosave,
  useTaskDetails,
  type SaveState,
} from "../hooks/useTaskAutosave";
import { addNote, deleteNote, errorMessage, openUrl } from "../lib/api";
import { briefingPreview, parseBriefing } from "../lib/briefing";
import { ariaKeys, shortcutLabel, shortcuts } from "../lib/shortcuts";
import {
  isAgentWorking,
  statusTitle,
  type GitFocus,
  type Goal,
  type Project,
  type Task,
  type TaskStatus,
} from "../lib/types";
import { Activity } from "./Activity";
import { AgentTrail } from "./AgentTrail";
import { AutoTextarea } from "./AutoTextarea";
import { Glyph } from "./BoardFilters";
import { BranchMenu } from "./BranchMenu";
import { BriefingEditor, Inline } from "./Briefing";
import { CategoryMenu } from "./CategoryMenu";
import { Field } from "./Field";
import { Icon } from "./Icon";
import { KeyHint } from "./KeyHint";
import { Select } from "./Select";
import { TaskDelete } from "./TaskDelete";
import { goalOptions, statusOptions } from "./TaskFields";
import { TaskDocuments } from "./notes/TaskDocuments";
import { t } from "../lib/i18n";

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.matches("input, textarea, [role='combobox'], [contenteditable]") ||
    Boolean(
      target.closest("[role='listbox'], [role='menu'], .briefing-editor"),
    ));

export type SheetMode = "sheet" | "page";

const assignees = [
  {
    value: "user" as const,
    label: t("You"),
    icon: <Glyph who="user" />,
  },
  {
    value: "agent" as const,
    label: t("Agent"),
    icon: <Glyph who="agent" />,
  },
];
const saveText: Record<SaveState, string> = {
  idle: t("Saved automatically"),
  pending: t("Saving…"),
  saving: t("Saving…"),
  saved: t("Saved"),
  invalid: t("The title can't be empty"),
  error: t("Couldn't save"),
};

/**
 * A task opened over the board. As a sheet it drops over the dimmed board for reading and quick
 * changes: title, property chips, the briefing collapsed to a preview and the activity, which is
 * the only part that scrolls. ⌘↩ (or the briefing's pencil, or a click on its text) turns it into a full page with the
 * block editor beside the activity. Every edit saves on its own.
 */
export function TaskSheet({
  task,
  project,
  categories,
  branches,
  goals,
  onOpenNote,
  mode,
  backLabel,
  position,
  closeGuard,
  onPrevious,
  onNext,
  onMode,
  onClose,
  onChanged,
  onDeleted,
  onGit,
}: {
  task: Task;
  project?: Project;
  categories: string[];
  /** The project's local branches; null while unknown. */
  branches: string[] | null;
  /** The project's goals. */
  goals: Goal[];
  onOpenNote: (path: string) => void;
  mode: SheetMode;
  /** Where the page's back button returns to. */
  backLabel: string;
  position?: { index: number; total: number };
  /** Set by the sheet: returns true when closing must wait (an edit that failed to save). */
  closeGuard: MutableRefObject<(() => boolean) | null>;
  onPrevious?: () => void;
  onNext?: () => void;
  onMode: (mode: SheetMode) => void;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: (task: Task) => void;
  onGit: (focus: GitFocus) => void;
}) {
  const sheet = useRef<HTMLElement>(null);
  const page = mode === "page";
  const save = useTaskAutosave(task, onChanged);
  const { value } = save;
  const activity = useTaskDetails(task);
  const [activityError, setActivityError] = useState("");
  const [editBriefing, setEditBriefing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const failed = save.state === "error" || save.state === "invalid";
  const working = isAgentWorking({ ...task, ...value });
  useEffect(() => {
    closeGuard.current = () => {
      if (failed && save.pending()) {
        sheet.current
          ?.querySelector<HTMLElement>(".sheet-foot button")
          ?.focus();
        return true;
      }
      void save.flush();
      return false;
    };
    return () => {
      closeGuard.current = null;
    };
  }, [failed, save, closeGuard]);
  useEffect(() => {
    // Keyboard focus moves into the sheet and returns to where it came from.
    const previous = document.activeElement as HTMLElement | null;
    sheet.current?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (!page) setEditBriefing(false);
  }, [page]);
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target))
      return;
    const go =
      event.key === "ArrowUp"
        ? onPrevious
        : event.key === "ArrowDown"
          ? onNext
          : undefined;
    if (!go) return;
    event.preventDefault();
    go();
  };
  const editInPage = () => {
    setEditBriefing(true);
    onMode("page");
  };
  const blocks = parseBriefing(value.details);
  const preview = briefingPreview(blocks);
  const repository = project?.repositoryPath;
  const states = Object.keys(statusTitle) as TaskStatus[];
  return (
    <>
      {!page && (
        <button
          type="button"
          className="sheet-scrim"
          aria-label={t("Close task")}
          tabIndex={-1}
          onClick={onClose}
        />
      )}
      <section
        ref={sheet}
        className={`sheet ${page ? "page" : ""}`}
        aria-label={t("Task: {0}", [task.title])}
        tabIndex={-1}
        onKeyDown={keyDown}
      >
        <header className="sheet-head">
          {page && (
            <button
              type="button"
              className="button small back"
              onClick={onClose}
            >
              <Icon name="chevronLeft" size={13} />
              {backLabel}
            </button>
          )}
          <span className="sheet-state">
            <span
              className="status-dot"
              style={{ background: `var(--s-${value.status})` }}
              aria-hidden="true"
            />
            {statusTitle[value.status]}
          </span>
          {position && (
            <span className="sheet-position">
              {position.index + 1} {t("of")} {position.total}
            </span>
          )}
          <span className={`save-state ${save.state}`} role="status">
            <span className="save-dot" aria-hidden="true" />
            {saveText[save.state]}
          </span>
          <span className="sheet-actions">
            <button
              type="button"
              className="icon-button"
              aria-label={t("Previous task")}
              data-tooltip={t("Previous task  ↑")}
              disabled={!onPrevious}
              onClick={onPrevious}
            >
              <Icon name="chevronUp" size={15} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={t("Next task")}
              data-tooltip={t("Next task  ↓")}
              disabled={!onNext}
              onClick={onNext}
            >
              <Icon name="chevronDown" size={15} />
            </button>
            <span className="head-divider" aria-hidden="true" />
            <button
              type="button"
              className="icon-button"
              aria-label={page ? t("Back to sheet") : t("Open as full page")}
              aria-keyshortcuts={ariaKeys(shortcuts.fullPage)}
              data-tooltip={`${page ? t("Back to sheet") : t("Open as full page")}  ${shortcutLabel(shortcuts.fullPage)}`}
              onClick={() => onMode(page ? "sheet" : "page")}
            >
              <Icon name={page ? "collapse" : "expand"} size={15} />
              <KeyHint keys={shortcuts.fullPage} />
            </button>
            <button
              type="button"
              className="icon-button danger-hover"
              aria-label={t("Delete task…")}
              data-tooltip={t("Delete task…")}
              onClick={() => setConfirmDelete(true)}
            >
              <Icon name="trash" size={15} />
            </button>
            {!page && (
              <button
                type="button"
                className="icon-button"
                aria-label={t("Close task")}
                data-tooltip={t("Close  esc")}
                data-tooltip-align="end"
                onClick={onClose}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </span>
        </header>
        <div className="sheet-body">
          <div className="sheet-main scroll">
            <div className="sheet-main-inner">
              <Field
                label={t("Heading")}
                hideLabel
                className="sheet-title-field"
              >
                {({ id }) => (
                  <AutoTextarea
                    id={id}
                    className="sheet-title"
                    required
                    maxRows={4}
                    submitOnEnter
                    value={value.title}
                    onChange={(e) =>
                      save.change({ title: e.target.value.replace(/\n/g, " ") })
                    }
                    onBlur={() => void save.flush()}
                    placeholder={t("Task title")}
                  />
                )}
              </Field>
              <div
                className="prop-chips"
                role="group"
                aria-label={t("Properties")}
              >
                <Select
                  label={t("Status")}
                  size="sm"
                  className="prop-chip"
                  value={value.status}
                  options={statusOptions(states)}
                  onChange={(status) => save.change({ status }, 0)}
                />
                <Select
                  label={t("Assignee")}
                  size="sm"
                  className="prop-chip"
                  value={value.assignee}
                  options={assignees}
                  onChange={(assignee) => save.change({ assignee }, 0)}
                />
                <CategoryMenu
                  value={value.category}
                  categories={categories}
                  onChange={(category) => save.change({ category }, 0)}
                />
                {(goals.length > 0 || value.goalId) && (
                  <Select
                    label={t("Goal")}
                    size="sm"
                    className={`prop-chip goal-chip ${value.goalId ? "" : "empty"}`}
                    value={value.goalId ?? ""}
                    options={goalOptions(goals, value.goalId).map((o) => ({
                      ...o,
                      icon: <Icon name="target" size={12} />,
                    }))}
                    onChange={(goalId) =>
                      save.change({ goalId: goalId || null }, 0)
                    }
                  />
                )}
                {repository ? (
                  <BranchMenu
                    projectId={task.projectId}
                    value={value.repositoryBranch}
                    branches={branches}
                    done={value.status === "done"}
                    onChange={(repositoryBranch) =>
                      save.change({ repositoryBranch }, 0)
                    }
                  />
                ) : (
                  task.repositoryBranch && (
                    <span
                      className="prop-chip ref"
                      title={task.repositoryBranch}
                    >
                      <Icon name="branch" size={12} />
                      <code className="truncate">{task.repositoryBranch}</code>
                    </span>
                  )
                )}
                {task.commitHash && (
                  <button
                    type="button"
                    className="prop-chip ref"
                    disabled={!repository}
                    aria-label={t("Commit {0}, open in Git history", [
                      task.commitHash.slice(0, 12),
                    ])}
                    data-tooltip={
                      repository ? t("Open in Git history") : undefined
                    }
                    onClick={() =>
                      onGit({ kind: "commit", id: task.commitHash! })
                    }
                  >
                    <Icon name="commit" size={12} />
                    <code>{task.commitHash.slice(0, 7)}</code>
                  </button>
                )}
                {task.pullRequestNumber && (
                  <button
                    type="button"
                    className="prop-chip ref link"
                    disabled={!repository && !task.pullRequestUrl}
                    onClick={() =>
                      repository
                        ? onGit({ kind: "pr", number: task.pullRequestNumber! })
                        : task.pullRequestUrl &&
                          void openUrl(task.pullRequestUrl).catch((e) =>
                            setActivityError(errorMessage(e)),
                          )
                    }
                  >
                    <Icon
                      name={repository ? "pullRequest" : "external"}
                      size={12}
                    />
                    {t("PR #")}
                    {task.pullRequestNumber}
                  </button>
                )}
              </div>
              {working && (
                <p className="agent-working">
                  <AgentTrail />
                  <Glyph who="agent" />
                  {t("The agent is on this task")}
                </p>
              )}
              {page ? (
                <section className="briefing" aria-labelledby="briefing-title">
                  <header className="briefing-head">
                    <h2 id="briefing-title" className="caps">
                      {t("Briefing")}
                    </h2>
                    <span className="briefing-note">
                      {t("what the agent receives · Markdown")}
                    </span>
                    <span className="briefing-rule" aria-hidden="true" />
                  </header>
                  <BriefingEditor
                    value={value.details}
                    autoFocus={editBriefing}
                    onChange={(details) => save.change({ details })}
                  />
                  <p className="briefing-shortcuts">
                    {t("Shortcuts:")} <code className="inline-code">- </code>{" "}
                    {t("list ·")} <code className="inline-code">[] </code>{" "}
                    {t("task ·")} <code className="inline-code">## </code>{" "}
                    {t("heading ·")} <code className="inline-code">&gt; </code>{" "}
                    {t("quote ·")}{" "}
                    <code className="inline-code">{t("**bold**")}</code> ·{" "}
                    <code className="inline-code">{t("`code`")}</code>
                  </p>
                </section>
              ) : (
                /* The whole card opens the full page to edit. To-dos, links and its own
                   buttons keep their click; the keyboard reaches it through a hidden button. */
                <section
                  className="briefing card"
                  aria-labelledby="briefing-title"
                  onClick={(event) => {
                    if (
                      !(event.target as HTMLElement).closest(
                        "a, button, input, [role='checkbox']",
                      )
                    )
                      editInPage();
                  }}
                >
                  <button
                    type="button"
                    className="sr-only briefing-hit"
                    aria-keyshortcuts={ariaKeys(shortcuts.fullPage)}
                    onClick={editInPage}
                  >
                    {t("Edit briefing full screen")}
                  </button>
                  <header className="briefing-head">
                    <h2 id="briefing-title" className="caps">
                      {t("Briefing")}
                    </h2>
                    <span className="briefing-note">
                      {t("what the agent receives")}
                    </span>
                    <span className="briefing-actions">
                      <span className="briefing-pencil" aria-hidden="true">
                        <Icon name="pencil" size={13} />
                      </span>
                    </span>
                  </header>
                  <div className="briefing-body">
                    {preview.text ? (
                      <p className="briefing-preview">
                        <Inline text={preview.text} links={false} />
                      </p>
                    ) : (
                      <p className="briefing-empty">
                        {t(
                          "No briefing yet. Click to tell the agent what to do.",
                        )}
                      </p>
                    )}
                  </div>
                </section>
              )}
              <TaskDocuments
                task={task}
                project={project}
                documents={activity.details?.documents ?? []}
                onChanged={() => {
                  void activity.reload();
                  onChanged();
                }}
                onOpenNote={onOpenNote}
              />
            </div>
          </div>
          <Activity
            details={activity.details}
            error={activity.error || activityError}
            onAddNote={async (body) => {
              try {
                await addNote(task, body);
                setActivityError("");
                await activity.reload();
                return true;
              } catch (e) {
                setActivityError(errorMessage(e));
                return false;
              }
            }}
            onDeleteNote={(id) =>
              void deleteNote(task, id)
                .then(() => {
                  setActivityError("");
                  return activity.reload();
                })
                .catch((e) => setActivityError(errorMessage(e)))
            }
          />
        </div>
        {failed && (
          <footer className="sheet-foot">
            <p className="form-error" role="alert">
              {save.state === "invalid"
                ? t("Give the task a title to save your changes.")
                : t("Couldn't save: {0}", [save.error])}
            </p>
            {save.state === "error" && (
              <button
                type="button"
                className="button"
                onClick={() => void save.flush()}
              >
                {t("Try again")}
              </button>
            )}
            <button type="button" className="button" onClick={save.discard}>
              {t("Discard changes")}
            </button>
          </footer>
        )}
      </section>
      {confirmDelete && (
        <TaskDelete
          task={task}
          projectName={project?.name}
          onBefore={save.discard}
          onClose={() => setConfirmDelete(false)}
          onDeleted={() => {
            onChanged();
            onDeleted(task);
          }}
        />
      )}
    </>
  );
}
