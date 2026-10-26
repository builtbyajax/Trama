import { useLayoutEffect, useState, type RefObject } from "react";

/** Current content width of an element, for layouts that change their row geometry. */
export function useElementWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
