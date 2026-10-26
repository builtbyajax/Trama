import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { searchKey, usePopover } from "../hooks/usePopover";
import { errorMessage, listBranches } from "../lib/api";
import { Icon } from "./Icon";
import { t } from "../lib/i18n";

/**
 * The task's branch as a chip. It lists the repository's local branches, read again on every
 * open; there is no way to type a new one, because the app never creates branches. A branch
 * that left the repository stays on the task, marked as gone unless the task is done (merged).
 */
export function BranchMenu({
  projectId,
  value,
  branches,
  done = false,
  onChange,
}: {
  projectId: string;
  value: string | null;
  /** Last known local branches; null while unknown. */
  branches: string[] | null;
  done?: boolean;
  onChange: (value: string | null) => void;
}) {
  const listId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [fresh, setFresh] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const close = useCallback(() => setOpen(false), []);
  const { style, container } = usePopover(open, trigger, popup, close, {
    minWidth: 260,
  });
  const known = fresh ?? branches;
  const gone = Boolean(value && known && !done && !known.includes(value));
  const key = searchKey(query);
  const options: (string | null)[] = [
    ...(key ? [] : [null]),
    ...(known ?? []).filter((name) => searchKey(name).includes(key)),
  ];
  useEffect(() => {
    if (open)
      popup.current
        ?.querySelector(`[data-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);
  function show() {
    setQuery("");
    setError("");
    setActive(Math.max(0, value ? (known ?? []).indexOf(value) + 1 : 0));
    setOpen(true);
    listBranches(projectId).then(
      (names) => {
        setFresh(names);
        if (value) setActive(Math.max(0, names.indexOf(value) + 1));
      },
      (e) => setError(errorMessage(e)),
    );
  }
  function choose(index: number) {
    if (index >= options.length) return;
    const option = options[index];
    setOpen(false);
    trigger.current?.focus();
    if (option !== value) onChange(option);
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => Math.max(0, Math.min(options.length - 1, i + step)));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === "Tab") setOpen(false);
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`prop-chip branch-chip ${open ? "open" : ""} ${gone ? "gone" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={
          value
            ? gone
              ? t("Branch: {0}, no longer in the repository", [value])
              : t("Branch: {0}", [value])
            : t("Branch: none")
        }
        data-tooltip={
          gone ? t("This branch no longer exists in the repository") : undefined
        }
        onClick={() => {
          trigger.current?.focus();
          if (open) setOpen(false);
          else show();
        }}
      >
        <Icon name="branch" size={12} />
        {value ? (
          <code className="truncate">{value}</code>
        ) : (
          <span className="prop-chip-key">{t("No branch")}</span>
        )}
        <Icon name="chevronDown" size={12} />
      </button>
      {open &&
        container &&
        createPortal(
          <div ref={popup} className="popover-list category-menu" style={style}>
            <input
              autoFocus
              role="combobox"
              aria-label={t("Search local branches")}
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={
                active < options.length ? `${listId}-o${active}` : undefined
              }
              autoComplete="off"
              spellCheck={false}
              placeholder={t("Search local branches…")}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={keyDown}
            />
            <div
              id={listId}
              role="listbox"
              aria-label={t("Local branches")}
              className="scroll"
              onMouseDown={(event) => event.preventDefault()}
            >
              {options.map((option, index) => (
                <div
                  key={option ?? ""}
                  id={`${listId}-o${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={option === value}
                  className={`popover-option ${index === active ? "active" : ""}`}
                  onMouseMove={() => setActive(index)}
                  onClick={() => choose(index)}
                >
                  {option === null ? (
                    <span className="popover-label muted">
                      {t("No branch")}
                    </span>
                  ) : (
                    <code className="popover-label">{option}</code>
                  )}
                  {option === value && <Icon name="check" size={13} />}
                </div>
              ))}
              {error ? (
                <p className="popover-empty">{error}</p>
              ) : !known ? (
                <p className="popover-empty">{t("Reading branches…")}</p>
              ) : (
                key &&
                options.length === 0 && (
                  <p className="popover-empty">
                    {t(
                      "No local branch with that name. Create the branch in Git and it shows up here.",
                    )}
                  </p>
                )
              )}
            </div>
          </div>,
          container,
        )}
    </>
  );
}
