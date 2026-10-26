import type { CSSProperties } from "react";
import type { Project } from "../lib/types";
import { Icon, type IconName } from "./Icon";
import { projectColor } from "./Sidebar";
import { locale, t } from "../lib/i18n";

/** Glyphs a project can wear instead of its initial, in the order the editor offers them. */
export const projectIcons: { name: IconName; label: string }[] = [
  { name: "code", label: t("Code") },
  { name: "terminal", label: "Terminal" },
  { name: "branch", label: t("Branch|icon") },
  { name: "package", label: t("Package") },
  { name: "globe", label: "Web" },
  { name: "mobile", label: t("Phone") },
  { name: "cloud", label: t("Cloud") },
  { name: "shield", label: t("Security") },
  { name: "book", label: t("Book") },
  { name: "chat", label: t("Chat") },
  { name: "chart", label: t("Chart") },
  { name: "flask", label: t("Experiment") },
  { name: "rocket", label: t("Rocket") },
  { name: "bolt", label: t("Lightning") },
  { name: "star", label: t("Star") },
  { name: "heart", label: t("Heart") },
  { name: "leaf", label: t("Leaf") },
  { name: "palette", label: t("Palette") },
  { name: "camera", label: t("Camera") },
  { name: "music", label: t("Music") },
  { name: "gamepad", label: t("Game") },
  { name: "home", label: t("Home") },
  { name: "briefcase", label: t("Work") },
  { name: "coffee", label: t("Coffee") },
];
const known = new Set<string>(projectIcons.map((icon) => icon.name));

/** The first letter of a name, as the project's mark when it has no icon. */
export const initialOf = (name: string) =>
  [...name.trim()][0]?.toLocaleUpperCase(locale) ?? "?";

/**
 * A project's mark: its icon, or its initial, on a tile tinted with its color. Replaces the bare
 * color dot wherever the project is named.
 */
export function ProjectMark({
  project,
  name = project?.name ?? "",
  icon = project?.icon ?? null,
  color = projectColor(project),
  size = "small",
}: {
  project?: Project;
  name?: string;
  icon?: string | null;
  color?: string;
  size?: "small" | "large";
}) {
  return (
    <span
      className={`project-mark ${size}`}
      style={{ "--hue": color } as CSSProperties}
      aria-hidden="true"
    >
      {icon && known.has(icon) ? (
        <Icon name={icon as IconName} size={size === "large" ? 14 : 12} />
      ) : (
        initialOf(name)
      )}
    </span>
  );
}
