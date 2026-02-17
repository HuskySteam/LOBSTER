# LOBSTER Agent Guide

This file is for coding agents working in this repository.

## Mission

LOBSTER is a Bun-based AI coding agent platform (CLI + TUI + API server) in a monorepo.
Core runtime lives in `packages/lobster`.

## Repo Map

- `packages/lobster`: core product (CLI, TUI, session loop, tools, providers, server)
- `packages/lobster/src`: runtime source
- `packages/lobster/test`: primary test suite (domain mirrors `src`)
- `packages/plugin`: `@lobster-ai/plugin` SDK for custom plugins/tools
- `packages/sdk/js`: generated client SDK and OpenAPI artifacts
- `packages/util`: shared utilities
- `packages/script`: build/release helpers
- `packages/slack`: Slack integration
- `.lobster/`: project-local extensions (plugins, tools, agents, skills, commands, memory)

## Core Runtime Landmarks

- CLI entrypoint: `packages/lobster/src/index.ts`
- CLI bootstrap/lifecycle: `packages/lobster/src/cli/bootstrap.ts`
- Session engine: `packages/lobster/src/session/processor.ts`
- Prompt/tool resolution: `packages/lobster/src/session/llm.ts`
- Tool registry: `packages/lobster/src/tool/registry.ts`
- Agent definitions + permissions: `packages/lobster/src/agent/agent.ts`
- Config loading/merging: `packages/lobster/src/config/config.ts`
- Provider loading: `packages/lobster/src/provider/provider.ts`
- Server + routes: `packages/lobster/src/server/server.ts`, `packages/lobster/src/server/routes/`
- TUI app shell: `packages/lobster/src/cli/cmd/tui/app.tsx`

## Important Commands

Use from repo root unless noted.

```bash
# install
bun install

# start TUI (defaults to packages/lobster working dir)
bun dev

# run against this repo root
bun dev .

# headless API server (default 4096)
bun dev serve
bun dev serve --port 8080

# typecheck all workspace packages
bun typecheck

# tests (run from package, root test is intentionally blocked)
cd packages/lobster && bun test
cd packages/lobster && bun test <path-to-test-file>

# build binaries
bun run --cwd packages/lobster build --single
bun run --cwd packages/lobster build

# regenerate SDK after server/OpenAPI changes
./script/generate.ts
```

Notes:
- `bun test` at repo root intentionally fails (`"do not run tests from root"`).
- `lobster --help` and `bun dev --help` expose the same command surface during dev.

## Extension System (`.lobster/`)

LOBSTER loads project-local extensions at runtime.

- Plugins: `.lobster/plugins/*.ts`
- Custom tools: `.lobster/tool/*.ts` (plus optional `.txt` descriptions)
- Custom agents: `.lobster/agent/*.md`
- Skills: `.lobster/skill/*/SKILL.md`
- Custom commands: `.lobster/command/*.md`
- Runtime state: `.lobster/memory/*.json`

Current project config is in `.lobster/lobster.jsonc`.

### Tool Authoring Rules

- Custom tool loader scans every `*.ts` file in `{tool,tools}` directories.
- It imports each module and treats each export as a tool definition.
- Do not place generic helper modules in `.lobster/tool` unless they are structured to avoid export collisions.
- Tool IDs come from filename/export and are sanitized to `[a-zA-Z0-9_-]`.

### Command Authoring Rules

- Command files are markdown with frontmatter in `.lobster/command/`.
- Command name comes from relative file path, not frontmatter.
- Schema fields are in `Config.Command` (`template`, optional `description`, `agent`, `model`, `subtask`).
- Restart/reload TUI if new commands do not appear immediately.

### Skill Loading Rules

Skills are discovered from:
- project `.lobster/skill/`
- user folders (for example `~/.claude/skills`, `~/.agents/skills`)
- configured paths/URLs in config

Duplicate skill names can shadow earlier ones.

## Command Surfaces (Do Not Confuse)

- CLI commands: yargs commands in `packages/lobster/src/index.ts`
- Slash commands in TUI prompt/palette: UI layer + command catalog
- Custom markdown commands are shared by CLI (`--command`) and TUI (`/name`)
- Some slash actions are TUI-only convenience actions and are not 1:1 CLI commands

## Coding Conventions

- Default branch: `dev`
- Prefer Bun-native APIs (`Bun.file`, `Bun.$`) when appropriate
- Prefer `const`, immutable flow, early returns
- Avoid `else` where guard clauses are clearer
- Prefer precise types; avoid `any`
- Prefer `.catch(...)` where it keeps control flow simple
- Avoid unnecessary destructuring
- Use concise variable names when still clear
- Match existing patterns in touched files before introducing new abstractions

## Testing and Verification Expectations

- Place/adjust tests under `packages/lobster/test/<domain>/`
- Prefer real implementation tests over heavy mocking
- For behavior changes in tools/session/runtime, run targeted tests first, then broader suite
- If API routes or schemas change, regenerate SDK (`./script/generate.ts`) and verify generated outputs

## PR Expectations (from CONTRIBUTING)

- Link an issue (`Fixes #...` or `Closes #...`)
- Keep PRs focused and small
- Include verification steps/results in PR description
- Include screenshots/videos for UI changes
- Use conventional commit style in PR titles (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`)

## High-Signal Gotchas

- `bun dev` runs in `packages/lobster` by default; use `bun dev .` for repo-root context.
- Debugging TUI/server may require `bun dev spawn` or explicit `--inspect` workflows (see `CONTRIBUTING.md`).
- Config precedence is non-trivial; check `packages/lobster/src/config/config.ts` before assuming defaults.
- Tool and command names are filename/path-driven in several loaders; renames can change behavior silently.

## Recommended Workflow for Agents

1. Read this file, then inspect touched domain files in `packages/lobster/src`.
2. Confirm command/tool/agent extension points before implementing.
3. Make smallest coherent change.
4. Run targeted verification.
5. Summarize behavior change + verification evidence with file references.
