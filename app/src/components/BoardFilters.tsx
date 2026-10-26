import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { usePopover } from "../hooks/usePopover";
import type { Project, Task, TaskAssignee } from "../lib/types";
import { ariaKeys, shortcutLabel, shortcuts } from "../lib/shortcuts";
import { Icon } from "./Icon";
import { KeyHint } from "./KeyHint";
import { ProjectMark } from "./ProjectMark";
import { Select } from "./Select";
import { locale, t } from "../lib/i18n";

/**
 * `branch` is "*" for every task, "" for tasks without a branch, or a branch name. `archived`
 * swaps the board for the list of archived tasks (see `isArchived`).
 */
export type BoardFilter = {
  assignee: "all" | TaskAssignee;
  category: string;
  branch: string;
  archived: boolean;
};
export const defaultFilter: BoardFilter = {
  assignee: "all",
  category: "*",
  branch: "*",
  archived: false,
};

export type ProjectMode = "board" | "git" | "notes";

/** The two threads of the app: a ring for you, a diamond for the agent. */
export function Glyph({ who }: { who: TaskAssignee }) {
  return <span className={`glyph ${who}`} aria-hidden="true" />;
}

/**
 * Head of a project page: name and a one-line summary, the Board/History switch and, on the
 * board, the category chips (with their manager), the branch and assignee filters and the switch
 * to the archived tasks.
 */
