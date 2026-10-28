<p align="center">
  <strong>English</strong> &nbsp;·&nbsp; <a href="README.pt-BR.md">Português brasileiro</a>
</p>

<p align="center">
  <img src="docs/images/cover-agents.svg" alt="Trama — a task board for you and your coding agents, with three agent characters" width="100%">
</p>

<p align="center">
  <strong>Keep tasks, code history, and project context together — whether you work solo or with coding agents.</strong>
</p>

<p align="center">
  <a href="https://trama.ajaxdev.com.br">Website</a> &nbsp;·&nbsp;
  <a href="#get-started">Get started</a> &nbsp;·&nbsp;
  <a href="docs/installation.md">Installation &amp; MCP setup</a> &nbsp;·&nbsp;
  <a href="docs/development.md">Development guide</a> &nbsp;·&nbsp;
  <a href="CHANGELOG.md">Changelog</a>
</p>

![Trama's task board with work assigned to a person or an agent across four columns](docs/images/en/board.png)

## Get started

Trama is in early development. Download a test installer from [GitHub Releases](https://github.com/builtbyajax/Trama/releases) for macOS (Apple Silicon or Intel) or Windows x64, then follow the [installation guide](docs/installation.md) before opening the app.

The interface is available in English and Brazilian Portuguese. Choose your language in **Preferences → General → Language**. The screenshots show the real interface with demonstration data.

## Keep work moving with its context

1. Create a task with the briefing and checks needed to do the work.
2. Move it through **Backlog → To do → Working → In review**. Assign it to yourself or an agent.
3. Review the summary, activity, notes, and Git changes before deciding what happens next.

Use Trama on your own for a project board and work history. Connect a coding agent when you want it to read task context and update the same board.

- Organize work with categories, local branches, and goals with versions and target dates.
- Keep personal task notes private from MCP clients.
- Archive completed tasks and find work across projects in the overview.

## Goals

Group tasks under a goal to follow progress across the project. Add a target date and version, then conclude the goal when its work is complete.

## Connect your coding agent

The desktop app includes **`trama-agent`**, a local MCP server over STDIO. Connect it to Codex, Claude Code, OpenCode, or another client that supports local MCP servers.

The agent can read task briefings, update tasks, attach project notes, and record delivery references. Each connected session has a profile with a name, character, and presence status. Trama does not launch or host coding agents.

1. [Connect your MCP client](docs/installation.md#connect-your-agent).
2. Add the included [Trama skill](skills/trama/SKILL.md) for the queue, delivery, and review workflow.

The optional [Trama planning skill](skills/trama-planning/SKILL.md) helps agents split a goal into tasks and coordinate on a shared board.

## Follow changes into Git

Browse local changes, branches, commits, and linked tasks in one history. Open changed files in side-by-side or inline diffs, inspect commit details, and see pull requests through the GitHub CLI.

Trama's Git view is read-only. You and your coding tools keep control of commits, branches, and merges.

![Trama's Git history with a task's commits, delivery status, and changed files](docs/images/en/git.png)

## Keep project notes in Markdown

Connect a folder of Markdown files to a project. Browse and search the notes, open them in tabs, and edit with formatting tools and a live preview. Attach relevant notes to tasks so an agent can read the same context.

Your notes stay ordinary `.md` files in the folder you choose. Trama checks for external changes before saving.

![Trama's notes workspace with a file tree, linked tasks, and a rendered Markdown project brief](docs/images/en/notes.png)

## Your data stays on your computer

| Data | Where it lives |
| --- | --- |
| Projects, tasks, and activity | A local SQLite database |
| Project notes | The Markdown folder you choose |
| Code and Git history | Your existing local repositories |

Trama has no account or cloud sync. Connecting an agent through MCP lets it read the project context exposed by Trama. The agent's client and provider have their own data policies.

See the [installation guide](docs/installation.md#local-data) for database locations.

## Support and feedback

Found a bug or have an idea for Trama? [Report a bug](https://github.com/builtbyajax/Trama/issues/new?template=bug_report.yml) or [suggest a feature](https://github.com/builtbyajax/Trama/issues/new?template=feature_request.yml). You can write in English or Portuguese.

## Development

Trama is built with **Tauri 2, React, TypeScript, Rust, and SQLite**. See the [development guide](docs/development.md) for setup, local development data, build instructions, and checks. See [Testing and CI](docs/testing.md) for test coverage and workflows.

## License

This project is made available under the PolyForm Noncommercial License 1.0.0.

You may use, study, modify, and redistribute this software for purposes permitted by the license, including personal, educational, and noncommercial uses.

Commercial use is not permitted without an additional license, except for uses expressly permitted by the PolyForm terms. For commercial licensing, contact the project maintainer.

See [LICENSE](LICENSE) for the complete terms. If this summary differs from the license, the license text controls.
