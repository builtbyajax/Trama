import { type CSSProperties, type ReactNode, useState } from "react";
import { agentName, useAgentProfiles } from "../lib/agents";
import { locale, t } from "../lib/i18n";
import type { Goal, Task } from "../lib/types";
import { doneShown } from "./Board";
import { type BoardFilter, Glyph } from "./BoardFilters";
import { concludedDay } from "./Goals";
import { Icon, StatusIcon } from "./Icon";

const day = 86_400;
const week = 7 * day;

/** The Monday that starts the week of a moment, in local time, as seconds. */
function weekOf(seconds: number) {
  const date = new Date(seconds * 1000);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.getTime() / 1000;
}
/** The local midnight of a moment, as seconds. */
export function dayOf(seconds: number) {
  const date = new Date(seconds * 1000);
  date.setHours(0, 0, 0, 0);
  return date.getTime() / 1000;
}
const doneAt = (task: Task) => task.archivedAt ?? task.updatedAt;
/** Whole days a task took from its creation to being done, at least one. */
const took = (task: Task) =>
  Math.max(1, Math.round((doneAt(task) - task.createdAt) / day));
const days = (count: number) =>
  count === 1 ? t("1 day") : t("{0} days", [count]);
const shortDay = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  });

/** The goal's target day as its local midnight, in seconds. */
export function targetOf(goal: Goal) {
  if (!goal.targetDate) return null;
  const [y, m, d] = goal.targetDate.split("-").map(Number);
  return new Date(y, m - 1, d).getTime() / 1000;
}

/** How the conclusion landed against the target day. */
export function timing(target: number | null, completedAt: number) {
  if (target == null) return t("Concluded on {0}", [concludedDay(completedAt)]);
  const late = Math.round((dayOf(completedAt) - target) / day);
  const when =
    late === 0
      ? t("on the target day")
      : late === -1
        ? t("1 day before the target")
        : late === 1
          ? t("1 day after the target")
          : late < 0
            ? t("{0} days before the target", [-late])
            : t("{0} days after the target", [late]);
  return t("Concluded on {0}, {1}", [concludedDay(completedAt), when]);
}

/** What the timeline can single out, and the attention tags. */
type Focus = "long" | "late" | "none";

/**
 * A concluded goal with nothing left open: each task from its creation to being done against
 * the target, and what needs a look, in place of the empty columns.
 */
