import { useState } from "react";
import type { ProjectMode } from "../components/BoardFilters";
import type { Destination } from "../components/Sidebar";

type Place = { destination: Destination; mode: ProjectMode };
const samePlace = (a: Place, b: Place) =>
  a.mode === b.mode &&
  a.destination.kind === b.destination.kind &&
  ("id" in a.destination ? a.destination.id : undefined) ===
    ("id" in b.destination ? b.destination.id : undefined);

/**
 * Where the person is and the back and forward history. `leave` runs before moving and says
 * whether to go on (an open task with unsaved edits may stay); `arrived` runs on every move.
 */
export function useNavigation(leave: () => boolean, arrived: () => void) {
  const [place, setPlace] = useState<Place>({
    destination: { kind: "overview" },
    mode: "board",
  });
  const [history, setHistory] = useState<{ back: Place[]; forward: Place[] }>({
    back: [],
    forward: [],
  });
  /** Moves to `target`, keeping the place left behind for Back. */
  const visit = (target: Place) => {
    if (samePlace(target, place)) return;
    setHistory((h) => ({ back: [...h.back.slice(-49), place], forward: [] }));
    setPlace(target);
  };
  function go(next: Place) {
    if (!leave()) return;
    arrived();
    visit(next);
  }
  /** Goes back one place; the caller handles an open task first. */
  function back() {
    const previous = history.back[history.back.length - 1];
    if (!previous) return;
    setHistory((h) => ({
      back: h.back.slice(0, -1),
      forward: [place, ...h.forward],
    }));
    arrived();
    setPlace(previous);
  }
  function forward() {
    const next = history.forward[0];
    if (!next || !leave()) return;
    setHistory((h) => ({
      back: [...h.back, place],
      forward: h.forward.slice(1),
    }));
    arrived();
    setPlace(next);
  }
  /** Drops a deleted project from the history and leaves it if it is open. */
  function forget(projectId: string) {
    const gone = (p: Place) =>
      p.destination.kind === "project" && p.destination.id === projectId;
    setHistory((h) => ({
      back: h.back.filter((p) => !gone(p)),
      forward: h.forward.filter((p) => !gone(p)),
    }));
    if (gone(place))
      setPlace({ destination: { kind: "overview" }, mode: "board" });
  }
  return {
    place,
    setPlace,
    canBack: history.back.length > 0,
    canForward: history.forward.length > 0,
    visit,
    go,
    back,
    forward,
    forget,
  };
}
