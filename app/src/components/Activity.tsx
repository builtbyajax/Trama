import { Fragment, useState, type FormEvent, type ReactNode } from "react";
import {
  ago,
  dateTime,
  statusTitle,
  type TaskDetails,
  type TaskEvent,
  type AgentProfile,
  type TaskStatus,
} from "../lib/types";
import { agentName, useAgentProfiles } from "../lib/agents";
import { noteName } from "../lib/markdown";
import { Glyph } from "./BoardFilters";
import { Icon } from "./Icon";
import { t } from "../lib/i18n";
import { Segmented } from "./Segmented";

export type ActivityFilter = "all" | "notes" | "agent";
interface Entry {
  id: string;
  kind: "note" | "agent" | "user" | "system";
  at: number;
  meta?: string;
  text?: string;
  /** Short lines under the text: what changed, and delivery references. */
  changes: ReactNode[];
  refs: string[];
  noteId?: string;
  /** The agent's profile, on what an agent session wrote. */
  profileId?: string | null;
}

/** A note, branch or other value inside a change line, set apart from the words around it. */
const named = (value: string | null, note = false) => (
  <span className="entry-name">
    {note && <Icon name="file" size={12} />}
    {note ? noteName(value ?? "") : value}
  </span>
);
const status = (value: string | null) =>
  statusTitle[value as TaskStatus] ?? value ?? "";
/** Who a profile event names: the profile, or any agent when it was cleared. */
const holder = (e: TaskEvent, profiles: Map<string, AgentProfile>) =>
  e.value ? agentName(profiles.get(e.value)) : t("Any agent");
const agentChange = (
  e: TaskEvent,
  profiles: Map<string, AgentProfile>,
): ReactNode => {
  switch (e.kind) {
    case "created":
      return t("Created the task");
    case "status":
      return t("Moved to {0}|actor", [status(e.value)]);
    case "assignee":
      return e.value === "agent" ? t("Took the task") : t("Handed to you");
    case "category":
      return (
        <>
          {t("Category:")} {named(e.value)}
        </>
      );
    case "branch":
      return e.value ? (
        <>
          {t("Branch:")} {named(e.value)}
        </>
      ) : (
        t("Removed the branch")
      );
    case "title":
      return (
        <>
          {t("Renamed to")} {named(e.value)}
        </>
      );
    case "details":
      return t("Updated the briefing");
    case "document":
      return (
        <>
          {t("Attached the note")} {named(e.value, true)}
        </>
      );
    case "documentRemoved":
      return (
        <>
          {t("Removed the note")} {named(e.value, true)}
        </>
      );
    case "goal":
      return e.value ? (
        <>
          {t("Goal:")} {named(e.value)}
        </>
      ) : (
        t("Removed the goal")
      );
    case "agentProfile":
      return t("Took the task as {0}", [holder(e, profiles)]);
  }
};
const personChange = (
  e: TaskEvent,
  profiles: Map<string, AgentProfile>,
): ReactNode => {
  switch (e.kind) {
    case "created":
      return e.actor ? t("Created by you") : t("Task created");
    case "status":
      return t("Moved to {0}", [status(e.value)]);
    case "assignee":
      return e.value === "agent"
        ? t("Handed to the agent")
        : t("Handed to you");
    case "category":
      return (
        <>
          {t("Category changed to")} {named(e.value)}
        </>
      );
    case "branch":
      return e.value ? (
        <>
          {t("Branch changed to")} {named(e.value)}
        </>
      ) : (
        t("Branch removed")
      );
    case "document":
      return (
        <>
          {t("Note")} {named(e.value, true)} {t("attached")}
        </>
      );
    case "documentRemoved":
      return (
        <>
          {t("Note")} {named(e.value, true)} {t("removed from attachments")}
        </>
      );
    case "goal":
      return e.value ? (
        <>
          {t("Goal changed to")} {named(e.value)}
        </>
      ) : (
        t("Goal removed")
      );
    case "agentProfile":
      return t("Handed to {0}", [holder(e, profiles)]);
    default:
      return agentChange(e, profiles);
  }
};
const reference = (e: TaskEvent) =>
  !e.value
    ? undefined
    : e.kind === "commit"
      ? e.value.slice(0, 7)
      : e.kind === "pullRequest"
        ? `PR #${e.value}`
        : undefined;

/**
 * Newest first. Events written by one call share a timestamp and read as one entry: the agent's
 * summary, what it changed and the commit or PR it registered.
 */
