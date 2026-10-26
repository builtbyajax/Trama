<p align="center">
  <strong>English</strong> &nbsp;·&nbsp; <a href="CHANGELOG.pt-BR.md">Português brasileiro</a>
</p>

# Changelog

Changes delivered in each Trama version. **Unreleased** lists implemented changes that have not shipped yet; when publishing a version, replace that heading with the release number and date.

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
