import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePopover } from "../hooks/usePopover";
import { revealLabel } from "../lib/api";
import type { Goal, Project, Task, TaskAssignee } from "../lib/types";
import { ariaKeys, shortcutLabel, shortcuts } from "../lib/shortcuts";
import { Icon } from "./Icon";
import { KeyHint } from "./KeyHint";
import { ProjectMark } from "./ProjectMark";
import { Select } from "./Select";
import { goalChoices } from "./Goals";
import { ContextMenu } from "./Sidebar";
import { locale, t } from "../lib/i18n";
import { Segmented, type SegmentedOption } from "./Segmented";

/**
 * `branch` is "*" for every task, "" for tasks without a branch, or a branch name. `goal` is "*"
 * or the id of the goal the board is open on ("" for the tasks without one).
 */
export type BoardFilter = {
  assignee: "all" | TaskAssignee;
  category: string;
  branch: string;
  goal: string;
};
export const defaultFilter: BoardFilter = {
  assignee: "all",
  category: "*",
  branch: "*",
  goal: "*",
};

export type ProjectMode = "project" | "board" | "git" | "notes";

/** The two threads of the app: a ring for you, a diamond for the agent. */
export function Glyph({ who }: { who: TaskAssignee }) {
  return <span className={`glyph ${who}`} aria-hidden="true" />;
}

/**
 * Head of a project page: name and a one-line summary, the Board/History switch and, on the
 * board, the category chips (with their manager) and the branch and assignee filters.
 */
