import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { copyText, documentImage, openUrl } from "../lib/api";
import {
  folderOf,
  joinPath,
  noteName,
  parseInline,
  type Block,
  type Inline,
  type ListItem,
  type MarkdownDocument,
} from "../lib/markdown";
import { CopyIcon, Icon } from "./Icon";
import { t } from "../lib/i18n";

/** What links and images of a note resolve against, and what the reader can do. */
export interface NoteContext {
  projectId: string;
  /** The note shown, relative to the project's notes folder. */
  path: string;
  notes: string[];
  images: string[];
  onOpenNote?: (path: string, heading: string | null) => void;
  /** Ticks a to-do on that line of the file; absent when the note is read-only here. */
  onToggle?: (line: number) => void;
  onError?: (message: string) => void;
}
const Context = createContext<NoteContext>({
  projectId: "",
  path: "",
  notes: [],
  images: [],
});

const lower = (s: string) => s.toLowerCase();
/** Obsidian's rules: a path suffix, else a name, preferring the note's own folder. */
export function resolveNote(target: string, from: string, notes: string[]) {
  const wanted = lower(target.replace(/\.(md|markdown)$/i, ""));
  if (!wanted) return null;
  if (wanted.includes("/"))
    return (
      notes.find((n) => {
        const bare = lower(n.replace(/\.(md|markdown)$/i, ""));
        return bare === wanted || bare.endsWith("/" + wanted);
      }) ?? null
    );
  const named = notes.filter((n) => lower(noteName(n)) === wanted);
  return named.find((n) => folderOf(n) === folderOf(from)) ?? named[0] ?? null;
}
function resolveFile(link: string, from: string, files: string[]) {
  let target: string | null;
  try {
    target = joinPath(folderOf(from), link);
  } catch {
    return null;
  }
  if (target && files.includes(target)) return target;
  // Obsidian also accepts paths from the folder root and bare file names.
  const name = lower(link.split("/").pop() ?? "");
  return (
    files.find((f) => lower(f) === lower(link)) ??
    files.find((f) => lower(f.split("/").pop()!) === name) ??
    null
  );
}

const calloutTitle: Record<string, string> = {
  note: t("Note"),
  info: t("Info"),
  tip: t("Tip"),
  hint: t("Tip"),
  success: t("Done|callout"),
  check: t("Done|callout"),
  done: t("Done|callout"),
  question: t("Question"),
  help: t("Question"),
  faq: t("Question"),
  warning: t("Warning"),
  caution: t("Warning"),
  attention: t("Warning"),
  important: t("Important"),
  danger: t("Danger"),
  error: t("Error"),
  bug: "Bug",
  failure: t("Failed"),
  example: t("Example"),
  quote: t("Quote"),
  abstract: t("Summary"),
  summary: t("Summary"),
  todo: t("To do"),
};
const calloutTone = (type: string) =>
  ["warning", "caution", "attention", "important"].includes(type)
    ? "warn"
    : ["danger", "error", "bug", "failure"].includes(type)
      ? "danger"
      : ["tip", "hint", "success", "check", "done"].includes(type)
        ? "good"
        : "neutral";

