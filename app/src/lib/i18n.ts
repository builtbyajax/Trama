import { errors, ptBR, type Key } from "./locales/pt-BR";
import { store, stored } from "./storage";

export type { Key };
export type Language = "pt-BR" | "en";

export const languages: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "pt-BR", label: "Português" },
];

const key = "trama.language";

/** The saved choice; English until one is made. */
function initial(): Language {
  const saved = stored(key);
  return saved === "pt-BR" ? saved : "en";
}

export const language: Language = initial();
/** The locale for dates, sorting and case: the interface's language. */
export const locale = language;
document.documentElement.lang = language;

const fill = (text: string, values: unknown[]) =>
  text.replace(/\{(\d+)\}/g, (_, i) => String(values[+i]));

/** `text` in the chosen language; `{0}`, `{1}`… take the values in order. */
export function t(text: Key, values: unknown[] = []) {
  return fill(
    language === "pt-BR" ? ptBR[text] : text.replace(/\|[^|]*$/, ""),
    values,
  );
}

/**
 * The core's known messages, as patterns: those with `{0}`… still match once the core filled in
 * a name or a path.
 */
const messages = Object.entries(errors).map(([english, portuguese]) => ({
  portuguese,
  pattern: new RegExp(
    `^${english
      .replace(/[.*+?^$()|[\]\\]/g, "\\$&")
      .replace(/\{(\d+)\}/g, "([\\s\\S]*?)")}$`,
  ),
  order: [...english.matchAll(/\{(\d+)\}/g)].map((m) => +m[1]),
}));

/** A message from the local core, which answers in English, in the chosen language. */
export function known(text: string) {
  if (language !== "pt-BR") return text;
  for (const { portuguese, pattern, order } of messages) {
    const match = text.match(pattern);
    if (!match) continue;
    const values: string[] = [];
    order.forEach((index, i) => (values[index] = match[i + 1]));
    return fill(portuguese, values);
  }
  return text;
}

/**
 * Saves the language and reloads the window: text kept in constants is read once, at load, so
 * the whole interface comes back in the new language.
 */
export function setLanguage(next: Language) {
  if (next === language) return;
  store(key, next);
  window.location.reload();
}