export function ProjectHeader({
  project,
  color,
  tasks,
  goals,
  goal,
  mode,
  filter,
  onMode,
  onFilter,
  onManageCategories,
  onReveal,
  onShowConcluded,
  onNewGoal,
}: {
  project: Project;
  color: string;
  /** The project's board tasks, unfiltered. */
  tasks: Task[];
  /** The project's goals. */
  goals: Goal[];
  /**
   * The goal the board is filtered by: its name follows the project's in the title and switches
   * to another goal or edits it, its progress and date sit beside it, its description ends the
   * line below and concluding or reopening it sits beside the view switch.
   */
  goal?: {
    id: string;
    name: string;
    description: string;
    summary: ReactNode;
    actions: ReactNode;
    onEdit: () => void;
    onDelete: () => void;
    onClear: () => void;
  };
  mode: ProjectMode;
  filter: BoardFilter;
  onMode: (mode: ProjectMode) => void;
  onFilter: (patch: Partial<BoardFilter>) => void;
  onManageCategories: () => void;
  /** Shows the folder in Finder (Explorer elsewhere). */
  onReveal: (path: string) => void;
  /** Opens every concluded goal, from the goal menus. */
  onShowConcluded: () => void;
  onNewGoal: () => void;
}) {
  const goalSwitch = useRef<HTMLButtonElement>(null);
  const [goalMenu, setGoalMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  const goalPicker = useRef<HTMLButtonElement>(null);
  const [pickerMenu, setPickerMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  // The folder under the goal menu stays still while the menu is open, and until the pointer leaves
  // it once the menu closes; the press that closes the menu, outside it, doesn't reveal it either.
  const [quiet, setQuiet] = useState(false);
  const overFolder = useRef(false);
  const menuClosedAt = useRef(-1);
  const pressedAt = useRef(0);
  const reveal = (path: string) => ({
    className: `page-repo ${quiet ? "quiet" : ""}`,
    "data-tooltip": quiet ? undefined : path,
    onPointerEnter: () => {
      overFolder.current = true;
    },
    onPointerLeave: () => {
      overFolder.current = false;
      if (!pickerMenu) setQuiet(false);
    },
    onPointerDown: (event: { timeStamp: number }) => {
      pressedAt.current = event.timeStamp;
    },
    onClick: (event: { detail: number }) => {
      if (event.detail > 0 && menuClosedAt.current >= pressedAt.current) return;
      onReveal(path);
    },
  });
  // With a goal open, the summary line counts that goal's tasks.
  const counted = goal
    ? tasks.filter((task) => task.goalId === goal.id)
    : tasks;
  const withAgent = counted.filter(
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
            {goal ? (
              <>
                <button
                  type="button"
                  className="page-crumb truncate"
                  data-tooltip={t("Show every task")}
                  onClick={goal.onClear}
                >
                  {project.name}
                </button>
                <Icon name="chevronRight" size={14} />
                <button
                  ref={goalSwitch}
                  type="button"
                  className="page-goal-switch"
                  aria-haspopup="menu"
                  aria-expanded={!!goalMenu}
                  onClick={() => {
                    if (goalMenu) return setGoalMenu(null);
                    const rect = goalSwitch.current!.getBoundingClientRect();
                    setGoalMenu({ x: rect.left, y: rect.bottom + 6 });
                  }}
                >
                  <span className="truncate">{goal.name}</span>
                  <Icon name="chevronUpDown" size={14} />
                </button>
                {goal.summary}
              </>
            ) : (
              <>
                <span className="truncate">{project.name}</span>
                {mode === "board" && goals.length > 0 && (
                  <button
                    ref={goalPicker}
                    type="button"
                    className="icon-button small page-goal-open"
                    aria-label={t("Open a goal")}
                    aria-haspopup="menu"
                    aria-expanded={!!pickerMenu}
                    data-tooltip={pickerMenu ? undefined : t("Open a goal")}
                    onClick={() => {
                      if (pickerMenu) return setPickerMenu(null);
                      const rect = goalPicker.current!.getBoundingClientRect();
                      setPickerMenu({ x: rect.left, y: rect.bottom + 6 });
                      setQuiet(true);
                    }}
                  >
                    <Icon name="target" size={14} />
                  </button>
                )}
              </>
            )}
          </h1>
          <p>
            {counted.length === 1
              ? t("1 task")
              : t("{0} tasks", [counted.length])}
            {withAgent > 0 && t(", {0} with the agent", [withAgent])}
            {!goal && mode === "notes" && project.documentsFolder && (
              <button
                type="button"
                aria-label={`${revealLabel()}: ${project.documentsFolder}`}
                {...reveal(project.documentsFolder)}
              >
                <Icon name="vault" size={12} />
                <span className="truncate">
                  {project.documentsFolder.split(/[\\/]/).filter(Boolean).pop()}
                </span>
              </button>
            )}
            {!goal && mode === "board" && project.repositoryPath && (
              <button
                type="button"
                aria-label={`${revealLabel()}: ${project.repositoryPath}`}
                {...reveal(project.repositoryPath)}
              >
                <Icon name="folder" size={12} />
                <span className="truncate">
                  {project.repositoryPath.split(/[\\/]/).filter(Boolean).pop()}
                </span>
              </button>
            )}
            {goal?.description && (
              <span
                className="page-goal-description truncate"
                title={goal.description}
              >
                {goal.description}
              </span>
            )}
          </p>
        </div>
        {goal?.actions}
        {goal && goalMenu && (
          <ContextMenu
            x={goalMenu.x}
            y={goalMenu.y}
            anchor={goalSwitch}
            label={t("Goals")}
            items={[
              ...goalChoices(goals, goal.id, (id) => onFilter({ goal: id }), {
                recent: 3,
                onShowAll: onShowConcluded,
                onNew: onNewGoal,
              }),
              {
                label: t("Edit goal…"),
                icon: "pencil" as const,
                separated: true,
                onSelect: goal.onEdit,
              },
              {
                label: t("Show every task"),
                icon: "board" as const,
                onSelect: goal.onClear,
              },
              {
                label: t("Delete goal…"),
                icon: "trash" as const,
                danger: true,
                separated: true,
                onSelect: goal.onDelete,
              },
            ]}
            onClose={(restoreFocus) => {
              if (restoreFocus) goalSwitch.current?.focus();
              setGoalMenu(null);
            }}
          />
        )}
        {pickerMenu && (
          <ContextMenu
            x={pickerMenu.x}
            y={pickerMenu.y}
            anchor={goalPicker}
            label={t("Open a goal")}
            items={goalChoices(goals, null, (id) => onFilter({ goal: id }), {
              recent: 3,
              onShowAll: onShowConcluded,
              onNew: onNewGoal,
            })}
            onClose={(restoreFocus) => {
              if (restoreFocus) goalPicker.current?.focus();
              menuClosedAt.current = performance.now();
              setQuiet(overFolder.current);
              setPickerMenu(null);
            }}
          />
        )}
        <Segmented
          label={t("Project view")}
          options={[
            tab(
              "project",
              t("Project"),
              shortcuts.projectPage,
              t("Project  {0}", [shortcutLabel(shortcuts.projectPage)]),
            ),
            tab(
              "board",
              t("Board"),
              shortcuts.board,
              t("Board  {0}", [shortcutLabel(shortcuts.board)]),
            ),
            tab(
              "git",
              t("History"),
              shortcuts.git,
              t("Git history  {0}", [shortcutLabel(shortcuts.git)]),
            ),
            tab(
              "notes",
              t("Notes"),
              shortcuts.projectNotes,
              t("Project notes  {0}", [shortcutLabel(shortcuts.projectNotes)]),
            ),
          ]}
          value={mode}
          onChange={onMode}
        />
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
          <Segmented
            size="small"
            label={t("Assignee")}
            options={[
              { value: "all", label: t("Everyone") },
              {
                value: "user",
                label: (
                  <>
                    <Glyph who="user" />
                    {t("You")}
                  </>
                ),
              },
              {
                value: "agent",
                label: (
                  <>
                    <Glyph who="agent" />
                    {t("Agent")}
                  </>
                ),
              },
            ]}
            value={filter.assignee}
            onChange={(assignee) => onFilter({ assignee })}
          />
        </div>
      )}
    </div>
  );
}

/** A project tab with its shortcut shown inline and in the tooltip. */
function tab(
  value: ProjectMode,
  label: string,
  keys: (typeof shortcuts)[keyof typeof shortcuts],
  tooltip: string,
): SegmentedOption<ProjectMode> {
  return {
    value,
    label: (
      <>
        {label}
        <KeyHint keys={keys} />
      </>
    ),
    props: {
      "aria-keyshortcuts": ariaKeys(keys),
      "data-tooltip": tooltip,
      ...(value === "notes" && { "data-tooltip-align": "end" }),
    } as ButtonHTMLAttributes<HTMLButtonElement>,
  };
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
