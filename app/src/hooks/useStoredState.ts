import { useEffect, useRef, useState } from "react";
import { store, stored } from "../lib/storage";

/**
 * State kept in localStorage. `read` turns what was saved (null when nothing) into the first
 * value and `write` turns a value into what is saved. `set(value, false)` changes the value
 * for now without saving it.
 */
export function useStoredState<T>(
  key: string,
  read: (saved: string | null) => T,
  write: (value: T) => string,
) {
  const [value, setValue] = useState(() => read(stored(key)));
  const saved = useRef(true);
  const set = (next: T | ((current: T) => T), save = true) => {
    saved.current = save;
    setValue(next);
  };
  useEffect(() => {
    if (saved.current) store(key, write(value));
  }, [key, value]);
  return [value, set] as const;
}
