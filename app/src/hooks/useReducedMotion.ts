import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};

/** Mirrors the system Reduce Motion setting for motion decided in script. */
export const useReducedMotion = () =>
  useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
