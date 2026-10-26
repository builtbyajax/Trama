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
 * The task's category as a chip. It opens a search over the project's categories (accent
 * insensitive) and offers to create the typed name when it does not exist yet.
 */
export function CategoryMenu({
  value,
  categories,
  onChange,
}: {
  value: string;
  categories: string[];
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const close = useCallback(() => setOpen(false), []);
  const { style, container } = usePopover(open, trigger, popup, close, {
    minWidth: 240,
  });
  const key = searchKey(query);
  const matches = categories.filter((name) => searchKey(name).includes(key));
  const create =
    query.trim() && !categories.some((name) => searchKey(name) === key)
      ? query.trim()
      : null;
  const options = [
    ...matches.map((name) => ({ name, create: false })),
    ...(create ? [{ name: create, create: true }] : []),
  ];
  useEffect(() => {
    if (open)
      popup.current
        ?.querySelector(`[data-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);
  function choose(index: number) {
    const option = options[index];
    setOpen(false);
    trigger.current?.focus();
    if (option && option.name !== value) onChange(option.name);
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
        className={`prop-chip ${open ? "open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("Category: {0}", [value])}
        onClick={() => {
          trigger.current?.focus();
          if (open) return setOpen(false);
          setQuery("");
          setActive(Math.max(0, categories.indexOf(value)));
          setOpen(true);
        }}
      >
        <span className="prop-chip-key">{t("Category")}</span>
        {value}
        <Icon name="chevronDown" size={12} />
      </button>
      {open &&
        container &&
        createPortal(
          <div ref={popup} className="popover-list category-menu" style={style}>
            <input
              autoFocus
              role="combobox"
              aria-label={t("Search or create a category")}
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={
                options[active] ? `${listId}-o${active}` : undefined
              }
              autoComplete="off"
              spellCheck={false}
              maxLength={80}
              placeholder={t("Search or create…")}
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
              aria-label={t("Categories")}
              className="scroll"
              onMouseDown={(event) => event.preventDefault()}
            >
              {options.map((option, index) => (
                <div
                  key={`${option.create}-${option.name}`}
                  id={`${listId}-o${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={!option.create && option.name === value}
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
                  {!option.create && option.name === value && (
                    <Icon name="check" size={13} />
                  )}
                </div>
              ))}
              {options.length === 0 && (
                <p className="popover-empty">{t("No categories.")}</p>
              )}
            </div>
          </div>,
          container,
        )}
    </>
  );
}
