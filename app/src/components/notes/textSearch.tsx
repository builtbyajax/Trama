import { locale } from "../../lib/i18n";
import { searchKey } from "../../hooks/usePopover";

export type Rect = { top: number; left: number; width: number; height: number };

/** The first place `query` appears in the element's text, ignoring case and accents. The text
 * nodes are read as one string, so a match may cross bold or links. */
export function locate(element: Element, query: string): Range | null {
  const needle = searchKey(query);
  if (!needle) return null;
  let folded = "";
  const at: [Text, number][] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    for (let i = 0; i < text.data.length; i++) {
      const piece = text.data[i]
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase(locale);
      folded += piece;
      for (let k = 0; k < piece.length; k++) at.push([text, i]);
    }
  }
  const start = folded.indexOf(needle);
  if (start < 0) return null;
  const [first, from] = at[start];
  const [last, to] = at[start + needle.length - 1];
  const range = document.createRange();
  range.setStart(first, from);
  range.setEnd(last, to + 1);
  return range;
}

/** The excerpt with the searched words marked, compared without case or accents. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const key = searchKey(query.trim());
  const folded = searchKey(text);
  const at = key ? folded.indexOf(key) : -1;
  // searchKey keeps one character per character, so offsets line up with the text.
  if (at < 0 || folded.length !== text.length) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + key.length)}</mark>
      {text.slice(at + key.length)}
    </>
  );
}
