import {
  Fragment,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { Project } from "../lib/types";
import {
  ariaKeys,
  projectShortcut,
  shortcutLabel,
  shortcuts,
} from "../lib/shortcuts";
import { Icon, type IconName } from "./Icon";
import { KeyHint } from "./KeyHint";
import { ProjectMark } from "./ProjectMark";
import { t } from "../lib/i18n";
import { SidebarLeaving } from "./SidebarSlot";
import type { PreferencesSection } from "./Preferences";

export type Destination =
  | { kind: "overview" }
  | { kind: "archive" }
  | { kind: "notes" }
  | { kind: "preferences"; section?: PreferencesSection }
  | { kind: "project"; id: string };

interface SidebarProps {
  projects: Project[];
  /** Open tasks (not done) per project id. */
  openCounts: Record<string, number>;
  workingCount: number;
  updateAvailable?: boolean;
  destination: Destination;
  onNavigate: (destination: Destination) => void;
  onAddProject: () => void;
  onEditProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  onMoveProject: (project: Project) => void;
  /** Under the open project's row: its goals. */
  projectExtra?: ReactNode;
  /** The workspace switcher, above everything else. */
  workspace?: ReactNode;
  onShortcuts: () => void;
  /** Icons only, with names in tooltips: the Notes tab keeps it beside its own notes list. */
  rail?: boolean;
  /** The pointer resting on the open project's mark in the rail: shows its hidden notes list. */
  onPeek?: () => void;
  onPeekLeave?: () => void;
}

// Project swatches stay clear of blue (you) and purple (the agent).
export const projectHues = [
  "#E8B665",
  "#7FCF9B",
  "#EE8D7E",
  "#6CC8D6",
  "#E79AC2",
  "#C8C27A",
];
export const projectColor = (project?: Project) =>
  projectHues[(project?.color ?? 0) % projectHues.length];

/**
 * Navigation on the window background, beside the content island. Hiding it (⌘B) removes it
 * entirely. On a project's Notes tab it narrows to a rail of icons that stays put, so the notes
 * list is the one panel that hides.
 */
export function Sidebar({
  projects,
  openCounts,
  workingCount,
  updateAvailable = false,
  destination,
  onNavigate,
  onAddProject,
  onEditProject,
  onDeleteProject,
  onMoveProject,
  projectExtra,
  workspace,
  onShortcuts,
  rail = false,
  onPeek,
  onPeekLeave,
}: SidebarProps) {
  const [menu, setMenu] = useState<{
    project: Project;
    x: number;
    y: number;
    trigger: HTMLElement;
  } | null>(null);
  const agentLine =
    workingCount === 1
      ? t("The agent is on 1 task")
      : t("The agent is on {0} tasks", [workingCount]);
  return (
    <nav
      className={`sidebar ${rail ? "rail" : ""}`}
      aria-label={t("Navigation")}
    >
      {workspace}
      <div className="sidebar-group">
        <NavItem
          rail={rail}
          icon="overview"
          label={t("Overview")}
          keys={shortcuts.overview}
          selected={destination.kind === "overview"}
          onClick={() => onNavigate({ kind: "overview" })}
        />
        <NavItem
          rail={rail}
          icon="archive"
          label={t("Archive")}
          target="archive"
          keys={shortcuts.archive}
          selected={destination.kind === "archive"}
          onClick={() => onNavigate({ kind: "archive" })}
        />
        <NavItem
          rail={rail}
          icon="vault"
          label={t("Vaults")}
          keys={shortcuts.notes}
          selected={destination.kind === "notes"}
          onClick={() => onNavigate({ kind: "notes" })}
        />
      </div>

      <div className="sidebar-section">
        <span>{t("Projects")}</span>
        <button
          type="button"
          className="icon-button small"
          aria-label={t("Add project")}
          aria-keyshortcuts={ariaKeys(shortcuts.newProject)}
          data-tooltip={t("Add project  {0}", [
            shortcutLabel(shortcuts.newProject),
          ])}
          onClick={onAddProject}
        >
          <Icon name="plus" size={13} />
        </button>
      </div>
      <div className="sidebar-group grow scroll">
        {projects.map((project, index) => {
          const open =
            destination.kind === "project" && destination.id === project.id;
          return (
            <Fragment key={project.id}>
              <NavItem
                rail={rail}
                onHover={open ? onPeek : undefined}
                onLeave={open ? onPeekLeave : undefined}
                label={project.name}
                keys={projectShortcut(index)}
                count={openCounts[project.id] || undefined}
                leading={<ProjectMark project={project} />}
                menuOpen={menu?.project.id === project.id}
                onContextMenu={(event) => {
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  // The context-menu key reports no pointer position; open under the row then.
                  const keyboard = event.clientX === 0 && event.clientY === 0;
                  setMenu({
                    project,
                    x: keyboard ? rect.left + 12 : event.clientX,
                    y: keyboard ? rect.bottom : event.clientY,
                    trigger: event.currentTarget,
                  });
                }}
                selected={open}
                onClick={() => onNavigate({ kind: "project", id: project.id })}
              />
              {open && !rail && projectExtra}
            </Fragment>
          );
        })}
        {projects.length === 0 && (
          <button
            type="button"
            className="sidebar-empty"
            onClick={onAddProject}
          >
            <DashedOutline />
            {t("Add your first project")}
          </button>
        )}
      </div>

      {workingCount > 0 && (
        <div
          className="agent-status"
          role="status"
          data-tooltip={rail ? agentLine : undefined}
          data-tooltip-side="right"
        >
          <span className="agent-pulse" aria-hidden="true" />
          <span>{agentLine}</span>
        </div>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={t("Actions for {0}", [menu.project.name])}
          items={[
            {
              label: t("Edit project…"),
              icon: "pencil",
              onSelect: () => onEditProject(menu.project),
            },
            {
              label: t("Move to another workspace…"),
              icon: "arrowRight",
              onSelect: () => onMoveProject(menu.project),
            },
            {
              label: t("Delete project…"),
              icon: "trash",
              danger: true,
              onSelect: () => onDeleteProject(menu.project),
            },
          ]}
          onClose={(restoreFocus) => {
            if (restoreFocus) menu.trigger.focus();
            setMenu(null);
          }}
        />
      )}
      <div className="sidebar-footer">
        <NavItem
          rail={rail}
          icon="gear"
          label={t("Preferences")}
          notice={updateAvailable}
          keys={shortcuts.preferences}
          selected={destination.kind === "preferences"}
          onClick={() =>
            onNavigate({
              kind: "preferences",
              ...(updateAvailable && { section: "updates" }),
            })
          }
        />
        <NavItem
          rail={rail}
          icon="keyboard"
          label={t("Keyboard shortcuts")}
          keys={shortcuts.help}
          onClick={onShortcuts}
        />
      </div>
    </nav>
  );
}

interface NavItemProps {
  label: string;
  icon?: IconName;
  leading?: ReactNode;
  count?: number;
  /** Lets the board find the row a concluded card flies to. */
  target?: string;
  notice?: boolean;
  selected?: boolean;
  keys?: string[];
  menuOpen?: boolean;
  rail?: boolean;
  /** Hovering shows something of its own, so the row skips its name tooltip. */
  onHover?: () => void;
  onLeave?: () => void;
  onClick?: () => void;
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
}

/** Sidebar row. Its shortcut shows in a tooltip on hover and as a badge while ⌘ is held. */
export function NavItem({
  label,
  icon,
  leading,
  count,
  target,
  notice = false,
  selected,
  keys,
  menuOpen,
  rail,
  onHover,
  onLeave,
  onClick,
  onContextMenu,
}: NavItemProps) {
  const hint = keys && shortcutLabel(keys);
  return (
    <button
      type="button"
      className={`nav-item ${selected ? "selected" : ""} ${menuOpen ? "menu-open" : ""}`}
      aria-current={selected ? "page" : undefined}
      data-nav={target}
      aria-label={
        count !== undefined
          ? `${label}, ${count}`
          : notice
            ? `${label}, ${t("Update available")}`
            : label
      }
      aria-keyshortcuts={keys && ariaKeys(keys)}
      data-tooltip={
        onHover
          ? undefined
          : hint
            ? `${label}  ${hint}`
            : rail
              ? label
              : undefined
      }
      data-tooltip-side="right"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <span className="nav-leading">
        {leading ?? (icon && <Icon name={icon} size={15} />)}
        {notice && <span className="nav-update-indicator" />}
      </span>
      <span className="nav-label">{label}</span>
      {count !== undefined && <span className="nav-count">{count}</span>}
      <KeyHint keys={keys} />
    </button>
  );
}

export interface MenuItem {
  label: string;
  /** Left out, the row keeps the icon's room so labels stay aligned. */
  icon?: IconName;
  /** Drawn in the icon's place, for rows that stand for something with its own mark. */
  leading?: ReactNode;
  /** The current choice among the rows: a check at the end. */
  checked?: boolean;
  /** A shortcut or gesture that does the same, shown at the end. */
  hint?: string;
  danger?: boolean;
  /** Grayed, for rows that stand for something finished. */
  muted?: boolean;
  /** Starts a new group: a line is drawn above it. */
  separated?: boolean;
  /** Names the group it starts, above its first row. */
  section?: string;
  onSelect: () => void;
}

/**
 * Menu opened by a right click, at the pointer and kept inside the window. Arrows move, Enter
 * chooses; Escape, Tab, a click outside, scrolling or leaving the window closes it.
 */
export function ContextMenu({
  x,
  y,
  label,
  items,
  onClose,
  anchor,
  heading,
  width,
  className = "",
}: {
  x: number;
  y: number;
  label: string;
  items: MenuItem[];
  onClose: (restoreFocus: boolean) => void;
  /** The button that opened the menu: pressing it again is left to its own click, which closes. */
  anchor?: RefObject<HTMLElement | null>;
  /** A quiet title above the rows. */
  heading?: string;
  width?: number;
  className?: string;
}) {
  const leaving = useContext(SidebarLeaving);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const margin = 8;
    setPosition({
      left: Math.max(
        margin,
        Math.min(x, window.innerWidth - menu.offsetWidth - margin),
      ),
      top: Math.max(
        margin,
        Math.min(y, window.innerHeight - menu.offsetHeight - margin),
      ),
    });
    (
      menu.querySelector<HTMLElement>("[aria-checked=true]") ??
      menu.querySelector<HTMLElement>("[role^=menuitem]")
    )?.focus({ preventScroll: true });
  }, [x, y]);
  useEffect(() => {
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || anchor?.current?.contains(target))
        return;
      onClose(false);
    };
    const dismiss = () => onClose(false);
    document.addEventListener("pointerdown", outside, true);
    // Scrolling anywhere but the menu moves the row away from it, so the menu goes too.
    document.addEventListener("scroll", outside, true);
    window.addEventListener("blur", dismiss);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("scroll", outside, true);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("resize", dismiss);
    };
  }, [onClose, anchor]);
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const options = [
      ...event.currentTarget.querySelectorAll<HTMLElement>("[role^=menuitem]"),
    ];
    const index = options.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => {
      event.preventDefault();
      options[(next + options.length) % options.length]?.focus();
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(options.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
    } else if (event.key === "Tab") {
      event.preventDefault();
      onClose(true);
    }
  }
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={`popover-list context-menu ${leaving ? "leaving" : ""} ${className}`}
      style={{ position: "fixed", ...position, width }}
      onKeyDown={keyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {heading && (
        <div className="menu-heading" aria-hidden="true">
          {heading}
        </div>
      )}
      {items.map((item, index) => [
        item.separated && index > 0 && (
          <div
            key={`${item.label}-line`}
            role="separator"
            className="menu-separator"
          />
        ),
        item.section && (
          <div
            key={`${item.label}-section`}
            className="menu-heading"
            aria-hidden="true"
          >
            {item.section}
          </div>
        ),
        <button
          key={item.label}
          type="button"
          role={item.checked === undefined ? "menuitem" : "menuitemradio"}
          aria-checked={item.checked}
          tabIndex={-1}
          className={`popover-option ${item.danger ? "danger" : ""} ${item.muted ? "muted" : ""}`}
          onClick={() => {
            onClose(false);
            item.onSelect();
          }}
        >
          {item.leading ??
            (item.icon ? (
              <Icon name={item.icon} size={14} />
            ) : (
              <span className="menu-icon-space" aria-hidden="true" />
            ))}
          <span className="popover-label">{item.label}</span>
          {item.hint && <kbd className="popover-hint">{item.hint}</kbd>}
          {item.checked && (
            <span className="menu-check" aria-hidden="true">
              <Icon name="check" size={14} />
            </span>
          )}
        </button>,
      ])}
    </div>,
    document.body,
  );
}

/**
 * A dashed border whose dashes always close evenly: CSS spaces them at a fixed length and leaves a
 * gap where the perimeter runs out. `pathLength` makes the dash count fixed instead, so they
 * stretch a little to fit. Drawn on the half pixel, so the 1px line stays sharp.
 */
function DashedOutline() {
  return (
    <svg className="dashed-outline" aria-hidden="true">
      <rect
        width="100%"
        height="100%"
        rx="6.5"
        pathLength="100"
        strokeDasharray="0.8 0.6286"
      />
    </svg>
  );
}
