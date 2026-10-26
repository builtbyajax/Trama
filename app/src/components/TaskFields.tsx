import {
  boardStatuses,
  statusTitle,
  type Category,
  type Goal,
  type TaskAssignee,
  type TaskInput,
  type TaskStatus,
} from "../lib/types";
import { AutoTextarea } from "./AutoTextarea";
import { CategoryCombobox } from "./CategoryCombobox";
import { Field } from "./Field";
import { Select, type SelectOption } from "./Select";
import { locale, t } from "../lib/i18n";

export const assigneeOptions: SelectOption<TaskAssignee>[] = [
  { value: "user", label: t("You") },
  { value: "agent", label: t("Agent") },
];

export const statusOptions = (statuses: TaskStatus[]) =>
  statuses.map((status) => ({
    value: status,
    label: statusTitle[status],
    dot: `var(--s-${status})`,
  }));

/** Choices for a task's goal: none, then the project's open goals and the task's own. */
export const goalOptions = (goals: Goal[], current: string | null) => [
  { value: "", label: t("No goal") },
  ...goals
    .filter((goal) => goal.completedAt === null || goal.id === current)
    .map((goal) => ({ value: goal.id, label: goal.name })),
];

/** The project's known categories, alphabetically. */
export const categoryNames = (categories: Category[], projectId: string) =>
  categories
    .filter((category) => category.projectId === projectId)
    .map((category) => category.name)
    .sort((a, b) => a.localeCompare(b, locale));

/** Editable task fields of the New task dialog; labels sit above their controls. */
export function TaskFields({
  input,
  onChange,
  categories,
  allStates = true,
  autoFocus = false,
  branches,
  goals = [],
}: {
  input: TaskInput;
  onChange: (value: TaskInput) => void;
  categories: string[];
  /** Local branches to choose from; undefined hides the field (no repository), null is loading. */
  branches?: string[] | null;
  allStates?: boolean;
  autoFocus?: boolean;
  /** The project's goals; the field shows only when it has some. */
  goals?: Goal[];
}) {
  const field = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) =>
    onChange({ ...input, [key]: value });
  const states = allStates
    ? (Object.keys(statusTitle) as TaskStatus[])
    : [...boardStatuses, "done" as const];
  return (
    <div className="task-fields">
      <Field label={t("What needs to be done?")} className="span-all">
        {({ id }) => (
          <AutoTextarea
            id={id}
            className="title-input"
            autoFocus={autoFocus}
            data-autofocus={autoFocus || undefined}
            required
            maxRows={4}
            submitOnEnter
            value={input.title}
            onChange={(e) => field("title", e.target.value.replace(/\n/g, " "))}
            placeholder={t("E.g. Check the import flow")}
          />
        )}
      </Field>
      <Field label={t("Category")} className="category-field">
        {({ id }) => (
          <CategoryCombobox
            id={id}
            required
            value={input.category}
            categories={categories}
            onChange={(value) => field("category", value)}
          />
        )}
      </Field>
      <Field label={t("Assignee")}>
        {({ id, labelId }) => (
          <Select
            id={id}
            labelledBy={labelId}
            value={input.assignee}
            options={assigneeOptions}
            onChange={(value) => field("assignee", value)}
          />
        )}
      </Field>
      <Field label={t("Status")}>
        {({ id, labelId }) => (
          <Select
            id={id}
            labelledBy={labelId}
            value={input.status}
            options={statusOptions(states)}
            onChange={(value) => field("status", value)}
          />
        )}
      </Field>
      {goals.length > 0 && (
        <Field label={t("Goal")} className="span-all">
          {({ id, labelId }) => (
            <Select
              id={id}
              labelledBy={labelId}
              value={input.goalId ?? ""}
              options={goalOptions(goals, input.goalId)}
              onChange={(value) => field("goalId", value || null)}
            />
          )}
        </Field>
      )}
      {branches !== undefined && (
        <Field
          label={t("Branch")}
          hint={t(
            "Optional. Only the repository's local branches; create the branch in Git and it shows up here.",
          )}
          className="span-all"
        >
          {({ id, labelId, describedBy }) => (
            <Select
              id={id}
              labelledBy={labelId}
              describedBy={describedBy}
              disabled={branches === null}
              value={input.repositoryBranch ?? ""}
              options={[
                {
                  value: "",
                  label:
                    branches === null ? t("Reading branches…") : t("No branch"),
                },
                ...(branches ?? []).map((name) => ({
                  value: name,
                  label: name,
                })),
              ]}
              onChange={(value) => field("repositoryBranch", value || null)}
            />
          )}
        </Field>
      )}
      <Field
        label={t("Briefing")}
        hint={t(
          "What the agent receives. Supports Markdown: - list, [] task, ## heading.",
        )}
        className="span-all"
      >
        {({ id, describedBy }) => (
          <textarea
            id={id}
            aria-describedby={describedBy}
            className="text-area"
            rows={5}
            value={input.details}
            onChange={(e) => field("details", e.target.value)}
            placeholder={t("The task's context, criteria and limits")}
          />
        )}
      </Field>
    </div>
  );
}
