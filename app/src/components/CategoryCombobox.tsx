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
import { Icon } from "./Icon";
import { t } from "../lib/i18n";

/**
 * Editable combobox for free categories: it suggests the project's existing categories (accent
 * insensitive) and keeps any typed name, offering it as a new category when it does not exist.
 */
export function CategoryCombobox({
  id,
  value,
  categories,
  onChange,
  required,
}: {
  id: string;
  value: string;
  categories: string[];
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const listId = useId();
  const field = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [active, setActive] = useState(-1);
  const close = useCallback(() => setOpen(false), []);
  const { style, container } = usePopover(open, field, list, close);
  const key = searchKey(value);
  const exact = categories.find((name) => searchKey(name) === key);
  const matches = filtering
    ? categories.filter((name) => searchKey(name).includes(key))
    : categories;
  const create = value.trim() && !exact ? value.trim() : null;
  const options = [
    ...matches.map((name) => ({ name, create: false })),
    ...(create ? [{ name: create, create: true }] : []),
  ];
  useEffect(() => {
    if (open && active >= 0)
      list.current
        ?.querySelector(`[data-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);
  function show() {
    setFiltering(false);
    setActive(Math.max(0, exact ? categories.indexOf(exact) : 0));
    setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    if (option) onChange(option.name);
    setOpen(false);
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    const last = options.length - 1;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return show();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => Math.max(0, Math.min(last, index + step)));
    } else if (event.key === "Enter" && open && active >= 0 && options.length) {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === "Tab" && open) setOpen(false);
  }
  return (
    <div ref={field} className={`combo-field ${open ? "open" : ""}`}>
      <input
        ref={input}
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={
          open && active >= 0 && options[active]
            ? `${listId}-o${active}`
            : undefined
        }
        autoComplete="off"
        spellCheck={false}
        required={required}
        value={value}
        maxLength={80}
        onChange={(event) => {
          onChange(event.target.value);
          setFiltering(true);
          setActive(0);
          setOpen(true);
        }}
        onClick={() => !open && show()}
        onKeyDown={keyDown}
      />
      <button
        type="button"
        tabIndex={-1}
        className="combo-toggle"
        aria-label={t("Show categories")}
        onClick={() => {
          if (open) setOpen(false);
          else show();
          input.current?.focus();
        }}
      >
        <Icon name="chevronDown" size={12} />
      </button>
      {open &&
        container &&
        options.length > 0 &&
        createPortal(
          <div
            ref={list}
            id={listId}
            role="listbox"
            aria-label={t("Categories")}
            className="popover-list scroll"
            style={style}
            onMouseDown={(event) => event.preventDefault()}
          >
            {options.map((option, index) => (
              <div
                key={`${option.create}-${option.name}`}
                id={`${listId}-o${index}`}
                data-index={index}
                role="option"
                aria-selected={!option.create && option.name === exact}
                className={`popover-option ${index === active ? "active" : ""} ${option.create ? "create" : ""}`}
                onMouseMove={() => setActive(index)}
                onClick={() => choose(index)}
              >
                {option.create && <Icon name="plus" size={13} />}
                <span className="popover-label">
                  {option.create
                    ? t("Create category “{0}”", [option.name])
                    : option.name}
                </span>
                {!option.create && option.name === exact && (
                  <Icon name="check" size={13} />
                )}
              </div>
            ))}
          </div>,
          container,
        )}
    </div>
  );
}
