import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { usePopover } from "../hooks/usePopover";
import { inTauri } from "../lib/api";
import {
  ariaKeys,
  isWindows,
  shortcutLabel,
  shortcuts,
} from "../lib/shortcuts";
import { Icon } from "./Icon";
import type { Project } from "../lib/types";
import { KeyHint } from "./KeyHint";
import { ProjectMark } from "./ProjectMark";
import { t } from "../lib/i18n";

export interface Crumb {
  label: string;
  /** The project a crumb names, shown with its mark. */
  project?: Project;
  onClick?: () => void;
}

export interface MenuEntry {
  label: string;
  keys?: string[];
  onSelect: () => void;
}

/**
 * The thin bar across the whole window: traffic lights (drawn by macOS over the overlay title
 * bar), sidebar and history buttons, where you are, and the global actions, then the window
 * buttons on Windows, which has no system title bar here. Empty space drags the window.
 */
export function Topbar({
  sidebarHidden,
  sidebarName = t("sidebar"),
  sidebarFixed = false,
  canBack,
  canForward,
  crumbs,
  menu,
  onToggleSidebar,
  onSidebarHover,
  onSidebarLeave,
  onBack,
  onForward,
  onSearch,
  onNewTask,
}: {
  sidebarHidden: boolean;
  /** What the sidebar button hides: the sidebar, or the notes list beside the icon rail. */
  sidebarName?: string;
  /** The sidebar can't be hidden here, as in Preferences. */
  sidebarFixed?: boolean;
  canBack: boolean;
  canForward: boolean;
  crumbs: Crumb[];
  menu: MenuEntry[];
  onToggleSidebar: () => void;
  /** The pointer resting on the sidebar button, which shows a hidden sidebar for a moment. */
  onSidebarHover: () => void;
  onSidebarLeave: () => void;
  onBack: () => void;
  onForward: () => void;
  onSearch: () => void;
  onNewTask: () => void;
}) {
  const sidebarLabel = `${sidebarHidden ? t("Show") : t("Hide")} ${sidebarName}`;
  return (
    <header className="topbar" data-tauri-drag-region>
      <span className="traffic-space" data-tauri-drag-region />
      <button
        type="button"
        className="icon-button sidebar-button"
        onClick={onToggleSidebar}
        disabled={sidebarFixed}
        onMouseEnter={onSidebarHover}
        onMouseLeave={onSidebarLeave}
        aria-label={sidebarLabel}
        aria-pressed={!sidebarHidden}
        aria-keyshortcuts={ariaKeys(shortcuts.sidebar)}
        // Hidden, the sidebar itself slides out on hover, so a tooltip would only cover it.
        data-tooltip={
          sidebarHidden
            ? undefined
            : `${sidebarLabel}  ${shortcutLabel(shortcuts.sidebar)}`
        }
      >
        <Icon name="sidebar" size={16} />
        <KeyHint keys={shortcuts.sidebar} />
      </button>
      <button
        type="button"
        className="icon-button"
        onClick={onBack}
        disabled={!canBack}
        aria-label={t("Back")}
        aria-keyshortcuts={ariaKeys(shortcuts.back)}
        data-tooltip={t("Back  {0}", [shortcutLabel(shortcuts.back)])}
      >
        <Icon name="chevronLeft" size={16} />
        <KeyHint keys={shortcuts.back} />
      </button>
      <button
        type="button"
        className="icon-button forward-button"
        onClick={onForward}
        disabled={!canForward}
        aria-label={t("Forward")}
        aria-keyshortcuts={ariaKeys(shortcuts.forward)}
        data-tooltip={t("Forward  {0}", [shortcutLabel(shortcuts.forward)])}
      >
        <Icon name="chevronRight" size={16} />
        <KeyHint keys={shortcuts.forward} />
      </button>
      <span className="topbar-divider" aria-hidden="true" />
      <nav className="crumbs" aria-label={t("Local")} data-tauri-drag-region>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          const content = (
            <>
              {crumb.project && <ProjectMark project={crumb.project} />}
              <span className="truncate">{crumb.label}</span>
            </>
          );
          return (
            <span key={index} className="crumb-item">
              {index > 0 && (
                <span className="crumb-sep" aria-hidden="true">
                  /
                </span>
              )}
              {crumb.onClick && !last ? (
                <button
                  type="button"
                  className={`crumb ${index === 0 ? "lead" : ""}`}
                  onClick={crumb.onClick}
                >
                  {content}
                </button>
              ) : (
                <span
                  className={`crumb ${index === 0 ? "lead" : ""} ${last ? "current" : ""}`}
                  aria-current={last ? "page" : undefined}
                >
                  {content}
                </span>
              )}
            </span>
          );
        })}
      </nav>
      <div className="topbar-spacer" data-tauri-drag-region />
      <button
        type="button"
        className="search-pill"
        onClick={onSearch}
        aria-label={t("Search")}
        aria-keyshortcuts={ariaKeys(shortcuts.search)}
      >
        <Icon name="search" size={14} />
        <span className="search-pill-label">{t("Search")}</span>
        <kbd>{shortcutLabel(shortcuts.search)}</kbd>
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={t("New task")}
        aria-keyshortcuts={ariaKeys(shortcuts.newTask)}
        data-tooltip={t("New task  {0}", [shortcutLabel(shortcuts.newTask)])}
        data-tooltip-align="end"
        onClick={onNewTask}
      >
        <Icon name="compose" size={16} />
        <KeyHint keys={shortcuts.newTask} />
      </button>
      <MoreMenu entries={menu} />
      {isWindows && inTauri() && (
        <>
          <span className="topbar-divider" aria-hidden="true" />
          <WindowControls />
        </>
      )}
    </header>
  );
}

