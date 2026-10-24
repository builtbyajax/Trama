# Testing and CI

The suites live in this repository and use synthetic data. Run commands below from `app/` unless stated otherwise. Node.js 22.12+, Rust 1.90+ and the platform's Tauri prerequisites are required.

## Data isolation

`npm run dev` and `npm run tauri dev` default to `.trama-local/development/` at the repository root. An explicit `TRAMA_HOME` or `TRAMA_DB` takes precedence. `TRAMA_DEV_PERSONAL=1` opts into the installed app's data and may migrate it; do not use that option for tests.

Rust tests create temporary databases, notes folders and Git repositories. Workspace tests pass their paths to `Registry::at` instead of mutating process environment variables. MCP tests set isolated environment variables on child processes only. Nothing needs a personal database, authenticated GitHub session or network provider.

## Fast checks

```sh
npm ci
npm run typecheck
npm run format:check
npm test
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --features agent-cli,dev-bridge -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml --features agent-cli,dev-bridge
npm run build
```

For a clean checkout without prepared sidecars, check builds can override bundle configuration. In Bash:

```sh
export TAURI_CONFIG='{"bundle":{"externalBin":[]}}'
```

In PowerShell:

```powershell
$env:TAURI_CONFIG = '{"bundle":{"externalBin":[]}}'
```

This override is for check builds; installer builds use `npm run tauri build`, which prepares and bundles the real sidecar. Do not carry the check override into an installer build.

## What is covered

- SQLite migrations from frozen synthetic schema 1–9 fixtures to schema 10, row preservation, rollback, concurrent opening and refusal of newer databases without changing their bytes or journal.
- Workspace creation, editing, switching, relocation, removal versus deletion, registry recovery and isolated path handling.
- Project transfers with related data, duplicate/mid-copy rollback and a guard that fails when a new project-related table is missing from the transfer plan.
- Notes: traversal, external and hidden symlinks, conflicts, size/encoding limits, no-overwrite operations and validated recycle service delegation.
- Task ordering, status events and actors, drafts, archiving, partial updates, categories, goal lifecycle and public versus private search.
- Git parsers and real temporary repositories; PR fixtures with a fake provider.
- Markdown, briefings, handoffs, Git presentation, shortcut platforms, translation placeholders and selected components with editing or destructive actions.

The recycle service unit test substitutes a temporary recycle folder. It does not claim that an OS's real Trash UI has been exercised.

## MCP contract

`src-tauri/tests/mcp_contract.rs` launches the real `trama-agent` over stdin/stdout. It exercises every listed tool in workspace and project modes, protocol errors, validation, scope, pagination, task delivery, active workspace following, graceful shutdown and incompatible database failure. Read-tool responses are checked for a unique private annotation sentinel.

`src-tauri/tests/fixtures/mcp-contract.json` stores normalized synthetic replies and schemas. IDs, dates, temporary paths and host-specific optional provider availability are normalized. Review intentional contract changes before replacing the snapshot:

```sh
UPDATE_SNAPSHOTS=1 cargo test --locked --manifest-path src-tauri/Cargo.toml --features agent-cli --test mcp_contract
```

Then run without `UPDATE_SNAPSHOTS` and review the diff, `skills/trama/SKILL.md` and site documentation. `TRAMA_AGENT_BIN` can select a packaged binary while retaining the same tests.

## Browser workflows

```sh
npx playwright install chromium webkit
npm run test:e2e
```

The launcher builds the development transports. The test server creates a fresh temporary `TRAMA_HOME`, clears inherited database/personal-data overrides and seeds a project through the real MCP process. It starts Vite on `127.0.0.1:1423`; it never reuses an existing server. It removes its temporary home on shutdown.

Chromium and WebKit exercise workspace/project/task creation, task movement by keyboard and pointer drag with persisted order, goal completion/reopening, project transfer, workspace removal/deletion including the active one, note editing and external conflicts. HTTP tests reject DNS rebinding and cross-origin writes before changing data. No transport responses are mocked. Traces are retained under `app/test-results/` on failure.

