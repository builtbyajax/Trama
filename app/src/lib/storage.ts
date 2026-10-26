/** Reads a saved preference; null when there is none or storage is unavailable. */
export const stored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
/** Saves a preference. Only a convenience: without storage it is simply forgotten. */
export const store = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Only a convenience. */
  }
};