/** A note as a reader sees it. Nothing in the file is ever turned into HTML. */
export function Markdown({
  doc,
  context,
}: {
  doc: MarkdownDocument;
  context: NoteContext;
}) {
  return (
    <Context.Provider value={context}>
      <div className="md">
        <Blocks blocks={doc.blocks} />
      </div>
    </Context.Provider>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return blocks.map((b, i) => <BlockView key={i} block={b} />);
}

function BlockView({ block: b }: { block: Block }) {
  // Where the block starts in the file, so the reader can follow the editor's scroll.
  const at = { "data-line": b.line };
  switch (b.kind) {
    case "heading": {
      const Tag = `h${Math.min(b.level, 4)}` as "h1";
      return (
        <Tag id={b.id} className={`md-h${b.level}`} {...at}>
          <Text text={b.text} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p {...at}>
          <Text text={b.text} />
        </p>
      );
    case "rule":
      return <hr {...at} />;
    case "code":
      return <CodeBlock lang={b.lang} text={b.text} line={b.line} />;
    case "quote":
      return (
        <blockquote {...at}>
          <Blocks blocks={b.children} />
        </blockquote>
      );
    case "callout":
      return (
        <aside className={`md-callout ${calloutTone(b.type)}`} {...at}>
          <p className="md-callout-title">
            <span className="md-callout-mark" aria-hidden="true" />
            {b.title ? (
              <Text text={b.title} />
            ) : (
              (calloutTitle[b.type] ?? b.type)
            )}
          </p>
          <Blocks blocks={b.children} />
        </aside>
      );
    case "table":
      return (
        <div className="md-table scroll" {...at}>
          <table>
            <thead>
              <tr>
                {b.head.map((cell, i) => (
                  <th key={i} style={{ textAlign: b.align[i] }}>
                    <Text text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, r) => (
                <tr key={r}>
                  {b.head.map((_, i) => (
                    <td key={i} style={{ textAlign: b.align[i] }}>
                      <Text text={row[i] ?? ""} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "list": {
      const Tag = b.ordered ? "ol" : "ul";
      return (
        <Tag start={b.ordered && b.start !== 1 ? b.start : undefined} {...at}>
          {b.items.map((item, i) => (
            <Item key={i} item={item} />
          ))}
        </Tag>
      );
    }
  }
}

function Item({ item }: { item: ListItem }) {
  const { onToggle } = useContext(Context);
  if (item.checked === null)
    return (
      <li data-line={item.line}>
        <span className="md-item">
          <Text text={item.text} />
        </span>
        <Blocks blocks={item.children} />
      </li>
    );
  return (
    <li
      className={`md-todo ${item.checked ? "done" : ""}`}
      data-line={item.line}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={item.checked}
        aria-label={item.text || t("Empty item")}
        className={`md-check ${item.checked ? "on" : ""}`}
        disabled={!onToggle}
        onClick={() => onToggle?.(item.line)}
      >
        {item.checked && <Icon name="check" size={11} />}
      </button>
      <span className="md-item">
        <Text text={item.text} />
      </span>
      <Blocks blocks={item.children} />
    </li>
  );
}

function CodeBlock({
  lang,
  text,
  line,
}: {
  lang: string;
  text: string;
  line?: number;
}) {
  const [copied, setCopied] = useState(false);
  const { onError } = useContext(Context);
  return (
    <figure className="md-code" data-line={line}>
      <figcaption>
        <span>{lang || "texto"}</span>
        <button
          type="button"
          className="icon-button small"
          aria-label={t("Copy code")}
          data-tooltip={copied ? t("Copied") : t("Copy")}
          onClick={() =>
            void copyText(text).then(
              () => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1400);
              },
              () => onError?.(t("Couldn't copy.")),
            )
          }
        >
          <CopyIcon copied={copied} size={13} />
        </button>
      </figcaption>
      <pre className="scroll">
        <code>{text}</code>
      </pre>
    </figure>
  );
}

function Text({ text }: { text: string }) {
  return <Inlines nodes={parseInline(text)} />;
}

function Inlines({ nodes }: { nodes: Inline[] }) {
  return nodes.map((node, i) => <InlineView key={i} node={node} />);
}

function InlineView({ node }: { node: Inline }) {
  const context = useContext(Context);
  switch (node.kind) {
    case "text":
      return node.text;
    case "code":
      return <code className="inline-code">{node.text}</code>;
    case "strong":
      return (
        <strong>
          <Inlines nodes={node.children} />
        </strong>
      );
    case "em":
      return (
        <em>
          <Inlines nodes={node.children} />
        </em>
      );
    case "del":
      return (
        <del>
          <Inlines nodes={node.children} />
        </del>
      );
    case "mark":
      return (
        <mark>
          <Inlines nodes={node.children} />
        </mark>
      );
    case "tag":
      return <span className="md-tag">#{node.text}</span>;
    case "wiki": {
      const path = node.target
        ? resolveNote(node.target, context.path, context.notes)
        : context.path;
      return (
        <NoteLink path={path} heading={node.heading} title={node.target}>
          {node.label}
        </NoteLink>
      );
    }
    case "embed": {
      const image = resolveFile(node.target, context.path, context.images);
      if (image) return <LocalImage path={image} alt={node.label} />;
      const path = resolveNote(node.target, context.path, context.notes);
      return (
        <NoteLink path={path} heading={null} title={node.target}>
          {node.label}
        </NoteLink>
      );
    }
    case "image": {
      if (/^https?:/i.test(node.src))
        return <ExternalImage src={node.src} alt={node.alt} />;
      const image = resolveFile(node.src, context.path, context.images);
      return image ? (
        <LocalImage path={image} alt={node.alt} />
      ) : (
        <span className="md-missing">
          {t("Image not found:")} {node.src}
        </span>
      );
    }
    case "link": {
      if (/^[a-z][a-z0-9+.-]*:/i.test(node.href))
        return (
          <button
            type="button"
            className="md-link external"
            data-tooltip={node.href}
            onClick={() =>
              void openUrl(node.href).catch(() =>
                context.onError?.(
                  t("Trama only opens https links: {0}", [node.href]),
                ),
              )
            }
          >
            <Inlines nodes={node.children} />
            <Icon name="external" size={11} />
          </button>
        );
      const [file, hash] = node.href.split("#");
      const path = file
        ? resolveFile(file, context.path, context.notes)
        : context.path;
      return (
        <NoteLink path={path} heading={hash ?? null} title={node.href}>
          <Inlines nodes={node.children} />
        </NoteLink>
      );
    }
  }
}

function NoteLink({
  path,
  heading,
  title,
  children,
}: {
  path: string | null;
  heading: string | null;
  title: string;
  children: ReactNode;
}) {
  const { onOpenNote } = useContext(Context);
  if (!path)
    return (
      <span
        className="md-link missing"
        data-tooltip={t("“{0}” isn't in the notes folder", [title])}
      >
        {children}
      </span>
    );
  return (
    <button
      type="button"
      className="md-link"
      data-tooltip={path.replace(/\.(md|markdown)$/i, "")}
      disabled={!onOpenNote}
      onClick={() => onOpenNote?.(path, heading)}
    >
      {children}
    </button>
  );
}

const images = new Map<string, Promise<string>>();
function LocalImage({ path, alt }: { path: string; alt: string }) {
  const { projectId } = useContext(Context);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState("");
  useEffect(() => {
    let active = true;
    const key = `${projectId}\n${path}`;
    let load = images.get(key);
    if (!load) {
      load = documentImage(projectId, path);
      images.set(key, load);
      load.catch(() => images.delete(key));
    }
    load.then(
      (url) => active && setSrc(url),
      (e) => active && setFailed(String(e)),
    );
    return () => {
      active = false;
    };
  }, [projectId, path]);
  if (failed) return <span className="md-missing">{failed}</span>;
  return src ? (
    <img className="md-image" src={src} alt={alt} />
  ) : (
    <span className="md-image loading" aria-label={alt} />
  );
}

/** Images from the internet are not loaded: the window's policy blocks them, on purpose. */
function ExternalImage({ src, alt }: { src: string; alt: string }) {
  const { onError } = useContext(Context);
  return (
    <span className="md-missing">
      <Icon name="external" size={12} />
      <span className="truncate">
        {t("Image from the web:")} {alt || src}
      </span>
      <button
        type="button"
        className="button small"
        onClick={() =>
          void openUrl(src).catch(() =>
            onError?.(t("Only https images open in the browser.")),
          )
        }
      >
        {t("Open in browser")}
      </button>
    </span>
  );
}
