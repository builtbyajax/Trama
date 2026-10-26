# Installation and agent setup

**English** · [Português brasileiro](installation.pt-BR.md)

Trama is a desktop workspace with a bundled local MCP server. When installers are available, using the app will not require Node.js, Rust, or a development environment.

**Desktop installers have not been published yet.** For now, follow the [source setup](../README.md#development). The installer steps below describe the planned GitHub Releases distribution.

## Install the desktop app

### macOS

Trama requires macOS 14 or later.

Once a release is available:

1. Download the `.dmg` that matches your Mac's processor from the repository's GitHub Releases page.
2. Open it and drag **Trama.app** into **Applications**.
3. Open Trama from Applications.

The test builds aren't notarized by Apple yet, so the first time you open Trama, macOS says it couldn't verify the app. To open it anyway:

1. Click **Done** in the warning. Don't move the app to the Trash.
2. Open **System Settings** › **Privacy & Security** and scroll to **Security**.
3. Next to the message about Trama, click **Open Anyway** and confirm with your password or Touch ID.

You only need to do this once. On macOS 14 you can also Control-click Trama in Applications and choose **Open**.

### Windows

Once a release is available:

1. Download the Windows x64 `.exe` installer from the repository's GitHub Releases page.
2. Run the installer and follow its instructions.
3. Open Trama from the Start menu.

The installer isn't signed yet, so Windows SmartScreen may show **Windows protected your PC**. Click **More info**, then **Run anyway**.

The app uses Microsoft WebView2. If the runtime is missing, installation may need an internet connection to download it. See the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows).

## Connect your agent

Trama includes `trama-agent`, a server that an MCP client starts over STDIO. Configure it once in each coding client you want to use. The graphical app can be closed while the server is in use.

| Platform | Installed server path |
| --- | --- |
| macOS | `/Applications/Trama.app/Contents/MacOS/trama-agent` |
| Windows | `trama-agent.exe`, next to the application executable in your chosen installation folder |

If you are running from source, first follow the [source setup](../README.md#development). Starting the development app also builds the MCP server. Use the absolute path to `app/src-tauri/target/debug/trama-agent` in the examples below, or `trama-agent.exe` on Windows. A custom `CARGO_TARGET_DIR` changes that output location.

### Codex

Add the server to `~/.codex/config.toml` for your user, or to `.codex/config.toml` in a trusted project.

macOS:

```toml
[mcp_servers.trama]
command = "/Applications/Trama.app/Contents/MacOS/trama-agent"
args = ["--workspace"]
```

Windows, replacing the example path with your installation folder:

```toml
[mcp_servers.trama]
command = 'C:\path\to\Trama\trama-agent.exe'
args = ["--workspace"]
```

See the [official Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) for configuration options.

### Claude Code

Run the command for your platform. `--scope user` makes the server available across your projects.

macOS:

```sh
claude mcp add --scope user --transport stdio trama -- /Applications/Trama.app/Contents/MacOS/trama-agent --workspace
```

Windows, in PowerShell, replacing the example path:

```powershell
claude mcp add --scope user --transport stdio trama -- "C:\path\to\Trama\trama-agent.exe" --workspace
```

See the [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp).

### OpenCode V2

Add a server under `mcp.servers` in your OpenCode configuration. Merge the entry into your existing configuration rather than replacing the file.

macOS:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "trama": {
        "type": "local",
        "command": [
          "/Applications/Trama.app/Contents/MacOS/trama-agent",
          "--workspace"
        ]
      }
    }
  }
}
```

Windows, replacing the example path:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "trama": {
        "type": "local",
        "command": ["C:\\path\\to\\Trama\\trama-agent.exe", "--workspace"]
      }
    }
  }
}
```

