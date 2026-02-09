# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LOBSTER is an AI-powered coding agent CLI with a terminal UI, built as a fork of [OpenCode](https://github.com/anomalyco/opencode). It provides 40+ built-in tools, multi-provider LLM support, a multi-agent team system, and Claude Code plugin compatibility. Repository: `github.com/HuskySteam/LOBSTER`.

## Commands

```bash
# Development
bun install              # Install all workspace dependencies
bun dev                  # Run TUI in packages/lobster directory
bun dev <directory>      # Run TUI targeting a specific directory
bun dev .                # Run TUI in repo root
bun dev serve            # Start headless API server (port 4096)
bun dev serve --port 8080

# Typecheck (all packages via turbo)
bun typecheck

# Typecheck single package
cd packages/lobster && bun run tsc --noEmit

# Tests
cd packages/lobster && bun test
cd packages/lobster && bun test src/tool/bash.test.ts  # Single test file

# Build local binary (current platform only)
bun run --cwd packages/lobster build --single

# Build all platforms
bun run --cwd packages/lobster build

# Regenerate SDK after API/route changes
./script/generate.ts
```

## Monorepo Structure

Bun workspace with Turborepo orchestration. Package manager: `bun@1.3.5`.

| Package | npm name | Purpose |
|---------|----------|---------|
| `packages/lobster` | `lobster` | Core CLI, TUI, tools, server, providers, sessions |
| `packages/plugin` | `@lobster-ai/plugin` | Plugin SDK - hooks and tool definition API |
| `packages/sdk/js` | `@lobster-ai/sdk` | JS/TS client SDK (auto-generated from OpenAPI) |
| `packages/script` | `@lobster-ai/script` | Build utilities, version/release management |
| `packages/util` | `@lobster-ai/util` | Shared utilities (errors, IDs, encoding) |
| `packages/slack` | `@lobster-ai/slack` | Slack integration |

The `.lobster/` directory at the repo root contains project-local plugins, tools, agents, skills, commands, and memory files. These are loaded at runtime and extend the core system.

## Architecture (packages/lobster/src/)

### Entrypoint & CLI
- `index.ts` - yargs CLI setup, registers all commands (run, serve, tui, auth, mcp, etc.)
- `cli/cmd/tui/` - Terminal UI built with **SolidJS + OpenTUI** (`@opentui/core`, `@opentui/solid`)

### Core Systems

**Session loop** (`session/prompt.ts`): The main agentic loop. `resolveTools()` gathers built-in tools, plugin tools, and MCP tools into a single record, then feeds them to the AI SDK's `streamText`. The loop runs until the model stops calling tools or hits max steps.

**Tool system** (`tool/`): Tools are defined with `Tool.define()` using Zod schemas. Each tool's `execute()` receives a `Tool.Context` with sessionID, abort signal, `metadata()` for streaming updates, and `ask()` for permissions. Tool registry (`tool/registry.ts`) loads built-in tools, file-based custom tools from `{tool,tools}/*.ts`, and plugin tools.

**Provider system** (`provider/`): 20+ LLM providers via Vercel AI SDK v5. `provider.ts` handles model discovery, `transform.ts` handles provider-specific message normalization, caching, tool call ID sanitization, and schema adjustments per provider.

**MCP integration** (`mcp/index.ts`): Connects to MCP servers via stdio/SSE/HTTP transports. Tool names are sanitized to `[a-zA-Z0-9_-]` with `_` separator: `sanitizedClient_sanitizedTool`. Supports OAuth authentication flow.

**Agent system** (`agent/`): Built-in agents (build, plan, explore, summary, title) and custom agents from `.lobster/agent/*.md`. Agents have permission rulesets controlling which tools they can access.

**Plugin system** (`plugin/index.ts`): Plugins are loaded from npm, git, or `file://` URIs. They return `Hooks` with lifecycle callbacks: `tool.execute.before/after`, `chat.message`, `shell.env`, etc. Claude Code plugin compatibility via `plugin/claude-compat.ts`.

**Event pipeline** (server -> TUI): Server publishes `message.part.updated` events via SSE/RPC. SDK batches events every 16ms. Sync store (`cli/cmd/tui/context/sync.tsx`) applies updates to SolidJS store. UI components react.

**Permission system** (`permission/`): Pattern-based rules (glob matching) with ask/allow/deny actions. Tools request permission via `ctx.ask()`.

### Server
- `server/server.ts` - Hono HTTP server with WebSocket support
- `server/routes/` - REST API endpoints for sessions, files, config, providers, MCP, PTY, permissions

### Message Types
- `session/message-v2.ts` - Discriminated unions: `ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError`
- Tool parts track state transitions: pending -> running -> completed/error
- `session/processor.ts` - Handles tool state transitions and publishes part update events

### Config
- `config/config.ts` - JSONC format, loaded from multiple sources (global, project, `.lobster/`, env vars) with precedence rules
- Config file: `lobster.json` or `lobster.jsonc`

## Tech Stack

- **Runtime:** Bun (use `Bun.file()`, `Bun.$`, Bun-native APIs)
- **UI:** SolidJS reactivity (`createSignal`, `createMemo`, `createStore`, `reconcile`, `batch`) + OpenTUI for terminal rendering
- **AI:** Vercel AI SDK v5 (`ai` package) - `streamText`, `tool()`, `dynamicTool()`, `jsonSchema()`
- **Validation:** Zod v4 (`zod/v4`) for schemas, `z.toJSONSchema()` for AI SDK tool definitions
- **HTTP:** Hono framework
- **Protocols:** MCP SDK (`@modelcontextprotocol/sdk`), LSP via `vscode-jsonrpc`

## Style Guide

- Prefer immutable patterns, avoid `let`
- Avoid `else` - use early returns
- Prefer `.catch()` over `try/catch`
- Use precise types, avoid `any`
- Concise single-word identifiers
- Keep functions focused; avoid unnecessary destructuring
- Use Bun-native APIs (`Bun.file()`, `Bun.$`) when they fit
- Conventional commit titles: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:` with optional scope `feat(lobster):`

## Key Patterns

**Tool name sanitization:** All tool names sent to LLM providers must match `^[a-zA-Z0-9_-]{1,128}$`. Sanitization happens in `mcp/index.ts` (MCP tools), `tool/registry.ts` (plugin tools), and `plugin/claude-compat.ts` (Claude Code plugin tools).

**Path aliases:** `@/*` maps to `./src/*`, `@tui/*` maps to `./src/cli/cmd/tui/*` (configured in tsconfig).

**Namespace pattern:** Most modules use TypeScript namespaces (`export namespace X {}`) with `Instance.state()` for singleton lazy initialization tied to the project instance lifecycle.

**SolidJS in TUI:** Components use JSX with `@opentui/solid` pragma. Terminal-specific elements: `<box>`, `<text>`, `<span>` with props like `fg`, `bg`, `paddingLeft`, `flexDirection`, `gap`.

**Build output:** `bun run build` compiles to standalone binaries via `Bun.build({ compile: true })`. Linux targets produce `.tar.gz`, Windows/macOS produce `.zip`. Output directory: `packages/lobster/dist/`.
