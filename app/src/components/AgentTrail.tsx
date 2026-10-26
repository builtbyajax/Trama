import { useLayoutEffect, useRef } from "react";

const stitch = 9; // dash 5 + gap 4, in CSS (board.css)

/**
 * A stitched border that keeps running around the card while the agent works on it: short dashes
 * on an SVG outline that advance at the same slow, even speed on every edge and never pause.
 * `pathLength` is rounded to a whole number of stitches, so there is no seam where the outline
 * starts, whatever the card's size. With Reduce Motion it stays still.
 */
export function AgentTrail() {
  const rect = useRef<SVGRectElement>(null);
  useLayoutEffect(() => {
    const element = rect.current;
    if (!element) return;
    const fit = () => {
      const length = element.getTotalLength();
      if (length > 0)
        element.setAttribute(
          "pathLength",
          String(Math.max(1, Math.round(length / stitch)) * stitch),
        );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element.ownerSVGElement ?? element);
    return () => observer.disconnect();
  }, []);
  return (
    <svg className="agent-trail" aria-hidden="true">
      {/* Attributes rather than CSS geometry, which WebKit does not apply to <rect>. */}
      <rect ref={rect} rx="10" width="100%" height="100%" />
    </svg>
  );
}
