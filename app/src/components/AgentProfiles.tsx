import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { keepAwake, setKeepAwake } from "../lib/api";
import { type KeepAwake } from "../lib/types";
import { isMac } from "../lib/shortcuts";
import { t } from "../lib/i18n";
import { Select } from "./Select";

/** Every option of one trait (shape or eyes), each drawn large on the character as it would look. */
export function TraitPicker<T extends string>({
  id,
  labelId,
  options,
  value,
  onChange,
  draw,
}: {
  id: string;
  labelId: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  draw: (value: T) => ReactNode;
}) {
  const at = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = (at + step + options.length) % options.length;
    onChange(options[next].value);
    event.currentTarget
      .querySelector<HTMLElement>(`[data-option="${next}"]`)
      ?.focus();
  }
  return (
    <div
      className="trait-picker"
      role="radiogroup"
      aria-labelledby={labelId}
      onKeyDown={keyDown}
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          id={index === at ? id : undefined}
          type="button"
          role="radio"
          aria-checked={index === at}
          data-option={index}
          tabIndex={index === at ? 0 : -1}
          className="trait-option"
          onClick={() => onChange(option.value)}
        >
          {draw(option.value)}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Keeps the Mac from sleeping while an agent works: never, always, or only on power. */
export function KeepAwakeRow({ fail }: { fail: (e: unknown) => void }) {
  const [mode, setMode] = useState<KeepAwake | null>(null);
  useEffect(() => {
    void keepAwake()
      .then(setMode)
      .catch(() => setMode("off"));
  }, []);
  if (!isMac || !mode) return null;
  return (
    <section className="settings-group">
      <div className="settings-row">
        <div className="settings-text">
          <span id="keep-awake-title">{t("Keep the Mac awake")}</span>
          <span className="muted small">
            {t(
              "While an agent called a tool in the last 15 minutes. The screen can still turn off.",
            )}
          </span>
        </div>
        <Select
          labelledBy="keep-awake-title"
          size="sm"
          value={mode}
          options={[
            { value: "off", label: t("Off") },
            { value: "always", label: t("Always") },
            { value: "power", label: t("Only on power") },
          ]}
          onChange={(next) => {
            const before = mode;
            setMode(next);
            void setKeepAwake(next).catch((e) => {
              setMode(before);
              fail(e);
            });
          }}
        />
      </div>
    </section>
  );
}
