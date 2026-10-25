import { useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export interface SegmentedOption<T> {
  value: T;
  label: ReactNode;
  /** Extra attributes for the button, such as a tooltip or its shortcut. */
  props?: ButtonHTMLAttributes<HTMLButtonElement>;
}

/** Arrow keys move between radio items and choose the one they land on, wrapping at the ends. */
export function radioKeyDown(
  event: React.KeyboardEvent<HTMLElement>,
  count: number,
  index: number,
  choose: (index: number) => void,
) {
  const step =
    event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : event.key === "Home"
          ? -index
          : event.key === "End"
            ? count - 1 - index
            : null;
  if (step === null) return;
  event.preventDefault();
  choose((index + step + count) % count);
}

/**
 * The app's one control for a short single choice: a radio group where Tab reaches only the chosen
 * item and the arrows change it, as on macOS.
 */
export function Segmented<T extends string | boolean>({
  options,
  value,
  onChange,
  label,
  labelledBy,
  size,
  className = "",
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  labelledBy?: string;
  size?: "small";
  className?: string;
}) {
  const group = useRef<HTMLDivElement>(null);
  const current = options.findIndex((option) => option.value === value);
  const choose = (index: number) => {
    group.current
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      [index]?.focus();
    if (options[index].value !== value) onChange(options[index].value);
  };
  return (
    <div
      ref={group}
      className={["segmented", size, className].filter(Boolean).join(" ")}
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
    >
      {options.map((option, index) => {
        const checked = index === current;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (current < 0 && index === 0) ? 0 : -1}
            {...option.props}
            onClick={() => !checked && onChange(option.value)}
            onKeyDown={(event) =>
              radioKeyDown(event, options.length, index, choose)
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
