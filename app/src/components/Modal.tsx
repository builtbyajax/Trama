import { useEffect, useRef, type ReactNode, type KeyboardEvent } from "react";
import { Icon } from "./Icon";
import { t } from "../lib/i18n";
export function trapDialogTab(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      "button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex='-1'])",
    ),
  ].filter((item) => item.getClientRects().length > 0 && item.tabIndex >= 0);
  if (!items.length) return;
  event.preventDefault();
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next =
    index < 0
      ? event.shiftKey
        ? items.length - 1
        : 0
      : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
  items[next].focus();
}

/**
 * Modal dialog with a fixed header. Content is usually a `.modal-form` whose `.modal-body`
 * scrolls while `.modal-footer` keeps the actions reachable on short windows.
 */
export function Modal({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Escape handled and stopped by an inner list must not close the dialog. Chromium honours
  // preventDefault on the key; WebKit still fires `cancel`, so the key's path is remembered.
  const escape = useRef<"inner" | "dialog" | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    // Without a marked field the dialog itself takes focus: no button starts highlighted,
    // and Tab reaches the actions from there.
    (dialog?.querySelector<HTMLElement>("[data-autofocus]") ?? dialog)?.focus();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      tabIndex={-1}
      onKeyDownCapture={(event) => {
        if (event.key === "Escape") escape.current = "inner";
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") escape.current = "dialog";
        trapDialogTab(event);
      }}
      onKeyUpCapture={() => {
        escape.current = null;
      }}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        const handledInside = escape.current === "inner";
        escape.current = null;
        if (!handledInside) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <header className="modal-head">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t("Close")}
          onClick={onClose}
        >
          <Icon name="close" size={14} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
