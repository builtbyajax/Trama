<p align="center">
  <strong>English</strong> &nbsp;·&nbsp; <a href="CHANGELOG.pt-BR.md">Português brasileiro</a>
</p>

# Changelog

Changes delivered in each Trama version. **Unreleased** lists implemented changes that have not shipped yet; when publishing a version, replace that heading with the release number and date.

## [0.4.0](https://github.com/builtbyajax/Trama/releases/tag/v0.4.0) — 2026-10-27

### Added

- Agent profiles: each MCP session gets a character of its own, with a name, a color, a shape and eyes, shown on the tasks it holds, in the activity and in the filters. Agents set it up with the new `set_profile` tool, and a session without one shows the MCP client's name.
- Agents page to see every profile and whether it is active, stopped or disconnected, and to rename it, change its look, see its tasks or delete it. Once you edit a profile, the agent can no longer change it. Deleting one leaves its tasks to any agent and keeps it in the history.
- While an agent works on a task, its character walks along the card's top edge. When the agent stops, it dozes there. Hovering over a character enlarges it.
- Assign a task to a specific agent or to any agent, and filter the board by agent.
- Resume a session as the same profile with `set_profile` and its `profile_id`. When a session ends, the tasks it had in progress go back to To do, still with its profile.
- Keep the Mac awake while an agent called a tool in the last 15 minutes, always or only on power, from Preferences.

### Changed

- Upgrade the database to schema 13 while preserving existing data. Agent tasks become tasks for any agent. After migration, Trama 0.3 cannot open that database.
- `list_tasks` filters by `agent_profile_id`, `get_context` reports the session's `profile_id`, and tasks, messages and events report the profile that wrote them.
- The Trama skill tells agents to introduce themselves at the start of a session and to leave other profiles' tasks alone.

## [0.3.1](https://github.com/builtbyajax/Trama/releases/tag/v0.3.1) — 2026-10-26

### Changed

- Keep each workspace in a folder of its own, `Workspaces/<id>/` inside the Trama folder, so renaming one moves no files. On first start, move the workspaces earlier versions left loose in the Trama folder and ask to restart agent sessions once. Reopening a workspace file asks for its name, since every file is `workspace.sqlite`. See [local data](docs/installation.md#local-data).
- Create workspaces without choosing a folder; **Open workspace…** still opens a database anywhere.
- Ask for the first workspace on a new installation instead of creating one, and have the MCP server ask to open Trama and create one until then.

### Fixed

- Save a recoverable copy in a `Backups` folder beside each workspace database before upgrading its schema, including committed WAL data, named with the Trama version and the schema; keep the latest three copies and stop the migration if the backup cannot be saved. Deleting a workspace deletes its copies too. See [how to restore a backup](docs/installation.md#restore-a-database-backup).

## [0.3.0](https://github.com/builtbyajax/Trama/releases/tag/v0.3.0) — 2026-10-25

### Added

- Archive page for concluded tasks, with search, project filtering and grouping; archived tasks can be reopened in any board stage.
- Conclude a task by dragging it to the bar that appears at the bottom of the board while dragging, or from its menu.
- Project page with the agent's work, reviews, goals and recent deliveries.
- List view of the board alongside Kanban, with keyboard dragging; switch views in Preferences or with ⇧⌘L.
- Show each task's goal on its card.
- Show the time left on notices with an Undo action, pausing while the pointer or focus is on the notice.

### Changed

- Merge Drafts and Reserved into a single Backlog column. Upgrade the database to schema 12 while preserving existing data; after migration, Trama 0.2 cannot open that database.
- MCP tools refuse the retired `preparing` and `reserved` statuses with guidance to use `backlog`, and `promote_draft` was removed.
- Split Preferences into General, Board, Projects, Agent and MCP, and Updates, keeping the section list visible while it is open. The MCP section shows the command with the bundled agent path and the project IDs.
- Show notices at the top of the window, with entry and exit animations.
- Use one segmented control, navigable with the arrow keys, for project tabs, board filters, Archive grouping, activity, diffs and notes.
- Guide agents in the Trama skill to write focused briefings, delivery summaries and messages, and to name and use goals.

## [0.2.2](https://github.com/builtbyajax/Trama/releases/tag/v0.2.2) — 2026-10-25

### Added

- Check for signed updates automatically or manually in Preferences; manual checks remain available after finding an update.
- Install an available update and restart the app from the update notice or Preferences, with a persistent Preferences indicator after dismissing the notice.
- Keep a found update installable after dismissing the notice, allow retry after a failed download, and prevent overlapping update operations.
- Relaunch macOS updates through the existing Dock item and block Windows installation while `trama-agent.exe` is in use.
- After a version change, recommend restarting agent sessions to reconnect to the MCP included with the installed version, including after a downgrade.

### Changed

- Sort files and folders together by name in the notes explorer, including natural numeric order.

### Fixed

- Refuse MCP tool calls from an agent connected to a database migrated by a newer app.

## [0.2.1](https://github.com/builtbyajax/Trama/releases/tag/v0.2.1) — 2026-10-24

### Fixed

- Use separate data for development sessions by default, avoiding unintended migrations of personal databases.
- Reject requests from untrusted hosts and origins on the local development bridge.
- Refuse databases from a newer version without changing the main file or pending WAL data.
- Handle concurrent workspace opening during a migration without lock failures when enabling WAL.
- Protect notes from symbolic links pointing to hidden folders.
- Keep the discard and reload action available when leaving a note editor with a conflict.
- Prevent note links with invalid escapes from interrupting rendering.
- Report the actual schema version through MCP and reject null values in required task update fields.

## [0.2.0](https://github.com/builtbyajax/Trama/releases/tag/v0.2.0) — 2026-10-24

### Added

- Local workspaces, each with its own database.
- Workspace creation, editing, switching, removal and deletion.
- Project transfer between workspaces, preserving tasks and related data.
- Project goals with associated tasks and progress tracking.
- Goal creation, listing and editing through MCP.

### Changed

- Upgrade the database to schema 10 while preserving existing data. After migration, Trama 0.1.0 cannot open that database.

## [0.1.0](https://github.com/builtbyajax/Trama/releases/tag/v0.1.0) — 2026-10-23

### Added

- Desktop app for macOS and Windows with local SQLite storage.
- Task board with assignees, categories, drafts, shortcuts and archiving.
- Git history, branches, file differences and pull request browsing.
- Markdown note editing with search, preview and task attachments.
- Local MCP server and skill to connect coding agents to the board.
- Personal task notes kept private from agents.
- Interface in English and Brazilian Portuguese.
