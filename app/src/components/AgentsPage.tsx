import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  agentPath,
  copyText,
  deleteAgentProfile,
  editAgentProfile,
  errorMessage,
} from "../lib/api";
import {
  agentColor,
  agentColors,
  presenceTitle,
  shortName,
} from "../lib/agents";
import {
  ago,
  statusTitle,
  type AgentProfile,
  type Project,
  type Task,
} from "../lib/types";
import { t } from "../lib/i18n";
import { AgentBot, botEyes, botShapes } from "./AgentBot";
import { TraitPicker } from "./AgentProfiles";
import { ColorPicker } from "./ProjectComposer";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { Segmented } from "./Segmented";
import { projectColor } from "./Sidebar";

const order: Record<string, number> = { inProgress: 0, review: 1, todo: 2 };

/**
 * Every agent session of the workspace by what it's doing: working, stopped, or gone but still
 * holding tasks. The chosen one opens beside the cards, with its character to edit and its tasks.
 */
export function AgentsPage({
  profiles,
  tasks,
  projects,
  highlight,
  onOpen,
  onChanged,
  onSetup,
  onPick,
  notify,
}: {
  profiles: AgentProfile[];
  tasks: Task[];
  projects: Project[];
  highlight?: string;
  onOpen: (task: Task) => void;
  onChanged: () => void;
  onSetup: () => void;
  /** The open agent changed: kept in the place, so its face in the sidebar opens it again. */
  onPick: (id?: string) => void;
  notify: (message: string, error?: boolean) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(highlight ?? null);
  const [closing, setClosing] = useState(false);
  const [deleting, setDeleting] = useState<AgentProfile | null>(null);
  const open = (id: string) => {
    setClosing(false);
    setChosen(id);
    onPick(id);
  };
  const gone = () => {
    setChosen(null);
    setClosing(false);
    onPick();
  };
  // Slides out before it goes; with reduced motion there is no slide to wait for.
  const close = () => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) gone();
    else setClosing(true);
  };
  useEffect(() => {
    // The open agent's face clicked again: the place lost its id, so the panel goes.
    if (!highlight) {
      if (chosen && !closing) close();
      return;
    }
    open(highlight);
    document
      .getElementById(`agent-${highlight}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlight]);
  const held = new Map<string, Task[]>();
  for (const task of tasks)
    if (task.agentProfileId && task.status !== "done")
      held.set(task.agentProfileId, [
        ...(held.get(task.agentProfileId) ?? []),
        task,
      ]);
  for (const list of held.values())
    list.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
  // Those holding tasks first, then the most recent call.
  const recent = (a: AgentProfile, b: AgentProfile) =>
    Number(held.has(b.id)) - Number(held.has(a.id)) || b.activeAt - a.activeAt;
  const groups = [
    {
      title: t("Working"),
      list: profiles.filter((p) => p.presence === "active").sort(recent),
    },
    {
      title: t("Stopped agents"),
      list: profiles.filter((p) => p.presence === "idle").sort(recent),
    },
    {
      title: t("Disconnected"),
      list: profiles
        .filter((p) => p.presence === "offline" && held.has(p.id))
        .sort(recent),
    },
  ].filter((g) => g.list.length > 0);
  const shown = groups.flatMap((g) => g.list);
  const current = shown.find((p) => p.id === chosen);
  // Esc closes it, unless a task opened from it is on top: that one closes first.
  useEffect(() => {
    if (!current) return;
    const keyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !document.querySelector(".sheet, .confirm-modal")
      )
        close();
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  });
  return (
    <>
      <div className={`page scroll agents-page ${current ? "with-sheet" : ""}`}>
        <div className="page-inner wide">
          <header className="page-hero">
            <h1>{t("Agents")}</h1>
            <p>
              {t(
                "The agent sessions connected to this workspace and the tasks each one holds.",
              )}
            </p>
          </header>
          {shown.length === 0 ? (
            <EmptyAgents onSetup={onSetup} notify={notify} />
          ) : (
            <div className="agents-groups">
              {groups.map((group) => (
                <section key={group.title} aria-label={group.title}>
                  <h2 className="archive-group-head">
                    {group.title}
                    <span className="archive-group-meta">
                      {group.list.length}
                    </span>
                  </h2>
                  <ul className="agent-cards">
                    {group.list.map((profile) => {
                      const mine = held.get(profile.id) ?? [];
                      const now = mine.find((t) => t.status === "inProgress");
                      return (
                        <li key={profile.id} id={`agent-${profile.id}`}>
                          <button
                            type="button"
                            className={`agent-card ${profile.presence}`}
                            aria-pressed={profile.id === current?.id}
                            style={
                              {
                                "--agent": agentColor(profile),
                              } as CSSProperties
                            }
                            onClick={() =>
                              profile.id === current?.id && !closing
                                ? close()
                                : open(profile.id)
                            }
                          >
                            <AgentBot
                              shape={profile.shape}
                              eyes={profile.eyes}
                              color={agentColor(profile)}
                              size={40}
                            />
                            <span className="agent-card-name truncate">
                              {profile.displayName}
                            </span>
                            <span className="agent-card-task">
                              {(now ?? mine[0])?.title ?? t("No task")}
                            </span>
                            <span className="agent-card-meta">
                              {mine.length > 1 && (
                                <span>
                                  {t("+{0} tasks", [mine.length - 1])}
                                </span>
                              )}
                              <span>{ago(profile.activeAt)}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
      {current && (
        <aside
          className={`agent-sheet ${closing ? "closing" : ""}`}
          aria-label={current.displayName}
          onAnimationEnd={(event) => {
            if (closing && event.target === event.currentTarget) gone();
          }}
        >
          <button
            type="button"
            className="icon-button agent-sheet-close"
            aria-label={t("Close")}
            onClick={close}
          >
            <Icon name="close" size={14} />
          </button>
          <AgentSheet
            key={current.id}
            profile={current}
            tasks={held.get(current.id) ?? []}
            projects={projects}
            onOpen={onOpen}
            onChanged={onChanged}
            notify={notify}
          />
          {/* Deleting sits in the bottom corner, away from Close and the look it edits, so it
              isn't hit by mistake. It still asks first. */}
          <footer className="agent-sheet-foot">
            <button
              type="button"
              className="button small ghost agent-delete"
              onClick={() => setDeleting(current)}
            >
              <Icon name="trash" size={13} />
              {t("Delete agent…")}
            </button>
          </footer>
        </aside>
      )}
      {deleting && (
        <AgentDelete
          profile={deleting}
          taskCount={held.get(deleting.id)?.length ?? 0}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            gone();
            onChanged();
            notify(t("Agent deleted."));
          }}
        />
      )}
    </>
  );
}

/**
 * One agent in the panel slid in from the right: its character and name on top, then its look,
 * edited as you pick, or the tasks it holds. The cards stay in view beside it, so another one
 * switches it in place.
 */
function AgentSheet({
  profile,
  tasks,
  projects,
  onOpen,
  onChanged,
  notify,
}: {
  profile: AgentProfile;
  tasks: Task[];
  projects: Project[];
  onOpen: (task: Task) => void;
  onChanged: () => void;
  notify: (message: string, error?: boolean) => void;
}) {
  const [look, setLook] = useState({
    name: profile.name ?? "",
    color: profile.color,
    shape: profile.shape,
    eyes: profile.eyes,
  });
  const saved = useRef(look);
  const [tab, setTab] = useState<"look" | "tasks">("look");
  // Each change of the look replays the character's hop. The class is restarted rather than the
  // character remounted, so its bob and blink keep their clock.
  const hop = useRef<HTMLSpanElement>(null);
  const [hops, setHops] = useState(0);
  useEffect(() => {
    const element = hop.current;
    if (!hops || !element) return;
    element.classList.remove("go");
    void element.offsetWidth;
    element.classList.add("go");
  }, [hops]);
  function save(patch: Partial<typeof look>) {
    const next = { ...look, ...patch };
    if (
      next.color !== look.color ||
      next.shape !== look.shape ||
      next.eyes !== look.eyes
    )
      setHops((n) => n + 1);
    setLook(next);
    const before = saved.current;
    if (
      next.name.trim() === before.name.trim() &&
      next.color === before.color &&
      next.shape === before.shape &&
      next.eyes === before.eyes
    )
      return;
    saved.current = next;
    editAgentProfile(profile.id, next.name, next.color, next.shape, next.eyes)
      .then(onChanged)
      .catch((e) => {
        saved.current = before;
        setLook(before);
        notify(errorMessage(e), true);
      });
  }
  // A new color, shape and eyes, each different from now; the name stays.
  function shuffle() {
    const other = <T,>(list: T[], now: T) => {
      const rest = list.filter((value) => value !== now);
      return rest[Math.floor(Math.random() * rest.length)];
    };
    save({
      color: other(
        agentColors.map((_, index) => index),
        look.color,
      ),
      shape: other(
        botShapes.map((option) => option.value),
        look.shape,
      ),
      eyes: other(
        botEyes.map((option) => option.value),
        look.eyes,
      ),
    });
  }
  const color = agentColors[look.color]?.value ?? agentColors[0].value;
  const projectOf = (id: string) => projects.find((p) => p.id === id);
  return (
    <>
      <div className={`agent-stage ${profile.presence}`}>
        <span ref={hop} className="agent-hop">
          <AgentBot
            shape={look.shape}
            eyes={look.eyes}
            color={color}
            size={76}
          />
        </span>
        <input
          className="agent-name"
          aria-label={t("Name")}
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          value={look.name}
          placeholder={profile.displayName}
          onChange={(e) => setLook({ ...look, name: e.target.value })}
          onBlur={() => save({})}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.stopPropagation();
              setLook({ ...look, name: saved.current.name });
              e.currentTarget.blur();
            }
          }}
        />
        <span className="muted small">
          {presenceTitle[profile.presence]} ·{" "}
          {t("Session via {0}", [profile.client])} · {ago(profile.activeAt)}
        </span>
        <Segmented
          className="agent-tabs"
          label={t("Agent")}
          value={tab}
          onChange={setTab}
          options={[
            { value: "look", label: t("Look") },
            {
              value: "tasks",
              label: (
                <>
                  {t("Tasks")}
                  <span className="segmented-count">{tasks.length}</span>
                </>
              ),
            },
          ]}
        />
      </div>
      <div className="agent-sheet-body scroll">
        {tab === "look" ? (
          <div className="agent-traits">
            <div className="agent-color-head">
              <h3 id="agent-color">{t("Color")}</h3>
              <button
                type="button"
                className="button small ghost"
                onClick={shuffle}
              >
                <Icon name="dice" size={13} />
                {t("Shuffle")}
              </button>
            </div>
            <ColorPicker
              id="agent-color-input"
              labelId="agent-color"
              value={look.color}
              onChange={(value) => save({ color: value })}
              palette={agentColors}
            />
            <h3 id="agent-shape">{t("Shape")}</h3>
            <TraitPicker
              id="agent-shape-input"
              labelId="agent-shape"
              options={botShapes}
              value={look.shape}
              onChange={(value) => save({ shape: value })}
              draw={(value) => (
                <AgentBot
                  shape={value}
                  eyes={look.eyes}
                  color={color}
                  size={34}
                />
              )}
            />
            <h3 id="agent-eyes">{t("Eyes")}</h3>
            <TraitPicker
              id="agent-eyes-input"
              labelId="agent-eyes"
              options={botEyes}
              value={look.eyes}
              onChange={(value) => save({ eyes: value })}
              draw={(value) => (
                <AgentBot
                  shape={look.shape}
                  eyes={value}
                  color={color}
                  size={34}
                />
              )}
            />
            <p className="muted small">
              {t("What you change here the agent can no longer change.")}
            </p>
          </div>
        ) : (
          <div className="agent-tasks">
            {tasks.length > 0 ? (
              <ul className="rows">
                {tasks.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      className="row-button"
                      onClick={() => onOpen(task)}
                    >
                      <span
                        className="swatch"
                        style={{
                          background: projectColor(projectOf(task.projectId)),
                        }}
                        aria-hidden="true"
                      />
                      <span className="row-title truncate">{task.title}</span>
                      <span className="row-sub">
                        {statusTitle[task.status]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">
                {t("This agent holds no task right now.")}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/** Deletes an agent after confirming. Its tasks go to any agent; the history keeps its name. */
function AgentDelete({
  profile,
  taskCount,
  onClose,
  onDeleted,
}: {
  profile: AgentProfile;
  taskCount: number;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title={t("Delete agent?")}
      className="confirm-modal"
      onClose={onClose}
    >
      <div className="modal-body">
        <p className="modal-text">
          {taskCount === 0
            ? t(
                "“{0}” leaves the Agents page, but the history still shows it. This can't be undone.",
                [shortName(profile.displayName)],
              )
            : taskCount === 1
              ? t(
                  "“{0}” leaves the Agents page and its task goes to any agent. The history still shows it. This can't be undone.",
                  [shortName(profile.displayName)],
                )
              : t(
                  "“{0}” leaves the Agents page and its {1} tasks go to any agent. The history still shows it. This can't be undone.",
                  [shortName(profile.displayName), taskCount],
                )}
        </p>
        {profile.presence !== "offline" && (
          <p className="modal-text muted">
            {t("Its session goes on as a new agent on its next call.")}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="modal-footer">
        <span className="footer-hint" />
        <button type="button" className="button" onClick={onClose}>
          {t("Cancel")}
        </button>
        <button
          type="button"
          className="button danger"
          disabled={busy}
          aria-busy={busy}
          onClick={() => {
            setBusy(true);
            deleteAgentProfile(profile.id)
              .then(onDeleted)
              .catch((e) => {
                setError(errorMessage(e));
                setBusy(false);
              });
          }}
        >
          {t("Delete agent")}
        </button>
      </footer>
    </Modal>
  );
}

/** No agent yet: what connecting one takes, and the command to do it. */
function EmptyAgents({
  onSetup,
  notify,
}: {
  onSetup: () => void;
  notify: (message: string, error?: boolean) => void;
}) {
  const binary = useRef("trama-agent");
  useEffect(() => {
    void agentPath()
      .then((path) => (binary.current = path))
      .catch(() => {});
  }, []);
  function copy() {
    const path = binary.current;
    const command = `claude mcp add trama -- ${/\s/.test(path) ? `"${path}"` : path} --workspace`;
    void copyText(command).then(
      () => notify(t("Command copied.")),
      () => notify(t("Couldn't copy."), true),
    );
  }
  return (
    <div className="empty-state agents-empty">
      <AgentBot shape="blob" eyes="sleepy" color="var(--ink-off)" size={44} />
      <strong>{t("No agent connected")}</strong>
      <p>
        {t(
          "Connect Claude Code or another agent through MCP and it shows up here, with the tasks it picks up.",
        )}
      </p>
      <div className="agents-empty-actions">
        <button type="button" className="button primary" onClick={copy}>
          <Icon name="copy" size={13} />
          {t("Copy command")}
        </button>
        <button type="button" className="button" onClick={onSetup}>
          {t("Open setup")}
        </button>
      </div>
    </div>
  );
}
