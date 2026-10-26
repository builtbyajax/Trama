import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import type { Heading } from "../../lib/markdown";
import { t } from "../../lib/i18n";

/**
 * The note's headings as short marks down the left of the page, the one being read longer and
 * brighter. Pointing at a mark shows its heading with the start of its text; a click goes there.
 */
export function NoteMarks({
  headings,
  reader,
}: {
  headings: Heading[];
  reader: RefObject<HTMLDivElement | null>;
}) {
  const [current, setCurrent] = useState<string | null>(null);
  const [near, setNear] = useState<number | null>(null);
  const marks = useRef<HTMLDivElement>(null);
  // After a click the chosen heading stays current while the page scrolls to it, even when it
  // sits too low on the last screen to reach the reading line.
  const chosen = useRef(0);
  const find = useCallback(
    (id: string) =>
      reader.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`) ?? null,
    [reader],
  );
  useEffect(() => {
    const box = reader.current;
    if (!box) return;
    const update = () => {
      if (Date.now() < chosen.current) return;
      const top = box.getBoundingClientRect().top + box.clientHeight / 3;
      let at = headings[0]?.id ?? null;
      for (const h of headings) {
        const el = find(h.id);
        if (el && el.getBoundingClientRect().top <= top) at = h.id;
      }
      // At the very end the last heading is current even when it never reaches the line.
      if (box.scrollTop + box.clientHeight >= box.scrollHeight - 2)
        at = headings[headings.length - 1]?.id ?? at;
      setCurrent(at);
    };
    let frame = requestAnimationFrame(update);
    const scrolled = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    box.addEventListener("scroll", scrolled);
    return () => {
      cancelAnimationFrame(frame);
      box.removeEventListener("scroll", scrolled);
    };
  }, [headings, reader, find]);
  if (headings.length < 2) return null;
  const go = (id: string) => {
    const box = reader.current;
    const el = find(id);
    if (!box || !el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({
      top: Math.max(
        0,
        el.getBoundingClientRect().top -
          box.getBoundingClientRect().top +
          box.scrollTop -
          24,
      ),
      behavior: reduce ? "auto" : "smooth",
    });
    chosen.current = Date.now() + 900;
    setCurrent(id);
    el.classList.remove("heading-flash");
    void el.offsetWidth;
    el.classList.add("heading-flash");
  };
  const shown = near === null ? null : headings[near];
  const excerpt = shown ? sectionText(find(shown.id)) : "";
  const top =
    near === null
      ? 0
      : ((marks.current?.children[near] as HTMLElement | undefined)
          ?.offsetTop ?? 0);
  return (
    <nav
      className={`note-marks ${near === null ? "" : "pointing"}`}
      aria-label={t("In this note")}
      onMouseMove={(event) => {
        const list = marks.current;
        if (!list) return;
        const y = event.clientY - list.getBoundingClientRect().top;
        setNear(
          Math.max(0, Math.min(headings.length - 1, Math.floor(y / MARK_ROW))),
        );
      }}
      onMouseLeave={() => setNear(null)}
    >
      <div ref={marks} className="note-marks-list">
        {headings.map((h, i) => {
          // The marks swell around the one under the pointer, and only move on when the
          // pointer reaches the next mark.
          const swell = near === null ? 0 : (WAVE[Math.abs(i - near)] ?? 0);
          return (
            <button
              key={h.id}
              type="button"
              className={`note-mark l${h.level} ${h.id === current ? "on" : ""} ${i === near ? "near" : ""}`}
              style={{ "--swell": swell.toFixed(3) } as CSSProperties}
              aria-label={h.text}
              aria-current={h.id === current ? "location" : undefined}
              onFocus={() => setNear(i)}
              onBlur={() => setNear(null)}
              onClick={() => go(h.id)}
            >
              <i />
            </button>
          );
        })}
      </div>
      {shown && (
        <div className="note-mark-card" style={{ top }} aria-hidden="true">
          <strong className="truncate">{shown.text}</strong>
          {excerpt && <p>{excerpt}</p>}
        </div>
      )}
    </nav>
  );
}

/** Height of each mark's row, in pixels, matching `.note-mark` in notes/marks.css. */
const MARK_ROW = 8;
/** How much a mark swells by its distance, in marks, from the one under the pointer. */
const WAVE = [1, 0.62, 0.38, 0.18, 0.06];

/** The text under a heading, up to the next one, cut short for a preview. */
function sectionText(heading: HTMLElement | null, limit = 180) {
  let text = "";
  for (
    let el = heading?.nextElementSibling;
    el && !/^H[1-6]$/.test(el.tagName) && text.length < limit;
    el = el.nextElementSibling
  )
    text += ` ${(el as HTMLElement).innerText}`;
  text = text.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}