export function ProjectHeader({
  project,
  color,
  tasks,
  archivedCount,
  mode,
  filter,
  onMode,
  onFilter,
  onManageCategories,
}: {
  project: Project;
  color: string;
  /** The project's board tasks, or its archived ones while those are shown; unfiltered. */
  tasks: Task[];
  archivedCount: number;
  mode: ProjectMode;
  filter: BoardFilter;
  onMode: (mode: ProjectMode) => void;
  onFilter: (patch: Partial<BoardFilter>) => void;
  onManageCategories: () => void;
}) {
  const withAgent = tasks.filter(
    (task) => task.assignee === "agent" && task.status !== "done",
  ).length;
  const categories = [...new Set(tasks.map((task) => task.category))].sort(
    (a, b) => a.localeCompare(b, locale),
  );
  const byAssignee =
    filter.assignee === "all"
      ? tasks
      : tasks.filter((task) => task.assignee === filter.assignee);
  const branches = [
    ...new Set(tasks.flatMap((task) => task.repositoryBranch ?? [])),
  ].sort((a, b) => a.localeCompare(b));
  const branchOptions = [
    { value: "*", label: t("All branches") },
    ...(tasks.some((task) => !task.repositoryBranch)
      ? [{ value: "", label: t("No branch") }]
      : []),
    ...branches.map((name) => ({ value: name, label: name })),
  ];
  const chips = [
    { value: "*", label: t("All|filter"), count: byAssignee.length },
    ...categories.map((name) => ({
      value: name,
      label: name,
      count: byAssignee.filter((task) => task.category === name).length,
    })),
  ];
  return (
    <div className="page-head">
      <div className="page-head-row">
        <div className="page-title">
          <h1>
            <ProjectMark project={project} color={color} size="large" />
            <span className="truncate">{project.name}</span>
          </h1>
          <p>
            {filter.archived
              ? tasks.length === 1
                ? t("1 archived task")
                : t("{0} archived tasks", [tasks.length])
              : tasks.length === 1
                ? t("1 task")
                : t("{0} tasks", [tasks.length])}
            {!filter.archived &&
              withAgent > 0 &&
              t(", {0} with the agent", [withAgent])}
            {mode === "notes" && project.documentsFolder && (
              <span className="page-repo" title={project.documentsFolder}>
                <Icon name="vault" size={12} />
                {project.documentsFolder.split(/[\\/]/).filter(Boolean).pop()}
              </span>
            )}
            {mode === "board" && project.repositoryPath && (
              <span className="page-repo" title={project.repositoryPath}>
                <Icon name="folder" size={12} />
                {project.repositoryPath.split(/[\\/]/).filter(Boolean).pop()}
              </span>
            )}
          </p>
        </div>
        <div className="segmented" role="group" aria-label={t("Project view")}>
          <button
            type="button"
            aria-pressed={mode === "board"}
            aria-keyshortcuts={ariaKeys(shortcuts.board)}
            data-tooltip={t("Board  {0}", [shortcutLabel(shortcuts.board)])}
            className={mode === "board" ? "on" : ""}
            onClick={() => onMode("board")}
          >
            {t("Board")}
            <KeyHint keys={shortcuts.board} />
          </button>
          <button
            type="button"
            aria-pressed={mode === "git"}
            aria-keyshortcuts={ariaKeys(shortcuts.git)}
            data-tooltip={t("Git history  {0}", [shortcutLabel(shortcuts.git)])}
            className={mode === "git" ? "on" : ""}
            onClick={() => onMode("git")}
          >
            {t("History")}
            <KeyHint keys={shortcuts.git} />
          </button>
          <button
            type="button"
            aria-pressed={mode === "notes"}
            aria-keyshortcuts={ariaKeys(shortcuts.projectNotes)}
            data-tooltip={t("Project notes  {0}", [
              shortcutLabel(shortcuts.projectNotes),
            ])}
            data-tooltip-align="end"
            className={mode === "notes" ? "on" : ""}
            onClick={() => onMode("notes")}
          >
            {t("Notes")}
            <KeyHint keys={shortcuts.projectNotes} />
          </button>
        </div>
      </div>
      {mode === "board" && (
        <div className="filter-row">
          <CategoryChips
            chips={chips}
            selected={filter.category}
            onSelect={(category) => onFilter({ category })}
            onManage={onManageCategories}
          />
          {branches.length > 0 && (
            <Select
              label={t("Filter by branch")}
              size="sm"
              className={`branch-filter ${filter.branch !== "*" ? "on" : ""}`}
              value={filter.branch}
              options={branchOptions}
              onChange={(branch) => onFilter({ branch })}
            />
          )}
          {archivedCount > 0 && (
            <button
              type="button"
              aria-pressed={filter.archived}
              aria-label={t("Archived, {0}", [archivedCount])}
              data-tooltip={t(
                "Archived: done more than 7 days ago, with no branch in the repository",
              )}
              className={`chip-button archive-toggle ${filter.archived ? "on" : ""}`}
              onClick={() => onFilter({ archived: !filter.archived })}
            >
              <Icon name="archive" size={12} />
              <span className="chip-count">{archivedCount}</span>
            </button>
          )}
          <div
            className="segmented small"
            role="radiogroup"
            aria-label={t("Assignee")}
          >
            {(["all", "user", "agent"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={filter.assignee === value}
                className={filter.assignee === value ? "on" : ""}
                onClick={() => onFilter({ assignee: value })}
              >
                {value !== "all" && <Glyph who={value} />}
                {value === "all"
                  ? t("Everyone")
                  : value === "user"
                    ? t("You")
                    : t("Agent")}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type Chip = { value: string; label: string; count: number };

/** Space between chips, as in `.chips`. */
const chipGap = 6;

/**
 * The category chips on one line: those that fit stay in the row, the rest fold into a "+N"
 * button whose list also holds the category manager. The chosen category always stays in view.
 */
function CategoryChips({
  chips,
  selected,
  onSelect,
  onManage,
}: {
  chips: Chip[];
  selected: string;
  onSelect: (category: string) => void;
  onManage: () => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<number[] | null>(null);
  // Every chip fits, but only with the manager folded to a gear.
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const close = useCallback(() => setOpen(false), []);
  const { style, container } = usePopover(open, trigger, list, close, {
    minWidth: 220,
    maxHeight: 360,
  });
  const chipsKey = chips.map((chip) => `${chip.label}:${chip.count}`).join("|");
  const latest = useRef(chips);
  latest.current = chips;

  // Fits chips from the start of the row, then swaps the chosen one in when it fell outside.
  useLayoutEffect(() => {
    const element = row.current;
    const ruler = measure.current;
    if (!element || !ruler) return;
    const fit = () => {
      const chips = latest.current;
      const style = getComputedStyle(element);
      const room =
        element.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      const widths = [...ruler.children].map(
        (child) => (child as HTMLElement).offsetWidth,
      );
      const manage = widths[chips.length];
      const more = widths[chips.length + 1];
      const gear = widths[chips.length + 2];
      const total = widths
        .slice(0, chips.length)
        .reduce((sum, width) => sum + width + chipGap, 0);
      setCompact(total + manage > room && total + gear <= room);
      if (total + gear <= room) return setShown(null);
      const chosen = Math.max(
        0,
        chips.findIndex((chip) => chip.value === selected),
      );
      const indexes: number[] = [];
      let used = more;
      for (let index = 0; index < chips.length; index++) {
        if (used + widths[index] + chipGap > room) break;
        indexes.push(index);
        used += widths[index] + chipGap;
      }
      if (!indexes.includes(chosen)) {
        used += widths[chosen] + chipGap;
        while (indexes.length > 0 && used > room)
          used -= widths[indexes.pop()!] + chipGap;
        indexes.push(chosen);
      }
      indexes.sort((a, b) => a - b);
      setShown((current) =>
        current?.join() === indexes.join() ? current : indexes,
      );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [chipsKey, selected]);

  const visible = shown
    ? chips.filter((_, index) => shown.includes(index))
    : chips;
  const hidden = shown
    ? chips.filter((_, index) => !shown.includes(index))
    : [];
  // The hidden categories, then the manager.
  const items = hidden.length + 1;
  useLayoutEffect(() => {
    if (hidden.length === 0) setOpen(false);
  }, [hidden.length]);

  function pick(index: number) {
    setOpen(false);
    if (index < hidden.length) onSelect(hidden[index].value);
    else onManage();
  }
  function keyDown(event: KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        setActive(0);
        setOpen(true);
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (index + step + items) % items);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : items - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === "Tab") setOpen(false);
  }

  const chipButton = (chip: Chip) => (
    <button
      key={chip.value}
      type="button"
      role="radio"
      aria-checked={selected === chip.value}
      className={`chip-button ${selected === chip.value ? "on" : ""}`}
      onClick={() => onSelect(chip.value)}
    >
      <span className="truncate">{chip.label}</span>
      <span className="chip-count">{chip.count}</span>
    </button>
  );
  const manageButton = (
    <button type="button" className="chip-button dashed" onClick={onManage}>
      {t("Manage categories…")}
    </button>
  );
  const gearButton = (
    <button
      type="button"
      className="chip-button dashed chip-icon"
      aria-label={t("Manage categories…")}
      data-tooltip={t("Manage categories…")}
      onClick={onManage}
    >
      <Icon name="gear" size={13} />
    </button>
  );
  return (
    <div
      ref={row}
      className="chips"
      role="radiogroup"
      aria-label={t("Filter by category")}
    >
      {visible.map(chipButton)}
      {hidden.length > 0 ? (
        <button
          ref={trigger}
          type="button"
          className={`chip-button ${open ? "on" : ""}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t("{0} more categories", [hidden.length])}
          aria-activedescendant={open ? `category-more-${active}` : undefined}
          data-tooltip={open ? undefined : t("More categories")}
          onClick={() => {
            trigger.current?.focus();
            setActive(0);
            setOpen((value) => !value);
          }}
          onKeyDown={keyDown}
        >
          +{hidden.length}
        </button>
      ) : compact ? (
        gearButton
      ) : (
        manageButton
      )}
      <div ref={measure} className="chips-measure" aria-hidden="true">
        {chips.map((chip) => (
          <span key={chip.value} className="chip-button">
            <span className="truncate">{chip.label}</span>
            <span className="chip-count">{chip.count}</span>
          </span>
        ))}
        <span className="chip-button dashed">{t("Manage categories…")}</span>
        <span className="chip-button">+{chips.length}</span>
        <span className="chip-button dashed chip-icon">
          <Icon name="gear" size={13} />
        </span>
      </div>
      {open &&
        container &&
        createPortal(
          <div
            ref={list}
            role="menu"
            aria-label={t("Other categories")}
            className="popover-list menu-list"
            style={style}
            onMouseDown={(event) => event.preventDefault()}
          >
            {hidden.map((chip, index) => (
              <div
                key={chip.value}
                id={`category-more-${index}`}
                role="menuitem"
                className={`popover-option ${index === active ? "active" : ""}`}
                onMouseMove={() => setActive(index)}
                onClick={() => pick(index)}
              >
                <span className="popover-label">{chip.label}</span>
                <span className="chip-count">{chip.count}</span>
              </div>
            ))}
            <div className="menu-separator" role="separator" />
            <div
              id={`category-more-${hidden.length}`}
              role="menuitem"
              className={`popover-option ${active === hidden.length ? "active" : ""}`}
              onMouseMove={() => setActive(hidden.length)}
              onClick={() => pick(hidden.length)}
            >
              <span className="popover-label">{t("Manage categories…")}</span>
            </div>
          </div>,
          container,
        )}
    </div>
  );
}
