import { createContext, useEffect, useRef, type ReactNode } from "react";

/** True while the floating sidebar slides away, so the menus it opened fade out with it. */
export const SidebarLeaving = createContext(false);

/**
 * Where the sidebar sits. Visible, it is just the sidebar; hidden, a strip at the window's left
 * edge brings it back over the content while the pointer rests on it (see `useSidebarLayout`).
 */
export function SidebarSlot({
  hidden,
  peek,
  onShow,
  onHide,
  onClose,
  onEnd,
  children,
}: {
  hidden: boolean;
  peek: "off" | "on" | "leaving";
  onShow: () => void;
  onHide: () => void;
  onClose: () => void;
  onEnd: () => void;
  children: ReactNode;
}) {
  const inside = useRef<Event | null>(null);
  const hide = useRef(onHide);
  hide.current = onHide;
  // A menu opened from the sidebar can be removed from under the pointer, and a modal makes the
  // sidebar inert, so it may never hear the pointer leave. While it floats, a pointer over
  // anything that isn't part of it (in React's tree, so its menus count) closes it instead.
  const peeking = hidden && peek === "on";
  useEffect(() => {
    if (!peeking) return;
    const over = (event: PointerEvent) => {
      if (inside.current !== event) hide.current();
    };
    document.addEventListener("pointerover", over);
    return () => document.removeEventListener("pointerover", over);
  }, [peeking]);
  if (!hidden) return children;
  return (
    <div
      className="sidebar-slot"
      onPointerOver={(event) => {
        inside.current = event.nativeEvent;
      }}
    >
      <div
        className="sidebar-edge"
        aria-hidden="true"
        onMouseEnter={onShow}
        onMouseLeave={onHide}
      />
      {peek !== "off" && (
        <div
          className={`sidebar-peek ${peek === "leaving" ? "leaving" : ""}`}
          onMouseEnter={onShow}
          onMouseLeave={onHide}
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget) onEnd();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
          }}
        >
          <SidebarLeaving.Provider value={peek === "leaving"}>
            {children}
          </SidebarLeaving.Provider>
        </div>
      )}
    </div>
  );
}
