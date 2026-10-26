import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { copyText, errorMessage } from "../../lib/api";
import { changeLetter, changeTitle, splitPath, totals } from "../../lib/diff";
import {
  frontState,
  type Front,
  type Fronts,
  type Reach,
} from "../../lib/fronts";
import { Icon } from "../Icon";
import { dateTime, type FileDiff, type GitCommit } from "../../lib/types";
import { locale, t } from "../../lib/i18n";

export const prState = (state: string) =>
  state === "open"
    ? t("Open|state")
    : state === "merged"
      ? t("Merged")
      : t("Closed");

const day = new Intl.DateTimeFormat(locale, {
  day: "2-digit",
  month: "2-digit",
});
const hour = new Intl.DateTimeFormat(locale, {
  hour: "2-digit",
  minute: "2-digit",
});

/** "hoje, 14:32", "ontem, 09:10" or the day, for a commit's time in seconds. */
export function when(seconds: number) {
  const date = new Date(seconds * 1000);
  const today = new Date();
  const days = Math.round(
    (new Date(today.toDateString()).getTime() -
      new Date(date.toDateString()).getTime()) /
      86_400_000,
  );
  if (days === 0) return t("today, {0}", [hour.format(date)]);
  if (days === 1) return t("yesterday, {0}", [hour.format(date)]);
  return day.format(date);
}

export const frontTitle = (front: Front) =>
  front.task?.title ?? front.pr?.title ?? front.branch ?? t("No branch");

/** Commits of the work that only exist on this Mac; null without a remote to compare with. */
export const unpushed = (commits: GitCommit[], reach: Reach) =>
  reach.hasRemote
    ? commits.filter((c) => !reach.pushed.has(c.id)).length
    : null;

const tone: Record<string, string> = {
  ok: "ok",
  progress: "info",
  warn: "warn",
  muted: "muted",
};

/** Where a line of work stands, in short tags. */
export function StateTags({
  front,
  fronts,
  reach,
}: {
  front: Front;
  fronts: Fronts;
  reach: Reach;
}) {
  const state = frontState(front, fronts);
  const local = unpushed(front.commits, reach);
  return (
    <>
      {state && (
        <span className={`tag ${tone[state.tone]}`}>{state.label}</span>
      )}
      {local ? (
        <span className="tag warn">
          {local} {t("not pushed")}
        </span>
      ) : null}
      {front.pr && !state?.label.includes(`#${front.pr.number}`) && (
        <span className="tag muted">
          {t("PR #")}
          {front.pr.number}
        </span>
      )}
      {front.task && front.branch && (
        <code className={`truncate ${front.gone ? "gone" : ""}`}>
          {front.branch}
        </code>
      )}
    </>
  );
}

/** A commit message's body as paragraphs and the "- " lists Git messages often carry. */
function MessageBody({ body }: { body: string }) {
  const blocks: ReactNode[] = [];
  let items: string[] = [];
  const flush = () => {
    if (items.length)
      blocks.push(
        <ul key={blocks.length}>
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>,
      );
    items = [];
  };
  for (const line of body.split("\n")) {
    const item = line.match(/^\s*[-*•]\s+(.*)/);
    if (item) items.push(item[1]);
    else if (items.length && /^\s+\S/.test(line))
      items[items.length - 1] += ` ${line.trim()}`;
    else {
      flush();
      if (line.trim()) blocks.push(<p key={blocks.length}>{line}</p>);
    }
  }
  flush();
  return <div className="commit-peek-body">{blocks}</div>;
}