export function GoalRecap({
  goal,
  tasks,
  filter,
  onOpen,
  onArchive,
  onFilter,
}: {
  goal: Goal & { completedAt: number };
  /** The goal's done tasks, the most recently done first. */
  tasks: Task[];
  /** The board's filters, named when they leave nothing to show. */
  filter: BoardFilter;
  onOpen: (task: Task) => void;
  onArchive: () => void;
  onFilter: (patch: Partial<BoardFilter>) => void;
}) {
  const profiles = useAgentProfiles();
  const withAgent = tasks.filter((task) => task.assignee === "agent").length;
  const commits = tasks.filter((task) => task.commitHash).length;
  const pulls = tasks.filter((task) => task.pullRequestNumber != null).length;
  const begun = Math.min(
    goal.createdAt,
    ...tasks.map((task) => task.createdAt),
  );
  const target = targetOf(goal);

  // The timeline runs from the week the first task was created to the conclusion or the
  // target, whichever is later, with a day to spare so the last mark isn't on the edge.
  const shown = tasks.slice(0, doneShown).sort((a, b) => doneAt(a) - doneAt(b));
  const start = weekOf(
    Math.min(goal.completedAt, ...shown.map((task) => task.createdAt)),
  );
  const end =
    Math.max(
      goal.completedAt,
      target ?? 0,
      ...shown.map((task) => doneAt(task)),
    ) + day;
  const at = (seconds: number) =>
    `${((Math.min(Math.max(seconds, start), end) - start) / (end - start)) * 100}%`;
  const ticks = Array.from(
    { length: Math.floor((end - start) / week) + 1 },
    (_, i) => start + i * week,
  );
  const late =
    target != null && dayOf(goal.completedAt) > target ? target : null;

  // What needs a look: the slowest tasks, those done after the target and those with nothing
  // recorded as delivered. When none has a delivery, that is said once instead of on every task.
  const ranked = [...tasks].sort((a, b) => took(b) - took(a)).slice(0, 3);
  const over = (task: Task) =>
    target == null ? 0 : Math.round((dayOf(doneAt(task)) - target) / day);
  const sets: Record<Focus, Set<string>> = {
    long: new Set(ranked.map((task) => task.id)),
    late: new Set(
      tasks.filter((task) => over(task) > 0).map((task) => task.id),
    ),
    none: new Set(
      tasks
        .filter(
          (task) =>
            !task.agentSummary &&
            !task.commitHash &&
            task.pullRequestNumber == null,
        )
        .map((task) => task.id),
    ),
  };
  const noneAll = sets.none.size === tasks.length;
  if (noneAll) sets.none.clear();
  const [focus, setFocus] = useState<Focus | null>(null);
  const focused = focus && sets[focus];
  const filters: [Focus, string][] = [
    ["long", t("Took the longest")],
    ["late", t("After the target")],
    ["none", t("No delivery")],
  ];

  const points = tasks
    .map((task) => {
      const tags: [Focus, string][] = [];
      const late = over(task);
      if (late > 0)
        tags.push([
          "late",
          late === 1
            ? t("1 day after the target")
            : t("{0} days after the target", [late]),
        ]);
      if (sets.none.has(task.id)) tags.push(["none", t("No delivery")]);
      if (sets.long.has(task.id))
        tags.push([
          "long",
          task === ranked[0]
            ? t("{0}, the longest", [days(took(task))])
            : days(took(task)),
        ]);
      return { task, tags };
    })
    .filter(({ tags }) => tags.length > 0)
    .sort(
      (a, b) =>
        b.tags.length - a.tags.length || doneAt(b.task) - doneAt(a.task),
    );

  if (tasks.length === 0) {
    // Each filter in force, with what takes it off.
    const active: [string, ReactNode, Partial<BoardFilter>][] = [];
    if (filter.category !== "*")
      active.push([filter.category, filter.category, { category: "*" }]);
    if (filter.assignee !== "all") {
      const name =
        filter.assignee === "user"
          ? t("You")
          : filter.agent === "*"
            ? t("All agents")
            : filter.agent === ""
              ? t("No agent set")
              : agentName(profiles.get(filter.agent));
      active.push([
        name,
        <>
          <Glyph
            who={filter.assignee}
            profileId={
              filter.assignee === "agent" ? filter.agent || null : null
            }
          />
          {name}
        </>,
        { assignee: "all", agent: "*" },
      ]);
    }
    if (filter.branch !== "*") {
      const name = filter.branch || t("No branch");
      active.push([name, name, { branch: "*" }]);
    }
    return (
      <div className="goal-recap scroll">
        <div className="recap-line">
          <StatusIcon status="done" size={16} />
          <strong>{timing(target, goal.completedAt)}</strong>
        </div>
        <div className="empty-state">
          <Icon name="board" size={22} />
          <strong>{t("No done task in this goal with these filters")}</strong>
          <span className="recap-filters">
            {active.map(([name, label, clear]) => (
              <button
                key={name}
                type="button"
                className="recap-chip removable"
                aria-label={t("Remove the filter {0}", [name])}
                title={t("Remove the filter {0}", [name])}
                onClick={() => onFilter(clear)}
              >
                {label}
                <Icon name="close" size={10} />
              </button>
            ))}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="goal-recap scroll">
      <div className="recap-line">
        <StatusIcon status="done" size={16} />
        <strong>{timing(target, goal.completedAt)}</strong>
        <span className="recap-chips">
          <span className="recap-chip">
            {days(Math.max(1, Math.round((goal.completedAt - begun) / day)))}
          </span>
          <span className="recap-chip">
            {t("{0} with the agent, {1} with you", [
              withAgent,
              tasks.length - withAgent,
            ])}
          </span>
          {(pulls > 0 || commits > 0) && (
            <span className="recap-chip">
              {t("{0} pull requests, {1} commits", [pulls, commits])}
            </span>
          )}
        </span>
      </div>

      <section className="recap-panel">
        <div className="recap-panel-head">
          <h3 className="recap-label">
            {t("Timeline, from each task's creation to its conclusion")}
          </h3>
          <span className="recap-filters">
            {filters
              .filter(([key]) => sets[key].size > 0)
              .map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`recap-filter ${key} ${focus === key ? "on" : ""}`}
                  aria-pressed={focus === key}
                  onClick={() => setFocus(focus === key ? null : key)}
                >
                  <span className="recap-filter-mark" />
                  <strong>{sets[key].size}</strong>
                  {label}
                </button>
              ))}
          </span>
          <span className="recap-legend">
            <span className="recap-key agent" />
            {t("Agent")}
            <span className="recap-key user" />
            {t("You")}
          </span>
        </div>
        <div className="recap-timeline">
          <div className="recap-grid" aria-hidden="true">
            {ticks.map((tick) => (
              <span
                key={tick}
                className="recap-tick"
                style={{ left: at(tick) }}
              />
            ))}
            {late != null && (
              <span
                className="recap-late"
                style={{
                  left: at(late),
                  width: `calc(${at(goal.completedAt)} - ${at(late)})`,
                }}
              />
            )}
            {target != null && (
              <span className="recap-target" style={{ left: at(target) }} />
            )}
            <span
              className="recap-finish"
              style={{ left: at(goal.completedAt) }}
            />
          </div>
          <div className="recap-track-row recap-axis">
            <span />
            <span className="recap-track">
              {ticks
                // The target's own label takes the place of a week's beside it.
                .filter(
                  (tick) => target == null || Math.abs(tick - target) > 2 * day,
                )
                .map((tick) => (
                  <span key={tick} style={{ left: at(tick) }}>
                    {tick === start ||
                    new Date(tick * 1000).getMonth() !==
                      new Date((tick - week) * 1000).getMonth()
                      ? shortDay(tick)
                      : new Date(tick * 1000).getDate()}
                  </span>
                ))}
              {target != null && (
                <span className="target" style={{ left: at(target) }}>
                  <Icon name="flag" size={11} />
                  {new Date(target * 1000).getDate()}
                </span>
              )}
            </span>
          </div>
          {shown.map((task) => (
            <div
              className={`recap-track-row ${focused && !focused.has(task.id) ? "dim" : ""}`}
              key={task.id}
            >
              <button
                type="button"
                className="recap-name"
                onClick={() => onOpen(task)}
              >
                {task.title}
              </button>
              <span
                className="recap-track"
                title={t("{0} to {1}", [
                  shortDay(task.createdAt),
                  shortDay(doneAt(task)),
                ])}
              >
                <span
                  className={`recap-span ${task.assignee}`}
                  style={
                    {
                      "--from": at(task.createdAt),
                      "--to": at(doneAt(task)),
                    } as CSSProperties
                  }
                />
                <span
                  className={`recap-end ${sets.late.has(task.id) ? "late" : ""} ${sets.none.has(task.id) ? "hollow" : ""}`}
                  style={{ left: at(doneAt(task)) }}
                />
                <span
                  className={`recap-took ${focused?.has(task.id) ? "hot" : ""}`}
                  style={{ left: at(doneAt(task)) }}
                >
                  {focus === "late" && sets.late.has(task.id)
                    ? `+${days(over(task))}`
                    : days(took(task))}
                </span>
              </span>
            </div>
          ))}
        </div>
        {tasks.length > doneShown && (
          <button type="button" className="done-more" onClick={onArchive}>
            {t("See all {0} in the Archive", [tasks.length])}
          </button>
        )}
      </section>

      {(points.length > 0 || noneAll) && (
        <section className="recap-panel">
          <div className="recap-panel-head">
            <h3 className="recap-label">{t("Points of attention")}</h3>
            <span className="recap-hint">
              {noneAll
                ? t("No task has a summary, commit or pull request")
                : t("The ones with the most points first")}
            </span>
          </div>
          <ul className="recap-points">
            {points.map(({ task, tags }) => (
              <li key={task.id}>
                <button
                  type="button"
                  className="recap-point"
                  onClick={() => onOpen(task)}
                >
                  <span className="recap-who">
                    <Glyph
                      who={task.assignee}
                      profileId={task.agentProfileId}
                    />
                  </span>
                  <span className="recap-point-title">{task.title}</span>
                  <span className="recap-tags">
                    {tags.map(([kind, text]) => (
                      <span key={kind} className={`recap-tag ${kind}`}>
                        {text}
                      </span>
                    ))}
                  </span>
                  <span className="recap-meta">{task.category}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
