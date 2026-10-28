import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { usePopover } from "../hooks/usePopover";
import { Icon } from "./Icon";
import { locale, t } from "../lib/i18n";

/** A day as the core keeps it, `YYYY-MM-DD`, in local time. */
export const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const parseDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** Whole days from today to `day`: 0 today, negative once it passed. */
export function daysUntil(day: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((parseDay(day).getTime() - today.getTime()) / 86_400_000);
}

/** "today", "tomorrow", "in 5 days", "3 days ago". */
export function relativeDay(day: string) {
  const days = daysUntil(day);
  if (days === 0) return t("today");
  if (days === 1) return t("tomorrow");
  if (days === -1) return t("yesterday");
  return days > 0 ? t("in {0} days", [days]) : t("{0} days ago|late", [-days]);
}

const longDay = (day: string) =>
  parseDay(day).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const shortDay = (date: Date) =>
  date.toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

/** The quick picks beside the month, counted from today. */
function presets() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return [
    {
      label: t("End of this week"),
      date: addDays(today, (5 - today.getDay() + 7) % 7),
    },
    {
      label: t("End of the month"),
      date: new Date(today.getFullYear(), today.getMonth() + 1, 0),
    },
    { label: t("In 2 weeks"), date: addDays(today, 14) },
    {
      label: t("End of next month"),
      date: new Date(today.getFullYear(), today.getMonth() + 2, 0),
    },
  ];
}

/**
 * A day field: the button shows the chosen day and how far it is; its popover has quick picks
 * beside a month grid. Arrows move through the days, Page Up/Down through the months and Escape
 * closes. `value` is `YYYY-MM-DD` or "" for none.
 */
export function DatePicker({
  value,
  onChange,
  id,
  labelledBy,
  chip = false,
}: {
  value: string;
  onChange: (day: string) => void;
  id?: string;
  labelledBy?: string;
  /** Shows the trigger as a property chip with a flag, as in the task sheet. */
  chip?: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const gridId = useId();
  const [open, setOpen] = useState(false);
  // The day the keyboard is on; the grid shows its month.
  const [cursor, setCursor] = useState(() => value || isoDay(new Date()));
  const close = useCallback(() => setOpen(false), []);
  const { style, container } = usePopover(open, trigger, popup, close, {
    minWidth: 420,
    maxHeight: 340,
  });
  useLayoutEffect(() => {
    if (open)
      popup.current
        ?.querySelector<HTMLButtonElement>(`[data-day="${cursor}"]`)
        ?.focus();
  }, [open, cursor, container]);

  function show() {
    setCursor(value || isoDay(new Date()));
    setOpen(true);
  }
  function pick(day: string) {
    onChange(day);
    setOpen(false);
    trigger.current?.focus();
  }
  function shiftMonth(months: number) {
    const date = parseDay(cursor);
    const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
    const last = new Date(
      target.getFullYear(),
      target.getMonth() + 1,
      0,
    ).getDate();
    target.setDate(Math.min(date.getDate(), last));
    setCursor(isoDay(target));
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    }[event.key];
    const onDay = (event.target as HTMLElement).dataset.day !== undefined;
    if (step !== undefined && onDay) {
      event.preventDefault();
      setCursor(isoDay(addDays(parseDay(cursor), step)));
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      shiftMonth(event.key === "PageUp" ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }
  }

  const shown = parseDay(cursor);
  const first = new Date(shown.getFullYear(), shown.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  const weeks = Math.ceil(
    (first.getDay() +
      new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate()) /
      7,
  );
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  const today = isoDay(new Date());
  const weekdays = days.slice(0, 7).map((d) => ({
    short: d.toLocaleDateString(locale, { weekday: "narrow" }),
    long: d.toLocaleDateString(locale, { weekday: "long" }),
  }));
  const month = shown.toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={labelledBy}
        className={`${chip ? "prop-chip" : "select select-md date-field"} ${open ? "open" : ""} ${value ? "" : "empty"}`}
        onClick={() => {
          trigger.current?.focus();
          if (open) setOpen(false);
          else show();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            show();
          }
        }}
      >
        <Icon name={chip ? "flag" : "calendar"} size={chip ? 12 : 14} />
        <span
          className={chip ? (value ? "" : "prop-chip-key") : "select-value"}
        >
          {value ? longDay(value) : t("No date")}
        </span>
        {value && <span className="date-field-hint">{relativeDay(value)}</span>}
      </button>
      {open &&
        container &&
        createPortal(
          <div
            ref={popup}
            role="dialog"
            aria-label={t("Choose a day")}
            className="date-popover"
            style={{ ...style, maxHeight: undefined }}
            onKeyDown={keyDown}
          >
            <div className="date-presets">
              {presets().map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className="date-preset"
                  onClick={() => pick(isoDay(preset.date))}
                >
                  {preset.label}
                  <span>{shortDay(preset.date)}</span>
                </button>
              ))}
              {value && (
                <button
                  type="button"
                  className="date-preset clear"
                  onClick={() => pick("")}
                >
                  {t("No date")}
                </button>
              )}
            </div>
            <div className="date-month">
              <div className="date-month-head">
                <span className="date-month-name" id={`${gridId}-month`}>
                  {month}
                </span>
                <button
                  type="button"
                  className="icon-button small"
                  aria-label={t("Previous month")}
                  onClick={() => shiftMonth(-1)}
                >
                  <Icon name="chevronLeft" size={12} />
                </button>
                <button
                  type="button"
                  className="button small ghost"
                  onClick={() => setCursor(today)}
                >
                  {t("Today")}
                </button>
                <button
                  type="button"
                  className="icon-button small"
                  aria-label={t("Next month")}
                  onClick={() => shiftMonth(1)}
                >
                  <Icon name="chevronRight" size={12} />
                </button>
              </div>
              <div
                className="date-grid"
                role="grid"
                aria-labelledby={`${gridId}-month`}
              >
                <div role="row" className="date-row">
                  {weekdays.map((day) => (
                    <abbr
                      key={day.long}
                      role="columnheader"
                      title={day.long}
                      className="date-weekday"
                    >
                      {day.short}
                    </abbr>
                  ))}
                </div>
                {Array.from({ length: weeks }, (_, week) => (
                  <div role="row" className="date-row" key={week}>
                    {days.slice(week * 7, week * 7 + 7).map((date) => {
                      const day = isoDay(date);
                      return (
                        <span role="gridcell" key={day}>
                          <button
                            type="button"
                            data-day={day}
                            tabIndex={day === cursor ? 0 : -1}
                            aria-pressed={day === value}
                            aria-current={day === today ? "date" : undefined}
                            aria-label={date.toLocaleDateString(locale, {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                            })}
                            className={`date-day ${date.getMonth() !== shown.getMonth() ? "outside" : ""}`}
                            onClick={() => pick(day)}
                          >
                            {date.getDate()}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>,
          container,
        )}
    </>
  );
}