The temporary home path is recorded in ignored `.trama-local/e2e-state.json`. Local test output, traces, databases and coverage reports are ignored by Git.

For repeated verification:

```sh
npm run test:e2e -- --repeat-each=3
```

These are browser workflows on the machine running the tests. A macOS run does not establish that the native Windows interface or installer works.

## Coverage

Coverage is informational; there is no percentage gate.

```sh
npm run test:coverage
rustup component add llvm-tools-preview
cargo install cargo-llvm-cov --locked --version 0.9.1
cargo llvm-cov --manifest-path src-tauri/Cargo.toml --locked --features agent-cli,dev-bridge --json --output-path src-tauri/target/coverage.json
```

Vitest reports library/hook coverage under `app/coverage/`. Its percentages exclude Playwright execution. Rust coverage includes instrumented MCP child processes, which must be allowed to exit normally to write their profiles. Browser execution of `trama-api` is not combined into that Rust report.

Use uncovered branches to select useful tests. Percentages alone do not demonstrate data preservation, privacy or platform compatibility.

## GitHub workflows

- `ci.yml`: push, PR to `main`, manual and reusable runs. It checks formatting/types/versions, runs frontend tests, runs Rust/MCP tests and release builds on macOS and Windows, checks Rust 1.90 and runs Chromium/WebKit workflows on macOS. It retains coverage reports and browser failure traces.
- `audit.yml`: PRs, main pushes, weekly and manual runs. npm production and Rust audits are informational initially. Findings and execution failures remain visible in logs and the job summary.
- `release.yml`: manual. It calls the full CI on the same commit, builds native Apple Silicon/Intel/Windows installers and runs the MCP contract against the packaged server. Windows extracts the NSIS installer with 7-Zip. No installer is uploaded until its contract passes. A draft prerelease is created only from `main`, after all platforms pass, with a combined `SHA256SUMS` file. The version/tag check rejects a tag pointing to another commit. Complete native platform QA before publication.

Workflow actions are pinned to commit SHAs. The PR template prompts for migration fixtures, MCP snapshots and documentation review.

## Verification record

On 2026-10-24, [GitHub CI run 40107998925](https://github.com/builtbyajax/Trama/actions/runs/40107998925) passed on commit `60d4254147e44c53d4a2dee17c43b6f6275b797c`:

- 49 Rust tests on both macOS and Windows, including four real-process MCP contract tests and two contract helper tests.
- 32 Vitest tests and five script tests.
- Four Chromium/WebKit workflows on macOS, covering the lifecycle and bridge protections.
- Release binary builds on both platforms, Rust 1.90 compatibility, typecheck, formatting, Clippy and frontend build.
- Informational line coverage: Rust 79.35%; frontend libraries/hooks 50.50% (libraries 73.84%). Browser coverage is separate.

Local verification also passed the base lifecycle three times per browser, 625 concurrent migration pairs and workflow syntax validation with actionlint. A local native Apple Silicon app build passed the contract against its ad hoc signed packaged server.

The first remote runs exposed Windows fixture line endings, temporary-path normalization differences and a WAL initialization race. The fixes preserve the expected MCP snapshot. Migration refusal also has a regression test proving that pending WAL data is not checkpointed into a newer database.

`npm audit --omit=dev` reported no vulnerabilities. `cargo audit` reported seven warnings: unmaintained `proc-macro-error`, `zbus_names`, `zvariant`, `zvariant_derive`; unsoundness advisories for `glib` and `tokio`; and yanked `clipboard-win`. The warnings were not suppressed or treated as fixed.

For native Apple Silicon, Intel and Windows package verification and combined checksum artifacts, see [installer workflow run 40108372410](https://github.com/builtbyajax/Trama/actions/runs/40108372410) on the same commit. The workflow tests the packaged MCP server; interactive installer and native interface QA remain separate from these automated checks.