/** Minimize, maximize or restore, and close, drawn like the system's own on Windows. */
function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const window = getCurrentWindow();
      const sync = () =>
        void window.isMaximized().then((value) => {
          if (!disposed) setMaximized(value);
        });
      sync();
      const fn = await window.onResized(sync);
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
  const run = (action: "minimize" | "toggleMaximize" | "close") =>
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
      getCurrentWindow()[action](),
    );
  return (
    <div className="window-controls">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("Minimize")}
        onClick={() => run("minimize")}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5.5h10" />
        </svg>
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label={maximized ? t("Restore") : t("Maximize")}
        onClick={() => run("toggleMaximize")}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          {maximized ? (
            <path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" />
          ) : (
            <path d="M.5.5h9v9h-9z" />
          )}
        </svg>
      </button>
      <button
        type="button"
        tabIndex={-1}
        className="close"
        aria-label={t("Close")}
        onClick={() => run("close")}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M.5.5l9 9M9.5.5l-9 9" />
        </svg>
      </button>
    </div>
  );
}

export function MoreMenu({
  entries,
  label = t("More options"),
}: {
  entries: MenuEntry[];
  label?: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const close = useCallback(() => setOpen(false), []);
  const { style, container } = usePopover(open, trigger, list, close, {
    minWidth: 230,
  });
  function pick(index: number) {
    setOpen(false);
    trigger.current?.focus();
    entries[index]?.onSelect();
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
    const last = entries.length - 1;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (index + step + entries.length) % entries.length);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : last);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === "Tab") setOpen(false);
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`icon-button ${open ? "active" : ""}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-activedescendant={open ? `more-${active}` : undefined}
        data-tooltip={open ? undefined : label}
        data-tooltip-align="end"
        onClick={() => {
          trigger.current?.focus();
          setActive(0);
          setOpen((value) => !value);
        }}
        onKeyDown={keyDown}
      >
        <Icon name="more" size={16} />
      </button>
      {open &&
        container &&
        createPortal(
          <div
            ref={list}
            role="menu"
            aria-label={label}
            className="popover-list menu-list"
            style={style}
            onMouseDown={(event) => event.preventDefault()}
          >
            {entries.map((entry, index) => (
              <div
                key={entry.label}
                id={`more-${index}`}
                role="menuitem"
                className={`popover-option ${index === active ? "active" : ""}`}
                onMouseMove={() => setActive(index)}
                onClick={() => pick(index)}
              >
                <span className="popover-label">{entry.label}</span>
                {entry.keys && (
                  <kbd className="menu-keys">{shortcutLabel(entry.keys)}</kbd>
                )}
              </div>
            ))}
          </div>,
          container,
        )}
    </>
  );
}
