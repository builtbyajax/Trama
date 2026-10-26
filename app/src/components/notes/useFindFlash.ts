import { useEffect, useState, type RefObject } from "react";
import type { DocumentFile } from "../../lib/types";
import { locate, type Rect } from "./textSearch";

/**
 * Text searched for, shown in the note once it is on screen: the page scrolls to it and a blue
 * flash marks it for a moment.
 */
export function useFindFlash(
  reader: RefObject<HTMLDivElement | null>,
  file: DocumentFile | null,
) {
  // Text searched for, shown in the note once it is on screen; `at` tells two searches apart.
  const [find, setFind] = useState<{
    path: string;
    text: string;
    at: number;
  } | null>(null);
  const [flash, setFlash] = useState<{ at: number; rects: Rect[] } | null>(
    null,
  );
  // Scrolls to the first place the searched text appears and marks it in blue for a moment.
  useEffect(() => {
    const box = reader.current;
    if (!find || !box || file?.path !== find.path) return;
    const frame = requestAnimationFrame(() => {
      setFind(null);
      const page = box.querySelector(".note-page");
      const range = page && locate(page, find.text);
      if (!range) return;
      const outer = box.getBoundingClientRect();
      const rects = [...range.getClientRects()].map((r) => ({
        top: r.top - outer.top + box.scrollTop,
        left: r.left - outer.left + box.scrollLeft,
        width: r.width,
        height: r.height,
      }));
      if (!rects.length) return;
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      box.scrollTo({
        top: Math.max(0, rects[0].top - box.clientHeight / 3),
        behavior: reduce ? "auto" : "smooth",
      });
      setFlash({ at: find.at, rects });
    });
    return () => cancelAnimationFrame(frame);
  }, [find, file]);
  return { setFind, flash, setFlash };
}
