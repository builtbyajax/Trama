// Small stroke icon set (15 pt, 1.35 stroke).
const paths = {
  search: "M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM10.3 10.3L14 14",
  overview: "M3 3.5h4v4H3zM9 3.5h4v4H9zM3 9.5h4v4H3zM9 9.5h4v4H9z",
  drafts: "M4 2.5h5.5L12 5v8.5H4zM9.5 2.5V5H12M6 8h4M6 10.5h3",
  plus: "M8 3.5v9M3.5 8h9",
  gear: "M6.57 3.31L6.89 1.7L9.11 1.7L9.43 3.31A4.9 4.9 0 0 1 11.34 4.42L12.9 3.89L14.01 5.81L12.77 6.9A4.9 4.9 0 0 1 12.77 9.1L14.01 10.19L12.9 12.11L11.34 11.58A4.9 4.9 0 0 1 9.43 12.69L9.11 14.3L6.89 14.3L6.57 12.69A4.9 4.9 0 0 1 4.66 11.58L3.1 12.11L1.99 10.19L3.23 9.1A4.9 4.9 0 0 1 3.23 6.9L1.99 5.81L3.1 3.89L4.66 4.42A4.9 4.9 0 0 1 6.57 3.31zM10 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0z",
  sidebar:
    "M3.5 3h9a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7A1.5 1.5 0 0 1 3.5 3zM6.5 3v10",
  folder: "M2.5 4.5h4l1.2 1.5h5.8v6.5h-11z",
  check: "M3.5 8.5l3 3 6-7",
  target:
    "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8 7.9v.2",
  flag: "M4 14V2.5M4 3h7.5L10 5.5 11.5 8H4",
  calendar: "M3 4h10v9.5H3zM3 7h10M5.5 2v3M10.5 2v3",
  board: "M2.5 3.5h11v9h-11zM6.2 3.5v9M9.8 3.5v9",
  close: "M4 4l8 8M12 4l-8 8",
  chevronDown: "M4.5 6.5L8 10l3.5-3.5",
  chevronUp: "M4.5 9.5L8 6l3.5 3.5",
  chevronUpDown: "M5 6l3-3 3 3M5 10l3 3 3-3",
  arrowLeft: "M13 8H3.5M7.5 4L3.5 8l4 4",
  arrowRight: "M3 8h9.5M8.5 4l4 4-4 4",
  arrowUp: "M8 13V3.5M4 7.5l4-4 4 4",
  arrowDown: "M8 3v9.5M4 8.5l4 4 4-4",
  refresh: "M13 8a5 5 0 1 1-1.5-3.6M13 2.8v2.7h-2.7",
  copy: "M5.5 5.5h7v7h-7zM3.5 10.5v-7h7",
  external: "M9.5 2.5h4v4M13.5 2.5L8 8M12 9.5v4H2.5V4h4",
  branch:
    "M5 5v6M11 6.5c0 2.5-6 2-6 4.5M6.5 3.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0zM6.5 12.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0zM12.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0z",
  commit: "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM1.5 8h4M10.5 8h4",
  reveal: "M2.5 4.5h4l1.2 1.5h5.8v6.5h-11zM8 8.2v3M6.5 9.7L8 8.2l1.5 1.5",
  trash: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9",
  archive: "M2.5 3h11v3h-11zM3.5 6v7.5h9V6M6.5 8.5h3",
  pullRequest:
    "M4.5 5v6M11.5 11V6.5a2 2 0 0 0-2-2H7.5M9 3L7.5 4.5 9 6M6.0 3.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0zM6.0 12.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0zM13.0 12.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0z",
  file: "M4 2.5h5.5L12 5v8.5H4zM9.5 2.5V5H12",
  keyboard: "M2 4.5h12v7H2zM4.5 6.5h1M7.5 6.5h1M10.5 6.5h1M4.5 9.2h7",
  warning: "M8 2.5l6 10.5H2zM8 6.5v3M8 11.2v.1",
  chevronLeft: "M10 3.5L5.5 8l4.5 4.5",
  chevronRight: "M6 3.5L10.5 8 6 12.5",
  expand: "M9.5 2.5h4v4M13.5 2.5L9 7M6.5 13.5h-4v-4M2.5 13.5L7 9",
  collapse: "M13.5 2.5L9.5 6.5M9.5 3v3.5H13M2.5 13.5l4-4M3 9.5h3.5V13",
  compose:
    "M8.5 2.5H4A1.5 1.5 0 0 0 2.5 4v8A1.5 1.5 0 0 0 4 13.5h8a1.5 1.5 0 0 0 1.5-1.5V7.5M12.5 1.8L7 7.3l-.4 2.1 2.1-.4 5.5-5.5z",
  more: "M3.5 8h.01M8 8h.01M12.5 8h.01",
  rename: "M2 5h8v6H2zM12.5 3v10M11 3h3M11 13h3",
  pencil: "M10.6 2.9l2.5 2.5-7.6 7.6-3 .5.5-3zM9.3 4.2l2.5 2.5",
  notes:
    "M2.5 3.5h4A1.5 1.5 0 0 1 8 5v8.5a1.5 1.5 0 0 0-1.5-1.5h-4zM13.5 3.5h-4A1.5 1.5 0 0 0 8 5v8.5a1.5 1.5 0 0 1 1.5-1.5h4z",
  vault:
    "M4 2.5h8A1.5 1.5 0 0 1 13.5 4v7A1.5 1.5 0 0 1 12 12.5H4A1.5 1.5 0 0 1 2.5 11V4A1.5 1.5 0 0 1 4 2.5zM8 5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM8 7.5h.01M4.5 12.5v1.2M11.5 12.5v1.2",
  filePlus: "M8.5 13.5H4v-11h5.5L12 5v3M9.5 2.5V5H12M12 10v4.5M9.75 12.25h4.5",
  folderPlus: "M8 12.5H2.5v-8h4l1.2 1.5h5.8v2.5M12 10v4.5M9.75 12.25h4.5",
  clip: "M10.5 5.5L6.2 9.8a1.3 1.3 0 0 0 1.9 1.9l4.6-4.6a2.6 2.6 0 0 0-3.7-3.7L4.3 8.1a3.9 3.9 0 0 0 5.5 5.5l3.4-3.4",
  eye: "M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  outline: "M3 4h10M5.5 8H13M5.5 12H13",
  // Note formatting.
  bold: "M5 3h3.6a2.4 2.4 0 0 1 0 4.8H5zM5 7.8h4.2a2.6 2.6 0 0 1 0 5.2H5z",
  italic: "M7.5 3H12M4 13h4.5M9.8 3l-3.6 10",
  heading: "M4 3.5v9M11.5 3.5v9M4 8h7.5",
  quote: "M3.5 3.5v9M6.5 5h6.5M6.5 8h6.5M6.5 11h4",
  list: "M6.5 4.5h7M6.5 8h7M6.5 11.5h7M3 4.5h.01M3 8h.01M3 11.5h.01",
  listNumbered:
    "M7 4.5h6.5M7 8h6.5M7 11.5h6.5M2.6 3.4l.9-.6v3.4M2.5 10.1a.9.9 0 0 1 1.7.4c0 .6-1.7 1.6-1.7 2.4h1.8",
  todo: "M2.5 3h4v4h-4zM3.4 5l.9.9 1.4-1.6M9 5h4.5M2.5 9h4v4h-4zM9 11h4.5",
  noteLink: "M5 3H3v10h2M7.5 3h-1v10h1M11 3h2v10h-2M8.5 3h1v10h-1",
  // Project glyphs, offered in the project editor.
  book: "M2.5 3.5H6A2 2 0 0 1 8 5.5v8a1.5 1.5 0 0 0-1.5-1.5h-4zM13.5 3.5H10A2 2 0 0 0 8 5.5v8a1.5 1.5 0 0 1 1.5-1.5h4z",
  code: "M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5M9.2 3L6.8 13",
  terminal: "M2.5 3.5h11v9h-11zM5 6.5l2 1.5-2 1.5M8.5 10H11",
  package: "M8 2l5.5 3v6L8 14l-5.5-3V5zM2.5 5L8 8l5.5-3M8 8v6",
  leaf: "M3 13C3 7 6.5 3 13 3c0 6.5-4 10-10 10zM3 13l5.5-5.5",
  bolt: "M9 1.8L3.5 9H8l-1 5.2L12.5 7H8z",
  globe:
    "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM2 8h12M8 2c-2.2 2-2.2 10 0 12M8 2c2.2 2 2.2 10 0 12",
  star: "M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5z",
  heart:
    "M8 13.5S2.5 10.2 2.5 6.2A2.8 2.8 0 0 1 8 5a2.8 2.8 0 0 1 5.5 1.2c0 4-5.5 7.3-5.5 7.3z",
  music:
    "M6 12V3.5L13 2v8.5M6 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM13 10.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0z",
  camera:
    "M2 5h3l1-1.5h4L11 5h3v8H2zM8 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  rocket:
    "M8 1.5c2.4 1.6 3.5 4 3.5 7L10 11H6L4.5 8.5c0-3 1.1-5.4 3.5-7zM6 11l-1.5 3M10 11l1.5 3M8 6v.1",
  flask: "M6 2h4M6.5 2v4.5L3 13.5h10L9.5 6.5V2M4.6 10.5h6.8",
  chart: "M2.5 13.5h11M4.5 11V8M8 11V4.5M11.5 11V6.5",
  palette:
    "M8 2a6 6 0 0 0 0 12c.9 0 1.4-.6 1.4-1.3 0-1-.8-1.2-.8-2s.6-1.2 1.4-1.2H12a2 2 0 0 0 2-2C14 4.5 11.3 2 8 2zM5 7.2v.1M7 4.8v.1M10.2 5v.1",
  gamepad:
    "M4.8 5h6.4a3 3 0 0 1 2.9 3.6l-.6 2.8a1.6 1.6 0 0 1-2.8.7L9.5 10.5h-3l-1.2 1.6a1.6 1.6 0 0 1-2.8-.7l-.6-2.8A3 3 0 0 1 4.8 5zM5 7v2.4M3.8 8.2h2.4M10.5 7.6v.1M12 8.8v.1",
  home: "M2.5 7.5L8 3l5.5 4.5M4 6.5v7h8v-7M6.8 13.5v-3.5h2.4v3.5",
  briefcase: "M2.5 5h11v8h-11zM6 5V3.5h4V5M2.5 8.5h11",
  chat: "M2.5 3h11v8H7l-3 2.5V11H2.5z",
  cloud: "M4.5 12.5a3 3 0 0 1-.3-6 4 4 0 0 1 7.6-1 3.5 3.5 0 0 1 .2 7z",
  mobile: "M5 1.5h6v13H5zM7.5 12.3h1",
  shield: "M8 1.8l5 2v4c0 3-2.2 5.3-5 6.4-2.8-1.1-5-3.4-5-6.4v-4z",
  coffee:
    "M3 6h8v4a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM11 7h1a1.5 1.5 0 0 1 0 3h-1M5.5 2.5V4M8 2.5V4",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 15 }: { name: IconName; size?: number }) {
  return (
    <svg
      className={`icon ${name === "more" ? "icon-dots" : ""}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

/**
 * The copy glyph, which turns into a check while `copied`: the check draws itself in and fades
 * out when it goes back. Both are stacked so the button keeps its size.
 */
export function CopyIcon({
  copied,
  size = 15,
}: {
  copied: boolean;
  size?: number;
}) {
  return (
    <span className={`copy-icon ${copied ? "copied" : ""}`} aria-hidden="true">
      <Icon name="copy" size={size} />
      <Icon name="check" size={size} />
    </span>
  );
}