export function activityEntries(
  details: TaskDetails,
  profiles: Map<string, AgentProfile> = new Map(),
): Entry[] {
  const entries: Entry[] = [];
  const groups = new Map<string, TaskEvent[]>();
  for (const e of details.events) {
    const key = `${e.actor}:${e.agentProfileId ?? ""}:${e.createdAt}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  for (const [key, events] of groups) {
    const agent = events[0].actor === "agent";
    const summary = events.find((e) => e.kind === "summary")?.value;
    entries.push({
      id: key,
      kind: agent ? "agent" : "system",
      at: events[0].createdAt,
      meta: agent && summary ? "resumo" : undefined,
      text: agent ? (summary ?? undefined) : undefined,
      changes: events
        .map((e) => (agent ? agentChange : personChange)(e, profiles))
        .filter(Boolean),
      profileId: agent ? events[0].agentProfileId : undefined,
      refs: events
        .map(reference)
        .filter((line): line is string => Boolean(line)),
    });
  }
  for (const m of details.messages)
    entries.push({
      id: m.id,
      kind: m.author === "agent" ? "agent" : "user",
      at: m.createdAt,
      meta: m.author === "agent" ? t("comment") : t("message to the agent"),
      text: m.body,
      changes: [],
      refs: [],
      profileId: m.author === "agent" ? m.agentProfileId : undefined,
    });
  for (const n of details.notes)
    entries.push({
      id: n.id,
      kind: "note",
      at: n.createdAt,
      meta: t("only yours"),
      text: n.body,
      changes: [],
      refs: [],
      noteId: n.id,
    });
  // A summary-less agent entry made only of delivery references still says what it did.
  for (const entry of entries)
    if (entry.kind === "agent" && !entry.text && !entry.changes.length)
      entry.changes.push(t("Logged the delivery"));
  return entries.sort((a, b) => b.at - a.at);
}

const filters: { value: ActivityFilter; label: string }[] = [
  { value: "all", label: t("All") },
  { value: "notes", label: t("Annotations") },
  { value: "agent", label: t("Agent") },
];

/**
 * The task's activity: the person's private notes, what the agent reported and how the task
 * moved. Notes are written here; the agent never reads them.
 */
export function Activity({
  details,
  error,
  onAddNote,
  onDeleteNote,
}: {
  details: TaskDetails | null;
  error?: string;
  onAddNote: (body: string) => Promise<boolean>;
  onDeleteNote: (id: string) => void;
}) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const profiles = useAgentProfiles();
  const all = details ? activityEntries(details, profiles) : [];
  const entries = all.filter(
    (e) =>
      filter === "all" ||
      (filter === "notes" ? e.kind === "note" : e.kind === "agent"),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    if (await onAddNote(body)) {
      setDraft("");
      if (filter === "agent") setFilter("all");
    }
    setBusy(false);
  }
  return (
    <section className="activity" aria-labelledby="activity-title">
      <header className="activity-head">
        <h2 id="activity-title" className="caps">
          {t("Activity")}
        </h2>
        <Segmented
          size="small"
          label={t("Filter activity")}
          options={filters}
          value={filter}
          onChange={setFilter}
        />
      </header>
      <ol className="activity-list scroll" aria-label={t("Task activity")}>
        {entries.map((e) => (
          <li key={e.id} className={`entry ${e.kind}`}>
            <span className="entry-node" aria-hidden="true">
              <Glyph
                who={e.kind === "agent" ? "agent" : "user"}
                profileId={e.profileId}
              />
            </span>
            <div className="entry-body">
              {e.kind !== "system" && (
                <span className="entry-head">
                  <span className="entry-who">
                    {e.kind === "agent"
                      ? agentName(
                          e.profileId ? profiles.get(e.profileId) : undefined,
                        )
                      : t("You")}
                  </span>
                  <span className="entry-meta" title={dateTime(e.at)}>
                    {" · "}
                    {e.meta ? `${e.meta} · ` : ""}
                    {ago(e.at)}
                  </span>
                  {e.noteId &&
                    (confirm === e.noteId ? (
                      <span className="entry-confirm">
                        <button
                          type="button"
                          className="link-button danger"
                          onClick={() => {
                            setConfirm(null);
                            onDeleteNote(e.noteId!);
                          }}
                        >
                          {t("Delete")}
                        </button>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => setConfirm(null)}
                        >
                          {t("Keep")}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="icon-button entry-delete"
                        aria-label={t("Delete annotation")}
                        data-tooltip={t("Delete annotation")}
                        onClick={() => setConfirm(e.noteId!)}
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    ))}
                </span>
              )}
              {e.text && <p className="entry-text">{e.text}</p>}
              {e.changes.length > 0 && (
                <span
                  className={
                    e.kind === "system" ? "entry-system" : "entry-changes"
                  }
                >
                  {e.changes.map((line, i) => (
                    <Fragment key={i}>
                      {i > 0 && " · "}
                      {line}
                    </Fragment>
                  ))}
                  {e.kind === "system" && (
                    <span className="entry-meta" title={dateTime(e.at)}>
                      {" · "}
                      {ago(e.at)}
                    </span>
                  )}
                </span>
              )}
              {e.refs.length > 0 && (
                <code className="entry-refs">{e.refs.join(" · ")}</code>
              )}
            </div>
          </li>
        ))}
        {details && entries.length === 0 && (
          <li className="activity-empty">
            {filter === "notes"
              ? t("No annotations yet.")
              : filter === "agent"
                ? t("The agent hasn't logged anything here yet.")
                : t("Nothing here yet.")}
          </li>
        )}
        {error && (
          <li className="form-error" role="alert">
            {error}
          </li>
        )}
      </ol>
      <form className="note-composer" onSubmit={submit}>
        <label className="note-field">
          <Glyph who="user" />
          <input
            aria-label={t("New annotation")}
            aria-describedby="note-hint"
            placeholder={t("Write something just for you…")}
            value={draft}
            maxLength={4000}
            onChange={(event) => setDraft(event.target.value)}
          />
          <kbd aria-hidden="true">↩</kbd>
        </label>
        <p id="note-hint" className="note-hint">
          {t(
            "Only you see these. The agent doesn't read or change annotations.",
          )}
        </p>
      </form>
    </section>
  );
}