function PeekCard({
  commit,
  refs,
  files,
  at,
  onEnter,
  onLeave,
}: {
  commit: GitCommit;
  refs?: ReactNode;
  files?: () => Promise<FileDiff[]>;
  at: { left: number; top: number };
  onEnter: () => void;
  onLeave: () => void;
}) {
  const [copied, setCopied] = useState<"" | "done" | "failed">("");
  const [sum, setSum] = useState<{
    count: number;
    additions: number;
    deletions: number;
  } | null>(null);
  useEffect(() => {
    let live = true;
    files?.().then(
      (list) => live && setSum({ count: list.length, ...totals(list) }),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(""), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  // The card is a child of the row in React, so its clicks must not select or open the commit.
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();
  return (
    <div
      className="commit-peek"
      role="tooltip"
      style={{ left: at.left, top: at.top }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onMouseDown={stop}
      onClick={stop}
      onDoubleClick={stop}
      ref={(card) => {
        // Kept inside the window when the message is long.
        if (!card) return;
        const over =
          card.getBoundingClientRect().bottom - window.innerHeight + 16;
        if (over > 0) card.style.top = `${Math.max(16, at.top - over)}px`;
      }}
    >
      <span className="commit-peek-head">
        <span className="commit-peek-meta">
          <strong>{commit.author}</strong>
          <span>
            {when(commit.date)} ({dateTime(commit.date)})
          </span>
        </span>
        {copied && (
          <span className="commit-peek-done">
            {copied === "done" ? t("Hash copied") : t("Couldn't copy")}
          </span>
        )}
        <button
          type="button"
          className="commit-peek-hash"
          title={commit.id}
          aria-label={t("Copy hash {0}", [commit.shortId])}
          onClick={() =>
            void copyText(commit.id).then(
              () => setCopied("done"),
              () => setCopied("failed"),
            )
          }
        >
          <Icon name={copied === "done" ? "check" : "copy"} size={12} />
          {commit.shortId}
        </button>
      </span>
      <span className="commit-peek-subject">{commit.subject}</span>
      {commit.body && <MessageBody body={commit.body} />}
      {(files || refs) && (
        <span className="commit-peek-foot">
          {files && (
            <span className="commit-peek-stats">
              {sum ? (
                <>
                  {sum.count === 1
                    ? t("1 file changed")
                    : t("{0} files changed", [sum.count])}
                  ,{" "}
                  <b>
                    {sum.additions}{" "}
                    {sum.additions === 1 ? t("insertion") : t("insertions")} (+)
                  </b>
                  ,{" "}
                  <i>
                    {sum.deletions}{" "}
                    {sum.deletions === 1 ? t("deletion") : t("deletions")} (−)
                  </i>
                </>
              ) : (
                t("Counting files…")
              )}
            </span>
          )}
          {refs && <span className="commit-peek-refs">{refs}</span>}
        </span>
      )}
    </div>
  );
}

/**
 * The commit's author, date, full message and hash in a card that opens after the pointer rests
 * on `handlers`' element for a moment. The pointer can move into the card to copy the hash; a
 * click, a key or a scroll closes it.
 */
function useCommitPeek(
  commit: GitCommit,
  refs?: ReactNode,
  files?: () => Promise<FileDiff[]>,
) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const card = useRef(false);
  const clear = () => window.clearTimeout(timer.current);
  const hide = () => {
    clear();
    setAt(null);
  };
  const close = () => {
    clear();
    timer.current = window.setTimeout(() => setAt(null), 200);
  };
  useEffect(() => clear, []);
  useEffect(() => {
    if (!at) return;
    const scroll = (event: Event) => {
      if (!(event.target as Element).closest?.(".commit-peek")) hide();
    };
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("keydown", hide);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("keydown", hide);
      window.removeEventListener("blur", hide);
    };
  }, [at]);
  const handlers = {
    onMouseEnter: (event: MouseEvent<HTMLElement>) => {
      clear();
      if (at) return;
      const anchor = event.currentTarget;
      timer.current = window.setTimeout(() => {
        const box = anchor.getBoundingClientRect();
        const width = Math.min(440, window.innerWidth - 32);
        setAt({
          left: Math.max(
            16,
            Math.min(box.right + 8, window.innerWidth - width - 16),
          ),
          top: Math.max(16, box.top),
        });
      }, 500);
    },
    onMouseLeave: () => {
      if (!card.current) close();
    },
    onMouseDown: hide,
  };
  const peek =
    at &&
    createPortal(
      <PeekCard
        commit={commit}
        refs={refs}
        files={files}
        at={at}
        onEnter={() => {
          card.current = true;
          clear();
        }}
        onLeave={() => {
          card.current = false;
          close();
        }}
      />,
      document.body,
    );
  return { handlers, peek };
}

/** Gives `children` the handlers that open the commit's card, for a row or a mark. */
export function CommitPeek({
  commit,
  refs,
  files,
  children,
}: {
  commit: GitCommit;
  /** The branches and tags at the commit, shown under its message. */
  refs?: ReactNode;
  /** Its changed files, loaded when the card opens for the count of lines. */
  files?: () => Promise<FileDiff[]>;
  children: (
    handlers: ReturnType<typeof useCommitPeek>["handlers"],
  ) => ReactNode;
}) {
  const { handlers, peek } = useCommitPeek(commit, refs, files);
  return (
    <>
      {children(handlers)}
      {peek}
    </>
  );
}

/** Local changes: a dashed ring, a commit still to come; grey when nothing is pending. */
export function PendingRing({ clean }: { clean: boolean }) {
  return (
    <svg
      className={`pending-ring ${clean ? "clean" : ""}`}
      viewBox="0 0 12 12"
      aria-hidden="true"
    >
      {/* pathLength makes the eight dashes even whatever the size. */}
      <circle cx="6" cy="6" r="4.75" pathLength="16" />
    </svg>
  );
}

/**
 * The branches and tags at a commit. A remote branch at the same commit as its local one folds
 * into the local badge, so `main` and `origin/main` in sync take one badge. The main branch
 * comes first, then the current one, other local ones, remote ones and tags; past `limit`, the
 * rest become a count.
 */
export function RefBadges({
  refs,
  tint,
  local,
  main,
  limit,
}: {
  refs: string[];
  tint: string;
  local: string[];
  main?: string | null;
  limit?: number;
}) {
  const names = refs.map((ref) => ref.replace("HEAD -> ", ""));
  const synced = new Map<string, string>();
  for (const name of names) {
    const slash = name.indexOf("/");
    if (local.includes(name) || slash < 0) continue;
    const branch = name.slice(slash + 1);
    if (local.includes(branch) && names.includes(branch) && !synced.has(branch))
      synced.set(branch, name);
  }
  const folded = new Set(synced.values());
  const rank = (ref: string) => {
    const name = ref.replace("HEAD -> ", "");
    if (name === main) return 0;
    if (ref.startsWith("HEAD -> ")) return 1;
    if (local.includes(name)) return 2;
    return ref.startsWith("tag: ") ? 4 : 3;
  };
  const shown = refs
    .filter(
      (ref) => !folded.has(ref) && ref !== "HEAD" && !ref.endsWith("/HEAD"),
    )
    .sort((a, b) => rank(a) - rank(b));
  const hidden = limit === undefined ? [] : shown.splice(limit);
  return (
    <>
      {shown.map((ref) => (
        <RefBadge
          key={ref}
          label={ref}
          tint={tint}
          local={local}
          remote={synced.get(ref.replace("HEAD -> ", ""))}
        />
      ))}
      {hidden.length > 0 && (
        <span
          className="ref-more"
          title={hidden
            .map((ref) => ref.replace("HEAD -> ", "").replace("tag: ", ""))
            .join(", ")}
        >
          +{hidden.length}
        </span>
      )}
    </>
  );
}

/** A branch or tag pointing at a commit, tinted with its line in the graph. */
export function RefBadge({
  label,
  tint,
  local,
  remote: upstream,
}: {
  label: string;
  tint: string;
  local: string[];
  /** The remote branch at the same commit, folded into this badge. */
  remote?: string;
}) {
  const current = label.startsWith("HEAD -> ");
  const name = label.replace("HEAD -> ", "").replace("tag: ", "");
  const tag = label.startsWith("tag: ");
  const remote = !tag && !local.includes(name) && name.includes("/");
  if (name === "HEAD" || name.endsWith("/HEAD")) return null;
  return (
    <span
      className={`ref-badge ${remote ? "remote" : ""}`}
      style={{
        color: tint,
        borderColor: `${tint}66`,
        background: `${tint}14`,
      }}
      title={
        upstream
          ? t("{0}: in sync with {1}", [name, upstream])
          : current
            ? t("{0}: current branch", [name])
            : remote
              ? t("{0}: remote branch", [name])
              : tag
                ? t("Tag {0}", [name])
                : name
      }
    >
      {current && <span className="ref-current" aria-hidden="true" />}
      {/* The cloud marks a commit already on the remote: a remote branch, or a local one in sync. */}
      {!tag && (
        <Icon name={remote || upstream ? "cloud" : "branch"} size={10} />
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}

export function FilePath({ path }: { path: string }) {
  const { folder, name } = splitPath(path);
  return (
    <span className="file-path" title={path}>
      <span className="file-name">{name}</span>
      {/* Marks keep leading dots and slashes in place inside the right-to-left truncation. */}
      {folder && (
        <span className="file-folder">{`‎${folder.replace(/\/$/, "")}‎`}</span>
      )}
    </span>
  );
}

export function DiffStats({ files }: { files: FileDiff[] }) {
  const sum = totals(files);
  return (
    <span className="diff-stats">
      <b>+{sum.additions}</b>
      <i>−{sum.deletions}</i>
    </span>
  );
}

/**
 * Five squares split between added and removed lines, as on GitHub; a change under five lines
 * fills only as many, so small edits look small.
 */
export function DiffBlocks({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}) {
  const total = additions + deletions;
  const filled = Math.min(5, total);
  let added = total ? Math.round((additions / total) * filled) : 0;
  if (additions && !added) added = 1;
  if (deletions && added === filled && filled > 1) added -= 1;
  return (
    <span className="diff-blocks" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <i
          key={i}
          className={i < added ? "add" : i < filled ? "del" : undefined}
        />
      ))}
    </span>
  );
}

/** Changed files, each opening the changes on itself. */
export function FileRows({
  files,
  onOpen,
}: {
  files: FileDiff[];
  onOpen: (path: string) => void;
}) {
  return (
    <ul className="file-list">
      {files.map((f) => (
        <li key={f.path}>
          <button
            type="button"
            className="file-item with-blocks"
            title={`${changeTitle(f.change)}: ${f.oldPath ? `${f.oldPath} → ` : ""}${f.path}`}
            onClick={() => onOpen(f.path)}
          >
            <code className={`change-code ${f.change}`}>
              {changeLetter(f.change)}
            </code>
            <FilePath path={f.path} />
            {f.isBinary ? (
              <span className="diff-stats muted">{t("bin")}</span>
            ) : (
              <span className="diff-stats">
                <b>+{f.additions}</b>
                <i>−{f.deletions}</i>
              </span>
            )}
            <DiffBlocks additions={f.additions} deletions={f.deletions} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Loads `load()` again whenever `key` changes; null key loads nothing. */
export function useLoad<T>(key: string | null, load: () => Promise<T>) {
  const [state, setState] = useState<{
    key: string | null;
    value?: T;
    error?: string;
  }>({ key: null });
  useEffect(() => {
    if (!key) return;
    let active = true;
    load().then(
      (value) => active && setState({ key, value }),
      (e) => active && setState({ key, error: errorMessage(e) }),
    );
    return () => {
      active = false;
    };
    // `load` is rebuilt every render; the key names what it loads.
  }, [key]);
  const current = state.key === key;
  return {
    value: current ? state.value : undefined,
    error: current ? (state.error ?? "") : "",
    loading: Boolean(key) && !current,
  };
}
