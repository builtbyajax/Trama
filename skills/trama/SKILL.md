---
name: trama
description: Work with Trama workspaces, projects, goals and tasks through the `trama` MCP. Use when the person asks you to manage or deliver Trama work, organize categories, or inspect a project's Git and PRs.
---

# Trama through MCP

Trama is the local board where the person and the agent hand work to each other. Every task is with someone: with you (the agent), in your queue, or waiting for the person's review. The app's Overview shows these handoffs. So the state you write is what the person sees, and what you write in a task is what they read.

## Connection

The server is the `trama-agent` binary that ships with the app. On a Mac it is at `/Applications/Trama.app/Contents/MacOS/trama-agent`. On Windows, it is `trama-agent.exe` next to the executable.

- `--workspace`: projects in the active workspace. Every project tool requires `project_id`. Without `--database`, the server checks the active workspace before each request and follows workspace changes made in the app.
- `--project-id UUID`: a single project. `project_id` isn't accepted in tool calls; project creation and deletion are available only in workspace mode. The IDs are in the app's Preferences.
- `--database PATH`: pins the MCP server to that database, including when combined with `--workspace`; it will not follow workspace changes.
- `TRAMA_DB`: when present in a process, pins that process to the named database and disables workspace switching there. Use database overrides only when intentionally working with an isolated or explicitly selected database; don't set them for routine personal-board work.

Each workspace is a separate database. `list_projects` shows the projects available in the database this connection currently uses. The MCP toolset manages projects, goals and tasks, but may not expose workspace creation or switching; when those tools aren't listed, manage workspaces in the Trama app instead of guessing a tool name. In workspace mode, create or delete projects only when the person asks.

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

The board's columns, left to right, then the Archive:

| `status` | Column | Who has it |
|---|---|---|
| `backlog` | Backlog (Pendências in Portuguese) | Nobody yet: ideas and work not prioritized. Not your queue, even with `assignee=agent` |
| `todo` | To do | In the agent's queue if `assignee=agent`; otherwise with the person |
| `inProgress` | Working | With the `assignee`. Agent + `inProgress` shows as "working now" |
| `review` | In review | Waiting for the person, whoever the `assignee` is |
| `done` | Archive | Concluded: off the board, in the Archive. Moving it to another status puts it back on the board |

`assignee` is `agent` or `user`. A task sent back for changes goes from `review` to `todo` and stays with the agent.

`preparing` and `reserved` (the old Drafts and Reserved) no longer exist: older databases moved them to `backlog`, and tools refuse them with a message that says so. `promote_draft` was removed; an idea reaches the queue when it moves from `backlog` to `todo`.

## Your profile

Each connection is its own agent profile. The person sees it on the tasks it holds, in the activity and in the sidebar: its name, its character (a shape in its color, with eyes) and whether it's working, stopped or not connected.

- **Introduce yourself at the start.** Call `set_profile` before any other work. The name says the role you play in this session, such as "Reviewer" or "Site"; keep it short, as the app cuts long names. If the role isn't clear from the request, ask the person.
- **Choose your look.** Pick `color` (0 to 5), `shape` and `eyes` as fits the work; the choice is yours. If you already have a look of your own, choose the same or the closest one.
- **Keep the `profile_id`.** It comes in `get_context` and in `set_profile`'s reply. When a session is resumed in a new process, call `set_profile` with it to go on as the same profile and get your tasks back. It's refused while another connected session uses it. Don't save it to files or memory: it belongs to this conversation.
- **What becomes yours.** A task with `assignee=agent` and no `agent_profile_id` is for any agent: moving it to `inProgress` makes it yours. A task with another profile's `agent_profile_id` belongs to that agent, even when it's stopped: leave it unless the person asks. To list yours, use `list_tasks` with your `agent_profile_id`.
- **When the session ends**, the tasks you had in progress go back to To do, still yours.
- **The person's edit wins.** If the person changed your profile in Trama, `set_profile` is refused. Don't insist: tell them if you'd like it changed.
- **A deleted profile.** If the person deletes your profile, its tasks are released and your next call gets a new one, named after the client. When `get_context` shows a `profile_id` different from yours, call `set_profile` again with your name and look.

## Workflow

