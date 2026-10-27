import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { searchKey, usePopover } from "../hooks/usePopover";
import { Icon } from "./Icon";
import { t } from "../lib/i18n";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Optional status color shown as a dot before the label. */
  dot?: string;
  /** Optional mark before the label, such as the assignee glyph. */
  icon?: ReactNode;
  /** Short muted text after the label, such as a status. */
  hint?: string;
  /** Heading shown before the first option of a run with the same group. */
  group?: string;
  /** Shown quieter, as a choice that matters less now. */
  muted?: boolean;
}

/** From this many options, a `search` list opens with its field. */
const searchFrom = 8;

/**
 * Select-only combobox (WAI-ARIA APG pattern). Focus stays on the trigger; the list is announced
 * through `aria-activedescendant`. Arrows, Home/End and type-ahead move the active option,
 * Enter/Space/Tab choose it and Escape closes without leaking to the surrounding dialog. With
 * `search` and a long list, a field on top of it takes the focus and narrows it as you type.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  labelledBy,
  describedBy,
  id,
  size = "md",
  className = "",
  disabled = false,
  search,
  align,
  mark,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name when there is no visible label. */
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  id?: string;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
  /** The search field's placeholder; a long list opens with it. */
  search?: string;
  /** "end" opens the list from the trigger's right edge, towards the left. */
  align?: "start" | "end";
  /** Shown in the trigger instead of the chosen option's icon. */
  mark?: ReactNode;
}) {
  const listId = useId();
  const optionId = (index: number) => `${listId}-o${index}`;
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searching = Boolean(search) && options.length >= searchFrom;
  const key = searchKey(query);
  const shown = key
    ? options.filter((option) => searchKey(option.label).includes(key))
    : options;
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [active, setActive] = useState(selectedIndex);
  const close = useCallback(() => setOpen(false), []);
  // A form field's list matches the field; a small chip's list needs room beyond the chip. Lists
  // with group headings run longer, so they get the room to show whole. A searchable list holds
  // names, which need more room still.
  const { style, container } = usePopover(open, trigger, list, close, {
    minWidth: searching ? 230 : size === "sm" ? 180 : 0,
    maxHeight: options.some((option) => option.group) ? 440 : undefined,
    align,
  });
  const selected = options.find((option) => option.value === value);
  useEffect(() => {
    if (open)
      list.current
        ?.querySelector(`[data-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);
  function show(index = selectedIndex) {
    setQuery("");
    setActive(index);
    setOpen(true);
  }
  function choose(index: number) {
    const option = shown[index];
    setOpen(false);
    if (option && option.value !== value) onChange(option.value);
  }
  function searchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => Math.max(0, Math.min(shown.length - 1, i + step)));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(active);
      trigger.current?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === "Tab") setOpen(false);
  }
  function typeAhead(key: string) {
    const now = performance.now();
    typed.current = {
      text: (now - typed.current.at > 700 ? "" : typed.current.text) + key,
      at: now,
    };
    const query = searchKey(typed.current.text);
    const start = open ? active : selectedIndex;
    const ordered = options.map((_, i) => (start + 1 + i) % options.length);
    const match = ordered.find((i) =>
      searchKey(options[i].label).startsWith(query),
    );
    if (match === undefined) return;
    if (open) setActive(match);
    else choose(match);
  }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const last = options.length - 1;
    const move = (index: number) => {
      event.preventDefault();
      if (open) setActive(Math.max(0, Math.min(last, index)));
      else show(Math.max(0, Math.min(last, index)));
    };
    switch (event.key) {
      case "ArrowDown":
        if (event.altKey && !open) return move(selectedIndex);
        return move(open ? active + 1 : selectedIndex);
      case "ArrowUp":
        return move(open ? active - 1 : selectedIndex);
      case "Home":
        return move(0);
      case "End":
        return move(last);
      case "PageDown":
        return move(active + 8);
      case "PageUp":
        return move(active - 8);
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) choose(active);
        else show();
        return;
      case "Escape":
        if (!open) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        return;
      case "Tab":
        if (open) choose(active);
        return;
      default:
        if (
          event.key.length === 1 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey
        ) {
          event.preventDefault();
          typeAhead(event.key);
        }
    }
  }
  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        disabled={disabled}
        className={`select select-${size} ${open ? "open" : ""} ${className}`}
        onClick={() => {
          // WebKit does not focus buttons on click; keyboard use needs the focus here.
          trigger.current?.focus();
          if (open) setOpen(false);
          else show();
        }}
        onKeyDown={keyDown}
      >
        {selected?.dot && (
          <span className="status-dot" style={{ background: selected.dot }} />
        )}
        {mark ?? selected?.icon}
        <span className="select-value">{selected?.label ?? ""}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open &&
        container &&
        createPortal(
          <div
            ref={list}
            className={`popover-list ${searching ? "category-menu" : "scroll"}`}
            style={style}
          >
            {searching && (
              <input
                autoFocus
                role="combobox"
                aria-label={search}
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={
                  active < shown.length ? optionId(active) : undefined
                }
                autoComplete="off"
                spellCheck={false}
                placeholder={search}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={searchKeyDown}
              />
            )}
            <div
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-label={label}
              aria-labelledby={labelledBy}
              className={searching ? "scroll" : undefined}
              onMouseDown={(event) => event.preventDefault()}
            >
              {shown.map((option, index) => [
                option.group && option.group !== shown[index - 1]?.group && (
                  <div
                    key={`group-${option.group}`}
                    role="presentation"
                    className="menu-heading"
                  >
                    {option.group}
                  </div>
                ),
                <div
                  key={option.value}
                  id={optionId(index)}
                  data-index={index}
                  role="option"
                  aria-selected={option.value === value}
                  className={`popover-option ${index === active ? "active" : ""} ${option.muted ? "muted" : ""}`}
                  onMouseMove={() => setActive(index)}
                  onClick={() => {
                    choose(index);
                    trigger.current?.focus();
                  }}
                >
                  {option.dot && (
                    <span
                      className="status-dot"
                      style={{ background: option.dot }}
                    />
                  )}
                  {option.icon}
                  <span className="popover-label">{option.label}</span>
                  {option.hint && (
                    <span className="popover-note">{option.hint}</span>
                  )}
                  {option.value === value && <Icon name="check" size={13} />}
                </div>,
              ])}
              {key && shown.length === 0 && (
                <p className="popover-empty">{t("No results.")}</p>
              )}
            </div>
          </div>,
          container,
        )}
    </>
  );
}
