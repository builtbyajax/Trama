import type { ReactNode } from "react";

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
  if (!hidden) return children;
  return (
    <>
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
          {children}
        </div>
      )}
    </>
  );
}
