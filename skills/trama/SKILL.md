---
name: trama
description: Work with Trama workspaces, projects, goals and tasks through the `trama` MCP. Use when the person asks you to manage or deliver Trama work, organize categories, or inspect a project's Git and PRs.
---

# Trama through MCP

Trama is the local board where the person and the agent hand work to each other. Every task is with someone: with you (the agent), in your queue, or waiting for the person's review. The app's Overview shows these handoffs. So the state you write is what the person sees.

## Connection

The server is the `trama-agent` binary that ships with the app. On a Mac it is at `/Applications/Trama.app/Contents/MacOS/trama-agent`. On Windows, it is `trama-agent.exe` next to the executable.

- `--workspace`: projects in the active workspace. Every project tool requires `project_id`. Without `--database`, the server checks the active workspace before each request and follows workspace changes made in the app.
- `--project-id UUID`: a single project. `project_id` isn't accepted in tool calls; project creation and deletion are available only in workspace mode. The IDs are in the app's Preferences.
- `--database PATH`: pins the MCP server to that database, including when combined with `--workspace`; it will not follow workspace changes.
- `TRAMA_DB`: when present in a process, pins that process to the named database and disables workspace switching there. Use database overrides only when intentionally working with an isolated or explicitly selected database; don't set them for routine personal-board work.

Each workspace is a separate database. `list_projects` shows the projects available in the database this connection currently uses. The MCP toolset manages projects, goals and tasks, but may not expose workspace creation or switching; when those tools aren't listed, manage workspaces in the Trama app instead of guessing a tool name. In workspace mode, project creation and deletion are available only when the person asks.

Claude Code:

```sh
claude mcp add trama -- /Applications/Trama.app/Contents/MacOS/trama-agent --workspace
```

Codex, in `.codex/config.toml`:

```toml
[mcp_servers.trama]
command = "/Applications/Trama.app/Contents/MacOS/trama-agent"
args = ["--workspace"]
```

If the `trama` tools don't show up, ask the person to set it up and reload the session. Don't edit global settings on your own.

## Statuses

| `status` | Column | Who has it |
|---|---|---|
| `preparing`, `reserved` | Drafts | Off the board |
| `todo` | To do | In the agent's queue if `assignee=agent`; otherwise with the person |
| `inProgress` | In progress | With the `assignee`. Agent + `inProgress` shows as "working now" |
| `review` | In review | Waiting for the person, whoever the `assignee` is |
| `done` | Done | Off the board |

`assignee` is `agent` or `user`. A task sent back for changes goes from `review` to `todo` and stays with the agent.

## Workflow

1. **Context.** In workspace mode, start with `list_projects` to find the project in the active workspace. Then call `get_context` to see the project, repository, categories and rules. If the expected project isn't listed, check whether the app is on the right workspace before proceeding.
2. **Find work.** Call `list_tasks` with `assignee: "agent"` and `status: "todo"`. If the person names a task, use `search_tasks`.
3. **Read before acting.** `get_task_details` returns the briefing (`details`, in Markdown), the messages and the history. If the task came back from review, the last message or event says what to change.
4. **Start.** Use `move_task` with `status: "inProgress"`. If the task was with the person and they asked you to take it, first use `update_task` with `assignee: "agent"`.
   - If the task has a `repository_branch`, work on that branch. Several tasks can share a branch.
   - If you'll work on a branch of its own for the task and it isn't recorded yet, record it as you start, with `update_task` and `repository_branch`, so the person sees it on the card.
5. **Progress.** Use `add_task_message` for decisions, blockers and questions. Keep it short: messages show up in the task's activity.
6. **Deliver.**
   - Use `update_task` with `agent_summary` (what changed and how to check it) and, when they exist and aren't recorded yet, `repository_branch`, `commit_hash` (the full hash) and `pull_request_url`/`pull_request_number`.
   - If you wrote a plan, report or other Markdown document for the person to read, save the `.md` in the notes folder and attach it with `attach_document`. See the **Notes** rule.
   - Then use `move_task` with `status: "review"`.
7. **Stop there.** Only move to `done`, delete anything or change `assignee` to `user` when the person asks.

To record new work the person asked for, use `create_task`. The defaults are `assignee=agent`, `status=todo` and the category "Feature" (or "Funcionalidade" in older projects). For an idea that isn't ready yet, create it in `preparing` and promote it later with `promote_draft`.

## Workspaces and goals

- A workspace contains its own projects and data. In workspace mode, first find the project with `list_projects`, then pass its `project_id` to project operations. A project-bound connection sees only its configured project.
- Goals group tasks in one project around an outcome. Use `list_goals` before assigning a task to a goal; set `goal_id` through `create_task` or `update_task`. The goal must belong to the same project, and a task can belong to at most one goal. Send `goal_id: null` to remove the association.
- Use `create_goal` for a new goal and `update_goal` for its name, description or target date. Dates use `YYYY-MM-DD`; `null` clears the target date.
- Goal progress counts its tasks on the board, including done tasks, and excludes drafts. Completing every task does not conclude the goal automatically. Concluding or reopening a goal is the person's decision; the current MCP toolset can list, create and edit goals but does not conclude or reopen them. If asked to do that, use the app if available or explain the tool limitation.
- A goal is an organizational grouping, not authorization to implement all its tasks. Follow the person’s request and the task workflow above.