These examples target V2. Earlier OpenCode versions use a different configuration shape. See the [OpenCode V2 MCP documentation](https://opencode.ai/v2/docs/mcp-servers) and use `opencode mcp list` to check the connection.

Restart or reload your client after changing its configuration. Ask the agent to list the available Trama projects to check that it can connect.

### Choose the scope

- `--workspace` exposes the available Trama projects. Project-specific tools still need a `project_id`; the agent can discover it with `list_projects`.
- `--project-id UUID` limits the server to one project. Copy the project ID from Trama's Preferences.

### Teach the workflow

Add the included [`skills/trama`](../skills/trama/SKILL.md) directory to your client's skill location. The skill describes task priority, taking work from the queue, recording delivery references, and handing work back for review.

The MCP server cannot read or change private task notes. Project Markdown notes are separate: the server can read and edit them through its document tools.

## Local data

Trama keeps its data in one folder:

| Platform | Trama folder |
| --- | --- |
| macOS | `~/Library/Application Support/Trama` |
| Windows | `%APPDATA%\Trama` |

Each workspace created in the app has a folder of its own, `Workspaces/<id>/`, with its database, `workspace.sqlite`, and its backups in `Backups/`. The id is short and never changes; the workspace's name only lives in the list, `workspaces.json`, so renaming a workspace moves no files. A database opened with **Open workspace…** stays where it is, with its backups in a `Backups` folder beside it. Deleting a workspace deletes its database, its backups and the folder Trama made for it.

The first time Trama 0.3.1 starts, it moves the workspaces earlier versions kept loose in the Trama folder, such as `trama.sqlite`, each into a folder of its own, and asks you to restart your agent sessions. A file that can't move yet stays where it is and Trama tries again the next time it starts. Databases opened from other folders are not moved.

Project notes stay in the folders you choose in the app. They are ordinary Markdown files and are not stored inside the task database.

Set `TRAMA_DB` to use a different SQLite path for development. Make sure the app and the MCP server point to the same database if you override it. Without `TRAMA_DB` and before you create a workspace, the MCP server still connects, but each tool call asks you to open Trama and create one; it uses the workspace as soon as you do, without reconnecting.

### Restore a database backup

Starting with Trama 0.3.1, opening an existing workspace that needs a schema upgrade saves a consistent database copy before changing its schema. The copy includes committed changes still in the SQLite WAL file. Each upgrade saves the original schema once, even when it runs several migration steps or the app and MCP open the workspace together. Opening a current database or creating an empty one does not create a backup.

Copies are saved in the `Backups` folder beside the workspace's database, named after the database, the Trama version that saved it and the schema before migration, for example `workspace.sqlite.v0.3.1.schema-12.bak`. If that name already exists, an extra identifier keeps the previous copy intact. Trama keeps the three most recent copies per workspace and removes older ones after saving a new copy. If a backup cannot be saved, the schema upgrade stops with an error; check free disk space and folder permissions before trying again.

Restoring is manual:

1. Find the workspace's database path in **Preferences → General → Workspaces**. Then close Trama and quit the connected MCP clients, or disable their Trama connection, making sure all `trama-agent` processes have stopped.
2. Move the current database to a separate safety folder. If files with the same name plus `-wal` or `-shm` remain, move them to that folder too. Keep this set together; those files must not remain beside the restored database.
3. Copy the chosen `.bak` from `Backups` into the workspace's folder and rename that copy to the original database filename. For example, copy `Backups/workspace.sqlite.v0.3.1.schema-12.bak` as `workspace.sqlite`. Keep the `.bak` itself.
4. To return to an older Trama version, install one that supports the backup's schema before reopening the app. For example, schema 12 is supported by Trama 0.3.0 and 0.3.1, while Trama 0.2.2 supports schemas up to 10. A newer app can open an older backup but will migrate it again; an app that does not support the backup's schema refuses it.
5. Open Trama and check the workspace's projects and tasks before restarting your agents. Changes made after the selected backup are absent from the restored database.

Database backups do not include the project's Markdown note folders. Keep separate copies of those folders if you need to restore their files too.