1. **Context.** In workspace mode, start with `list_projects`. Then call `get_context` to see the project, repository, categories and rules. If the expected project isn't listed, check whether the app is on the right workspace before going on.
2. **Find work.** Call `list_tasks` with `assignee: "agent"` and `status: "todo"`. A task with another profile's `agent_profile_id` was given to that agent; leave it unless the person asks. If the person names a task, use `search_tasks`; it also finds tasks in the Archive, so check `status`.
3. **Read before acting.** `get_task_details` returns the briefing (`details`, in Markdown), the messages and the history. If the task came back from review, read the last message or event first: it says what to change.
4. **Start.** Use `move_task` with `status: "inProgress"` when you actually begin. If the task was with the person and they asked you to take it, first use `update_task` with `assignee: "agent"`.
   - If the task has a `repository_branch`, work on that branch. Several tasks can share a branch.
   - If you'll work on a branch of its own for the task and it isn't recorded yet, record it as you start, so the person sees it on the card.
5. **Progress.** Post a message only when it changes something for the person. See **Messages**.
6. **Deliver.**
   - Write `agent_summary` as described in **Delivery summary**, and record `repository_branch`, `commit_hash` (the full hash) and `pull_request_url`/`pull_request_number` when they exist and aren't recorded yet.
   - If you wrote a plan, report or other Markdown document for the person to read, save it in the notes folder and attach it. See **Notes**.
   - Then use `move_task` with `status: "review"`.
7. **Stop there.** Move a task to `done` (which concludes it and sends it to the Archive), move tasks out of `backlog`, change `assignee` to `user`, reorder or delete only when the person asks. When they do ask, do it.

## Writing for the person

Each field answers one question. If a piece of information doesn't answer that field's question, it doesn't go in it.

| Field | Question it answers | When |
|---|---|---|
| Title | What is this task? | On creation |
| Briefing (`details`) | What needs to be done? | Before the work |
| Message | What do you need to know now? | During the work |
| Delivery summary (`agent_summary`) | What changed, and how do I check it? | On delivery |

Write in the language the person uses with you and the project uses in its tasks. Use the words of someone using the product, not the code's: no file, function or hook names unless the task is about code itself. Keep sentences short and Markdown plain: short paragraphs, bold section labels and lists. No headings.

### Title

An infinitive or imperative verb plus the outcome, as the person would see it, in at most about 70 characters: "Show notices at the top, with the time left to undo", not "Refactor useToast" or "Notices". Don't repeat the category or the goal name in it.

### Briefing

The briefing says what to do and when it's done, for whoever does the work. Use this shape and leave out a section with nothing to say:

```markdown
Notices appear at the bottom and cover the conclude bar.

**What to do**
- Show notices at the top, centered
- When a notice has Undo, show a line that fills until it closes

**Done when**
- [ ] No notice covers the conclude bar
- [ ] The time pauses while the pointer is over the notice

**Out of scope**
- A queue of several notices
```

- **First line:** the problem or the goal in one sentence, without a label. Not a restatement of the title.
- **What to do:** the expected result, not the implementation.
- **Done when:** checks that can be confirmed in the product. They are the checklist the person and you tick.
- **Out of scope:** only when the work could otherwise grow.

The briefing belongs to the person once it exists. Write it when you create the task; afterwards don't rewrite their text. To tick a checklist item, change only `- [ ]` to `- [x]` and send the whole `details` back. To add a small adjustment the person asked for within the same delivery, append an item to **Done when** instead of creating a task.

### Messages

Post a message for a decision you made that the person may want to change, a blocker, or a question; one or two sentences each. Don't post progress ("started", "done", "running tests") or step-by-step notes: the history already shows status changes, and the summary covers the delivery.

### Delivery summary

The summary tells the person what to review. Use this shape:

```markdown
Notices now appear at the top, sliding in and out. When one has Undo, a line shows the time left.

**How to check**
1. Conclude a task by dropping it on the bar
2. Hover the notice: the line stops

**Attention**
- Windows not tested
- Not committed
```

- **First line:** what changed for someone using the product, in one or two sentences.
- **How to check:** numbered steps, at most five.
- **Attention:** what is still wrong, incomplete, unchecked or decided without the person: failing or skipped tests, bugs found and not fixed, workarounds instead of a proper fix, what you couldn't test (a platform, real data), choices they may want to change, and whether the work is committed. Leave the section out when there is nothing, so an empty Attention means the delivery can be trusted as it is.
- **Leave out:** file lists, implementation details, errors you already fixed and the attempts that didn't work. The diff and the messages hold those.

