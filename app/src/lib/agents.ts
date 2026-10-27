import { createContext, useContext, type CSSProperties } from "react";
import { t } from "./i18n";
import {
  isAgentWorking,
  type AgentProfile,
  type Presence,
  type Task,
} from "./types";

/**
 * The agent palette, by the index a profile keeps. None of them is your blue or the purple of
 * "any agent", which stays the agent's own color.
 */
export const agentColors = [
  { value: "#5fd0c8", name: t("Teal") },
  { value: "#8fd18a", name: t("Green") },
  { value: "#e7c46a", name: t("Amber") },
  { value: "#f0a070", name: t("Orange") },
  { value: "#ee8fbf", name: t("Pink") },
  { value: "#a7b4c8", name: t("Slate") },
];
export const agentColor = (profile: AgentProfile | undefined) =>
  profile ? (agentColors[profile.color] ?? agentColors[0]).value : undefined;

/** Every profile of the open workspace, by id. */
export const AgentProfilesContext = createContext<Map<string, AgentProfile>>(
  new Map(),
);
export const useAgentProfiles = () => useContext(AgentProfilesContext);
export function useAgentProfile(id: string | null | undefined) {
  const profiles = useAgentProfiles();
  return id ? profiles.get(id) : undefined;
}
/** The agent that has a task: its profile, or none for any agent. */
export const taskProfile = (task: Task, profiles: Map<string, AgentProfile>) =>
  task.assignee === "agent" && task.agentProfileId
    ? profiles.get(task.agentProfileId)
    : undefined;

/** A name cut short where it shows in a line, so a long one never wraps: 24 characters at most. */
export const shortName = (name: string) =>
  name.length > 24 ? `${name.slice(0, 23).trimEnd()}…` : name;
/** A profile's name, or "Agent" for any agent and for records older than profiles. */
export const agentName = (profile: AgentProfile | undefined) =>
  profile ? shortName(profile.displayName) : t("Agent");

export const presenceTitle: Record<Presence, string> = {
  active: t("Active"),
  idle: t("Stopped"),
  offline: t("Offline"),
};

/**
 * An agent task in progress: "live" while its session keeps calling tools (or when no session
 * holds it), "stopped" once its session has gone quiet. A profile whose session ended isn't on
 * the task anymore, so it has no state.
 */
export function workState(task: Task, profiles: Map<string, AgentProfile>) {
  if (!isAgentWorking(task)) return null;
  const profile = taskProfile(task, profiles);
  if (!profile || profile.presence === "active") return "live";
  return profile.presence === "idle" ? "stopped" : null;
}
export const useWorkState = (task: Task) => workState(task, useAgentProfiles());

/** Tints a card or row in its profile's color; without a profile it keeps the agent's purple. */
export function agentTint(profile: AgentProfile | undefined) {
  const color = agentColor(profile);
  if (!color) return undefined;
  return {
    "--agent": color,
    "--agent-soft": `color-mix(in srgb, ${color} 9%, transparent)`,
    "--agent-line": `color-mix(in srgb, ${color} 32%, transparent)`,
  } as CSSProperties;
}
