import { useId, type MouseEvent, type ReactNode } from "react";

export interface FieldIds {
  id: string;
  labelId: string;
  describedBy?: string;
}

/**
 * Label, control and optional hint on the shared field rhythm. Clicking a label focuses its
 * control without activating it: a native label "clicks" buttons and inputs, which used to open
 * the list of a select or combobox as if the control itself had been clicked.
 */
export function Field({
  label,
  hint,
  className = "",
  hideLabel = false,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  /** Keep the label for assistive technology only. */
  hideLabel?: boolean;
  children: (ids: FieldIds) => ReactNode;
}) {
  const id = useId();
  const ids = {
    id,
    labelId: `${id}-label`,
    describedBy: hint ? `${id}-hint` : undefined,
  };
  const focusControl = (event: MouseEvent<HTMLLabelElement>) => {
    const control = document.getElementById(id);
    if (!control) return;
    event.preventDefault();
    control.focus();
  };
  return (
    <div className={`field ${className}`}>
      <label
        id={ids.labelId}
        htmlFor={id}
        className={`field-label ${hideLabel ? "sr-only" : ""}`}
        onClick={focusControl}
      >
        {label}
      </label>
      <div className="field-control">
        {children(ids)}
        {hint && (
          <p id={ids.describedBy} className="field-hint">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
