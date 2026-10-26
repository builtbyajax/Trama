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

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Optional status color shown as a dot before the label. */
  dot?: string;
  /** Optional mark before the label, such as the assignee glyph. */
  icon?: ReactNode;
}

/**
 * Select-only combobox (WAI-ARIA APG pattern). Focus stays on the trigger; the list is announced
 * through `aria-activedescendant`. Arrows, Home/End and type-ahead move the active option,
 * Enter/Space/Tab choose it and Escape closes without leaking to the surrounding dialog.
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
}) {
  const listId = useId();
  const optionId = (index: number) => `${listId}-o${index}`;
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [active, setActive] = useState(selectedIndex);
  const close = useCallback(() => setOpen(false), []);
  // A form field's list matches the field; a small chip's list needs room beyond the chip.
  const { style, container } = usePopover(open, trigger, list, close, {
    minWidth: size === "sm" ? 180 : 0,
  });
  const selected = options.find((option) => option.value === value);
  useEffect(() => {
    if (open)
      list.current
        ?.querySelector(`[data-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);
  function show(index = selectedIndex) {
    setActive(index);
    setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    setOpen(false);
    if (option && option.value !== value) onChange(option.value);
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
        {selected?.icon}
        <span className="select-value">{selected?.label ?? ""}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open &&
        container &&
        createPortal(
          <div
            ref={list}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            aria-labelledby={labelledBy}
            className="popover-list scroll"
            style={style}
            onMouseDown={(event) => event.preventDefault()}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                id={optionId(index)}
                data-index={index}
                role="option"
                aria-selected={option.value === value}
                className={`popover-option ${index === active ? "active" : ""}`}
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
                {option.value === value && <Icon name="check" size={13} />}
              </div>
            ))}
          </div>,
          container,
        )}
    </>
  );
}
