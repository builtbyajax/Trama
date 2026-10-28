# Development guide

This guide covers local setup, running Trama from source, development data, and build checks.

## Prerequisites

- Node.js **22.12 or later**
- Rust **1.90 or later**
- The [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform
- Git for repository features
- The [GitHub CLI](https://cli.github.com/), installed and authenticated, to look up pull requests

## Install and run

From the repository root:

```sh
cd app
npm ci
npm run tauri dev
```

For the browser development view, run `npm run dev` from `app/`. It connects to the same Rust core through a local development bridge at `http://127.0.0.1:1420`.

## Development data

Development commands use `.trama-local/development/` at the repository root by default. This keeps development databases separate from the installed app's data.

Set `TRAMA_HOME` or `TRAMA_DB` to select a different location. For example, from `app/`:

```sh
TRAMA_DB=/path/to/trama-development.sqlite npm run tauri dev
```

`TRAMA_DEV_PERSONAL=1` opts into the installed app's data and may migrate it. Use it only when you intend to work with that data and accept the migration risk. Do not use it for routine development or tests.

## Build the desktop app

From `app/`:

```sh
npm run tauri build
```

The output is written to `app/src-tauri/target/release/bundle/` and includes the local MCP server. Signing and release distribution are separate from a local build.

## Run checks before sending changes

Run these commands from `app/`:

```sh
npm run typecheck
npm run format:check
npm test
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --features agent-cli,dev-bridge -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml --features agent-cli,dev-bridge
npm run build
```

See [Testing and CI](testing.md) for test coverage, browser workflows, and GitHub Actions details.