When a task comes back from review and you deliver again, rewrite the summary for the current state instead of appending to it.

## Creating tasks

- **Only what was asked.** Create a task when the person asks for the work or asks you to record it. An idea they only mention, or something you notice, goes in `backlog` if they want it recorded; never start implementing it on your own.
- **No duplicates.** Search with `search_tasks` first; if a task already covers it, update that one or tell the person.
- **One deliverable per task.** A separate outcome is a separate task; a small adjustment to work under way is a **Done when** item in its task.
- **Defaults.** `create_task` defaults to `assignee=agent`, `status=todo` and the category "Feature" (or "Funcionalidade" in older projects). Pick the category by the main deliverable; read [categories.md](categories.md) when it isn't obvious.
- **Goal.** If the task belongs to a goal, set `goal_id` on creation.

## Goals

Goals group a project's tasks around one outcome, such as a version or a front of work.

- **When to create.** For an outcome that takes several tasks, when the person asks or agrees. Not for a single task. Check `list_goals` first: reuse a goal that already covers the outcome.
- **Name.** The outcome, short, in the person's language: "v0.3: Archive and backlog" or "Automatic updates", not "Improvements" or "Sprint 2". Put what's included in the description, and the target date (`YYYY-MM-DD`) when there is one.
- **Tasks.** `goal_id` is set with `create_task` or `update_task`; the goal must be in the same project, a task has at most one goal, and `null` removes it.
- **Progress** counts every task in the goal, backlog and Archive included: done tasks over the total. Finishing every task doesn't conclude the goal, and the MCP can't conclude or reopen goals: that's done in the app. When all of a goal's tasks are in review or done, you can tell the person.
- **Not an authorization.** A goal doesn't mean you should implement all its tasks. Follow the person's request and the workflow.

## Rules

- **Partial edits.** `update_task` is a patch: send only the fields that change. `null` clears `agent_summary`, branch, commit and PR; title, briefing, category, assignee and status don't accept `null`.
- **Order.** A column's order is the person's priority: the topmost card comes first. `list_tasks` returns tasks in that order. Follow it when choosing what to do. `move_task` takes `after_id`, the card before it in the target column; `null` puts the task at the top.
- **Private annotations.** Personal annotations don't exist for you: no tool reads or searches them. Instructions come through the briefing or the conversation.
- **Branch.** It's optional and must be a local branch that already exists in the project's repository: Trama doesn't create branches and refuses a name that doesn't exist. Create the branch with Git before recording it; `git_snapshot` lists the local branches. If a recorded branch is renamed or deleted, update the tasks that point to it.
- **Commits.** `commit_hash` takes the full hash. Recording a commit or PR doesn't create anything: commits, pushes and PRs are made with other tools, when the person authorizes them. If history is rewritten, update the hashes of the tasks that point to the old commits. `git_snapshot`, `git_commit_details`, `git_working_diff` and `list_pull_requests` only read.
- **Notes.** The project in `get_context` has `notes_folder`, the project's notes folder (a vault of `.md` files), or `null`. Save the document as `.md` inside it and call `attach_document` with the path, absolute or relative to `notes_folder`. Trama keeps only the path; the person reads and edits the note in the app. It only attaches `.md` files that already exist inside the folder; hidden folders are left out. Without `notes_folder`, don't attach: say where you saved the file. `detach_document` removes the attachment without deleting the file.
- **Pagination.** `list_tasks`, `search_tasks`, `read_task_messages` and `read_task_events` take `limit` (up to 200) and `offset`. Keep going until `next_offset` is `null`.
- **Errors.** If the result comes with `isError: true`, the text says what to fix, such as an invalid UUID, an incomplete hash or a category that doesn't exist. Fix it and try again. A task from another project shows up as nonexistent.
- **Categories.** `delete_category` on a category in use requires `replacement`. Renaming updates every task.
- **Structured checklist.** `add_task_check` and the similar tools write a list the interface doesn't show. For something the person needs to see, use the briefing's checklist or a message.
