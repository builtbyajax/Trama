import { locale } from "../lib/i18n";
import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

const gap = 6;
const margin = 8;

function scrollParent(element: HTMLElement) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

/**
 * Places a floating list next to its anchor with `position: fixed`, flipping above it when the
 * space below is short and clamping to the window. The list is rendered inside the anchor's
 * `<dialog>` when there is one, so it shares the dialog's top layer instead of hiding behind it.
 * It follows the anchor when a panel scrolls or the window resizes, and closes when the anchor
 * leaves the visible part of its panel, on outside pointer down or when the window loses focus.
 */
export function usePopover(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  popup: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  {
    minWidth = 0,
    maxHeight = 300,
    align = "start",
  }: {
    minWidth?: number;
    maxHeight?: number;
    /** "end" lines the list up with the anchor's right edge, so it opens towards the left. */
    align?: "start" | "end";
  } = {},
) {
  const [style, setStyle] = useState<CSSProperties>({});
  const [container, setContainer] = useState<Element | null>(null);
  useLayoutEffect(() => {
    const element = anchor.current;
    if (!open || !element) return;
    setContainer(element.closest("dialog") ?? document.body);
    const panel = scrollParent(element);
    const place = () => {
      const rect = element.getBoundingClientRect();
      const bounds = panel?.getBoundingClientRect();
      if (
        bounds &&
        (rect.bottom < bounds.top + 4 || rect.top > bounds.bottom - 4)
      )
        return onDismiss();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const below = viewportHeight - rect.bottom - gap - margin;
      const above = rect.top - gap - margin;
      const flip = below < Math.min(maxHeight, 180) && above > below;
      const width = Math.min(
        Math.max(rect.width, minWidth),
        viewportWidth - margin * 2,
      );
      setStyle({
        position: "fixed",
        left: Math.min(
          Math.max(margin, align === "end" ? rect.right - width : rect.left),
          viewportWidth - margin - width,
        ),
        width,
        maxHeight: Math.max(96, Math.min(maxHeight, flip ? above : below)),
        ...(flip
          ? { bottom: viewportHeight - rect.top + gap }
          : { top: rect.bottom + gap }),
      });
    };
    place();
    const outside = (event: Event) => {
      const target = event.target as Node | null;
      if (
        target &&
        !element.contains(target) &&
        !popup.current?.contains(target)
      )
        onDismiss();
    };
    const scroll = (event: Event) => {
      if (!popup.current?.contains(event.target as Node)) place();
    };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", place);
    window.addEventListener("blur", onDismiss);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("blur", onDismiss);
    };
  }, [open, anchor, popup, onDismiss, minWidth, maxHeight, align]);
  return { style, container };
}

/** Accent- and case-insensitive comparison key, matching the global search rule. */
export const searchKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase(locale)
    .trim();
