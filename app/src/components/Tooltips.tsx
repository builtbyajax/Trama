import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Tip = { text: string; anchor: HTMLElement };
const delay = 350;
const margin = 8;

/**
 * One tooltip for every element with `data-tooltip`. It is drawn in a fixed layer, so it is never
 * clipped by a scrolling sidebar or panel. "Label  ⌘K" (two spaces) shows the shortcut as a key.
 * `data-tooltip-side="right"` places it beside the element; `data-tooltip-align="end"` aligns its
 * right edges. It appears after a short hover or on keyboard focus and hides on any key or click.
 */
export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const box = useRef<HTMLDivElement>(null);
  const shown = useRef<HTMLElement | null>(null);
  const hiddenAt = useRef(0);
  useEffect(() => {
    let timer = 0;
    const set = (next: Tip | null) => {
      if (!next && shown.current) hiddenAt.current = performance.now();
      shown.current = next?.anchor ?? null;
      setTip(next);
    };
    const target = (node: EventTarget | null) =>
      node instanceof Element
        ? node.closest<HTMLElement>("[data-tooltip]")
        : null;
    const hide = () => {
      window.clearTimeout(timer);
      set(null);
    };
    const show = (anchor: HTMLElement, wait: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const text = anchor.dataset.tooltip;
        if (text && anchor.isConnected) set({ text, anchor });
      }, wait);
    };
    const over = (event: PointerEvent) => {
      if (
        event.pointerType === "touch" ||
        document.querySelector(".is-dragging")
      )
        return;
      const anchor = target(event.target);
      if (!anchor) return hide();
      if (shown.current === anchor) return;
      // Moving between neighbours keeps the tooltip without a new delay.
      const recent = performance.now() - hiddenAt.current < 300;
      show(anchor, shown.current || recent ? 0 : delay);
    };
    const focus = (event: FocusEvent) => {
      const anchor = target(event.target);
      if (anchor?.matches(":focus-visible")) show(anchor, 0);
      else hide();
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);
  useEffect(() => {
    if (!tip) return;
    // Hide when the pointer leaves the anchor (pointerover on a plain area also hides it).
    const leave = () => {
      shown.current = null;
      hiddenAt.current = performance.now();
      setTip(null);
    };
    tip.anchor.addEventListener("pointerleave", leave);
    return () => tip.anchor.removeEventListener("pointerleave", leave);
  }, [tip]);
  useLayoutEffect(() => {
    if (!tip || !box.current) return;
    const rect = tip.anchor.getBoundingClientRect();
    const own = box.current.getBoundingClientRect();
    const side = tip.anchor.dataset.tooltipSide === "right";
    const end = tip.anchor.dataset.tooltipAlign === "end";
    let left = side
      ? rect.right + 10
      : end
        ? rect.right - own.width
        : rect.left;
    let top = side
      ? rect.top + (rect.height - own.height) / 2
      : rect.bottom + 6;
    left = Math.max(
      margin,
      Math.min(left, window.innerWidth - own.width - margin),
    );
    if (top + own.height > window.innerHeight - margin)
      top = rect.top - own.height - 6;
    setStyle({ left, top });
  }, [tip]);
  if (!tip) return null;
  const [label, key] = tip.text.split(/ {2,}/);
  const host = tip.anchor.closest("dialog") ?? document.body;
  return createPortal(
    <div ref={box} className="tooltip" style={style} aria-hidden="true">
      {label}
      {key && <kbd>{key}</kbd>}
    </div>,
    host,
  );
}