## Categories

New projects start with these categories. The list is saved per project, and projects created before the defaults were in English have them in Portuguese, so check `get_context` and use exactly one of the categories available in that project. When creating a task, choose by its main deliverable; don't classify it by an intermediate step.

| Category | Use when the main deliverable is... |
|---|---|
| **Feature** | Adding a new capability or behavior to the product. |
| **Fix** | Repairing existing behavior that is wrong, broken or regressed. |
| **Tests** | Creating or changing tests, test cases or the test setup. |
| **Validation** | Checking a finished change through QA, acceptance criteria or manual checks, and recording the result. |
| **Investigation** | Understanding a cause, assessing feasibility or comparing options, delivering conclusions or a recommendation. |
| **Documentation** | Creating or updating documentation for users or for development. |
| **Infrastructure** | Changing the build, releases, CI, dependencies, repository settings, development environment or operations. |
| **Migration** | Porting something existing to another technology, framework, version or structure, keeping the behavior it already has. |
| **Refactoring** | Reorganizing or simplifying code without changing behavior, such as splitting files, renaming or removing duplication. |
| **Interface** | Improving the look or usability of something that already works: layout, spacing, colors, on-screen text, focus and accessibility. |
| **Security** | Protecting against unauthorized access or leaks: authentication, permissions, input validation, secrets and vulnerabilities. |
| **Performance** | Making something faster or lighter, such as load time, queries, memory or build size. |

Rules of thumb:

- Classify by the expected outcome: investigating before fixing is still **Fix** if the deliverable is resolving the defect; investigating to find the cause and recommend a path is **Investigation**.
- **Tests** is for creating or maintaining tests. Running them to check a feature or fix is part of that task; it doesn't change its category.
- **Validation** is for QA or acceptance of a finished implementation. If the task is writing the tests that will do that check, use **Tests**.
- **Migration** is for moving what exists to another base without changing what it does, such as switching frameworks or a library's major version. New behavior requested during the migration is **Feature**; a defect found in it is **Fix**. Only adjusting the build setup or updating a dependency without porting code is **Infrastructure**.
- **Refactoring** changes the shape of the code, not what it does; if behavior changes, the category is that of the change. Switching frameworks or versions is **Migration**.
- **Interface** is for something that already works and needs to be easier to see or use. A screen that shows the wrong data or breaks is **Fix**; a new screen is **Feature**.
- **Security** and **Performance** apply when protecting or speeding up is the main deliverable, even if the problem showed up as a defect. Measuring to find where the slowness or risk is, without fixing it, is **Investigation**.
- If the person names a category, follow it. If no available category fits, don't invent one: pick the closest when it's clear; otherwise ask before creating the task.

## Rules

- **Briefing.** `details` is the person's briefing. Don't rewrite their text. To check a checklist item, change only `- [ ]` to `- [x]` and send the whole `details` back.
- **Partial edits.** `update_task` is a patch: send only the fields that change. `null` clears `agent_summary`, branch, commit and PR; title, briefing, category, assignee and status don't accept `null`.
- **Order.** A column's order is the person's priority: the topmost card comes first. `list_tasks` returns tasks in that order. Follow it when choosing what to do; don't reorder unless the person asks. `move_task` takes `after_id`, the card before it in the target column; `null` puts the task at the top.
- **Private annotations.** Personal annotations don't exist for you: no tool reads or searches them. Instructions come through the briefing or the conversation.
- **Branch.** It's optional and must be a local branch that already exists in the project's repository: Trama doesn't create branches and refuses a name that doesn't exist. Create the branch with Git before recording it. `git_snapshot` lists the local branches.
- **Notes.** The project in `get_context` has `notes_folder`, the project's notes folder (a vault of `.md` files), or `null`. Save the document as `.md` inside it and call `attach_document` with the path, absolute or relative to `notes_folder`. Trama keeps only the path; the person reads and edits the note in the app. It only attaches `.md` files that already exist inside the folder; hidden folders are left out. Without `notes_folder`, don't attach: say where you saved the file. `detach_document` removes the attachment without deleting the file.
- **Delivering only records.** Recording a commit or PR doesn't create anything. Commits, pushes and PRs are made with other tools, when the person authorizes them. To check what exists, use `git_snapshot`, `git_commit_details`, `git_working_diff` and `list_pull_requests`. They all only read.
- **Pagination.** `list_tasks`, `search_tasks`, `read_task_messages` and `read_task_events` take `limit` (up to 200) and `offset`. Keep going until `next_offset` is `null`.
- **Errors.** If the result comes with `isError: true`, the text says what to fix, such as an invalid UUID, an incomplete hash or a category that doesn't exist. Fix it and try again. A task from another project shows up as nonexistent.
- **Categories.** `delete_category` on a category in use requires `replacement`. Renaming updates every task.
- **Structured checklist.** `add_task_check` and the similar tools write a list the interface doesn't show. For something the person needs to see, use the briefing's checklist or a message.
