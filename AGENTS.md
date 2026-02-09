# LOBSTER - AI Coding Agent

LOBSTER is a terminal-based AI coding agent. It reads, writes, and refactors code, runs shell commands, searches codebases, manages files, and coordinates multi-agent tasks -- all through natural language.

## How It Works

LOBSTER combines a core agentic coding engine (40+ built-in tools, multi-provider LLM support, TUI/CLI/API interfaces) with a plugin layer that adds multi-agent review, persistent memory, cost tracking, automatic context injection, and team coordination.

The plugin layer works through **lifecycle hooks**:
- `experimental.chat.system.transform` -- plugins inject XML context blocks into the system prompt before the AI sees your message
- `tool.execute.after` -- plugins track tool execution for cost monitoring

All persistent data (memories, review state, cost tracking, team sessions, plans) is stored as JSON and markdown files in `.lobster/memory/`.

## Core Capabilities

### 1. Agentic Coding
Full tool access to the development environment:
- **File operations**: `read`, `write`, `edit`, `multiedit`, `apply_patch`, `glob`, `ls`
- **Search**: `grep`, `codesearch`, `websearch`, `webfetch`
- **Execution**: `bash`, `task`, `batch`
- **Planning**: `plan`, `todo`
- **Code intelligence**: `lsp` (go-to-definition, references, diagnostics)

### 2. Auto-Context Injection
Every message is automatically enriched with relevant project context:
- Task type classification (bug_fix, new_feature, refactor, test, docs, config)
- Tech stack detection from `package.json`
- TF-IDF file relevance scoring (top 8 files for your query)
- Recent git history on relevant files
- 30-second file index cache for fast follow-up messages

### 3. Multi-Agent Review Loop
Iterative code quality loop: coder -> reviewer -> tester -> fix -> repeat.
- `review_loop` tool orchestrates the cycle
- Review state tracked in `review-loop-state.json` with phase, iteration, and verdict history
- Orchestrator plugin injects current loop state into system prompt
- Reviewer and architect agents have **read-only access** to prevent conflicts of interest
- Structured findings recorded with severity levels via `review_findings`
- Loop ends on PASS from all agents or max iterations (default 3)

### 4. Persistent Memory
Store and recall project knowledge across sessions:
- `memory_store` -- save with category, title, tags. Stored as markdown with YAML frontmatter.
- `memory_retrieve` -- get memories by category
- `memory_search` -- search by keyword
- Memory plugin auto-injects 10 most recent memories into system prompt
- Pattern warnings from `pattern-insights.json` also injected to prevent recurring mistakes

### 5. Smart Pattern Detection
Analyzes review findings across iterations:
- Groups similar findings by title (2+ occurrences = recurring antipattern)
- Compares early vs. late iterations for trend detection (improving/degrading)
- Extracts lessons from memories categorized as "mistake" or "lesson"
- Stores insights in `memory/pattern-insights.json` with confidence scores

### 6. Cost & Token Tracking
Tracks every API call:
- `tool.execute.after` hook captures output token estimates
- Per-model pricing (Claude Sonnet 4.5: $3/$15, Opus 4.6: $15/$75 per M tokens)
- `cost_summary` shows per-model breakdown
- `cost_budget` sets budget limit + alert threshold (default 80%)
- Budget warning injected into system prompt when threshold reached

### 7. Team Coordination
Multi-agent task decomposition:
- `team_coordinate` decomposes tasks into subtasks with priorities and dependencies
- Auto-assigns agents based on keyword matching (implementation -> coder, tests -> tester, etc.)
- DFS cycle detection on dependency graph
- File conflict detection across subtasks
- Subtask states: assigned -> in_progress -> completed (or blocked/failed)
- Team plugin injects active session progress into system prompt

### 8. Implementation Planning
Structured plans with analysis:
- File analysis: line count, function count, complexity classification
- Category ordering: types -> config -> implementation -> tests
- Import-based dependency graph with high fan-in detection
- Risk assessment: high-complexity files, missing tests, high fan-in files
- Progress tracking via `plan_status`

### 9. Smart Context Manager (MCP)
MCP server for intelligent file discovery:
- `index_project` -- build TF-IDF index of all project files
- `find_relevant` -- rank files by relevance to natural language query
- `estimate_tokens` -- estimate context window usage for files

## Agent Roster

| Agent | Role | Access | Model |
|-------|------|--------|-------|
| **coder** | Implementation -- writes features, fixes bugs, addresses feedback | Full read/write | Claude Sonnet 4.5 |
| **reviewer** | Quality gate -- correctness, security, edge cases, performance | Read-only | Claude Sonnet 4.5 |
| **tester** | Validation -- writes and runs tests, reports coverage gaps | Full read/write | Claude Sonnet 4.5 |
| **architect** | Design -- structure, scalability, separation of concerns | Read-only | Claude Sonnet 4.5 |
| **team-lead** | Coordination -- task decomposition, agent assignment, dependency management | Full read/write | Claude Sonnet 4.5 |
| **docs** | Documentation -- generates and maintains project docs | Full read/write | Claude Sonnet 4.5 |
| **triage** | Issue triage -- categorizes and prioritizes issues | Read-only | Claude Sonnet 4.5 |

## Multiple Interfaces

| Interface | Command | Use Case |
|-----------|---------|----------|
| **TUI** | `lobster` | Interactive development with dashboards (`/review`, `/findings`, `/health`, `/patterns`) |
| **CLI** | `lobster run "message"` | Quick tasks and scripting |
| **API** | `lobster serve` | Programmatic access (REST on port 4096) |

## Multi-Provider LLM Support

Works with: Anthropic (Claude), OpenAI (GPT), Google (Gemini), AWS Bedrock, Azure OpenAI, Groq, Mistral, Cohere, Cerebras, DeepInfra, Perplexity, Together AI, xAI, OpenRouter, and more via AI SDK.

## Plugin System

| Type | Location | Purpose |
|------|----------|---------|
| Plugins | `.lobster/plugins/*.ts` | Lifecycle hooks (system prompt injection, tool tracking) |
| Tools | `.lobster/tool/*.ts` + `*.txt` | New capabilities (`.ts` = logic, `.txt` = AI description) |
| Agents | `.lobster/agent/*.md` | Specialized agents with system prompts and access rules |
| Skills | `.lobster/skill/*/SKILL.md` | Slash command prompt templates |
| Commands | `.lobster/command/*.md` | Markdown-based command extensions |

Ships with: 5 plugins, 18 tools, 7 agents, 7 skills.

## Style Guide

- Default branch is `dev`
- Use Bun APIs when possible
- Prefer `const`, early returns, no destructuring
- Avoid `try/catch`, `any` type, `else` blocks
- Single word variable names where possible
- Test actual implementations, avoid mocks
