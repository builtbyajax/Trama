import { useLayoutEffect, type RefObject } from "react";

/**
 * Keeps `--bar` on a scrolling area equal to the room its scrollbar takes right now, so the right
 * padding that gives it back (`calc(X - var(--bar))`) stays X with or without the bar. The macOS
 * WebKit ignores `scrollbar-gutter` and only takes the room while the area overflows.
 *
 * It measures after every render, since that is when cards come and go, and when the area
 * resizes. The bar showing up doesn't fire a resize in WebKit.
 */
export function useScrollbarRoom(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    if (ref.current) measure(ref.current);
  });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    // The next frame, so changing the padding doesn't loop the observer.
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => measure(element));
    });
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ref]);
}

function measure(element: HTMLElement) {
  const room = `${element.offsetWidth - element.clientWidth}px`;
  if (element.style.getPropertyValue("--bar") !== room)
    element.style.setProperty("--bar", room);
}
