<p align="center">
  <img src="https://img.shields.io/badge/LOBSTER-v1.0.0-ff3e3e?style=for-the-badge&labelColor=1a1a2e" alt="Version">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge&labelColor=1a1a2e" alt="License">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen?style=for-the-badge&labelColor=1a1a2e" alt="Platform">
  <img src="https://img.shields.io/badge/Runtime-Bun-f472b6?style=for-the-badge&labelColor=1a1a2e" alt="Bun">
  <br>
  <a href="https://www.bridgemind.ai/vibeathon">
    <img src="https://img.shields.io/badge/🏆_Bridge_Mind_Vibeathon-Feb_1--14,_2026-ff6b35?style=for-the-badge&labelColor=1a1a2e" alt="Bridge Mind Vibeathon">
  </a>
</p>

<p align="center">
<pre align="center">
        ██╗      ██████╗ ██████╗ ███████╗████████╗███████╗██████╗
        ██║     ██╔═══██╗██╔══██╗██╔════╝╚══██╔══╝██╔════╝██╔══██╗
        ██║     ██║   ██║██████╔╝███████╗   ██║   █████╗  ██████╔╝
        ██║     ██║   ██║██╔══██╗╚════██║   ██║   ██╔══╝  ██╔══██╗
        ███████╗╚██████╔╝██████╔╝███████║   ██║   ███████╗██║  ██║
        ╚══════╝ ╚═════╝ ╚═════╝ ╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
</pre>
</p>

<h3 align="center">AI-Powered Coding Agent with a Built-In Development Team</h3>

<p align="center">
  <em>One command. Multiple AI agents. Plan, build, review, test — all coordinated.</em>
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-how-it-works">How It Works</a> •
  <a href="#-features">Features</a> •
  <a href="#%EF%B8%8F-plugin-system">Plugins</a> •
  <a href="#-configuration">Config</a>
</p>

---

## 🚀 Quick Start

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/HuskySteam/LOBSTER/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/HuskySteam/LOBSTER/main/install.ps1 | iex
```

**Then just run:**
```bash
lobster
```

<details>
<summary><b>📦 Other installation methods</b></summary>

**From source:**
```bash
git clone https://github.com/HuskySteam/LOBSTER.git
cd lobster
bun install
bun dev
```
Requires [Bun](https://bun.sh) >= 1.3.5

**Upgrade:**
```bash
lobster upgrade
```

</details>

---

## 🧠 What is LOBSTER?

Most AI coding tools are a **single agent in a box**. You type a prompt, it generates code, done. No review. No tests. No memory.

LOBSTER gives you a **full AI development team** — not one agent, but a coordinated system of specialized agents that **plan, build, review, test, and learn from each other**.

```
You: "Build a user authentication system with JWT and tests"

LOBSTER:
  ✓ Architect designs the interface          [2s]
  ✓ Coder implements JWT auth service        [8s]
  ✓ Coder adds rate limiting middleware      [5s]
  ✓ Reviewer catches missing input validation [3s]
  ✓ Coder fixes validation                  [4s]
  ✓ Tester writes & runs 12 tests           [6s]
  ✓ All agents pass — shipping it
```

It's also a complete agentic coding CLI: **40+ tools**, multi-provider LLM support, persistent memory, cost tracking, and automatic context injection.

Built as a fork of [OpenCode](https://github.com/anomalyco/opencode) with full [Claude Code](https://github.com/anthropics/claude-code) plugin compatibility.

---

## ⚡ How It Works

### The Agent Team

```
                    ┌─────────────────────────────────┐
                    │          🎯 TEAM LEAD            │
                    │   Decomposes • Assigns • Tracks  │
                    └──────┬──────┬──────┬──────┬─────┘
                           │      │      │      │
                    ┌──────▼─┐ ┌──▼────┐ ┌▼─────┐ ┌▼──────────┐
                    │ 💻     │ │ 🔍    │ │ 🧪   │ │ 📐        │
                    │ CODER  │ │REVIEW │ │TESTER│ │ ARCHITECT  │
                    │        │ │       │ │      │ │            │
                    │ Write  │ │ Bugs  │ │ Test │ │ Design     │
                    │ code   │ │ Sec.  │ │ Run  │ │ Structure  │
                    │ [R/W]  │ │ [R/O] │ │[R/W] │ │ [R/O]      │
                    └────────┘ └───────┘ └──────┘ └────────────┘
```

> **Access control is enforced** — Reviewer and Architect agents literally cannot write files. They only have read-only tools. This prevents an agent from reviewing its own code.

### The Workflow

| Step | What Happens |
|------|-------------|
| **1. Decompose** | Your task is split into subtasks with dependencies |
| **2. Validate** | Cycle detection, file conflict warnings, blocking resolution |
| **3. Execute** | Agents work in dependency order with enforced access levels |
| **4. Track** | Live progress bars, status dashboard, auto-unblocking |
| **5. Review Loop** | Coder → Reviewer → Tester → fix → repeat until all pass |

<details>
<summary><b>📋 See a full example</b></summary>

```
> Build a user authentication system with JWT, rate limiting, and tests

┌─ Task Decomposition ────────────────────────────────────────────┐
│                                                                  │
│  #1  Define auth types & interfaces      → architect  [high]    │
│  #2  Implement JWT auth service          → coder      [high]    │
│  #3  Add rate limiting middleware        → coder      [high]    │
│  #4  Write auth unit tests              → tester     [medium]  │
│  #5  Security review                    → reviewer   [medium]  │
│  #6  Integration tests                  → tester     [low]     │
│                                                                  │
│  Dependencies: #2,#3 → after #1  |  #4,#5 → after #2,#3       │
│  Conflicts: none detected                                       │
└──────────────────────────────────────────────────────────────────┘

Progress: ████████████████████ 100% (6/6)

✅ #1 Define auth types & interfaces      architect   [done]
✅ #2 Implement JWT auth service           coder       [done]
✅ #3 Add rate limiting middleware         coder       [done]
✅ #4 Write auth unit tests               tester      [done]
✅ #5 Security review                     reviewer    [done]
✅ #6 Integration tests                   tester      [done]
```

</details>

---

## 🔧 Features

### 🤖 40+ Built-in Tools

| Category | Tools | Description |
|----------|-------|-------------|
| **File Ops** | `read`, `write`, `edit`, `multiedit`, `glob`, `ls` | Read, create, modify files with precision |
| **Search** | `grep`, `codesearch`, `websearch`, `webfetch` | Regex, semantic, web search + page fetch |
| **Execute** | `bash`, `task`, `batch` | Shell commands, sub-agents, parallel ops |
| **Plan** | `plan`, `todo` | Implementation plans with dependency tracking |
| **Code Intel** | `lsp` | Go-to-def, find refs, diagnostics via LSP |

### 🧩 Claude Code Plugin Compatibility

Install plugins directly from Claude Code marketplaces:

```
/plugin                              # Open plugin manager
/plugin install feature-dev          # Install from marketplace
/plugin marketplace add owner/repo   # Add marketplace source
/plugin list                         # Show installed
/plugin remove <name>                # Uninstall
```

Browse and install from the **unified marketplace tab** in the plugin manager dialog — aggregates plugins from all configured sources with source badges.

### 🧠 Persistent Memory

Your AI remembers across sessions. Architecture decisions, coding patterns, past mistakes — all stored and auto-loaded.

```
Session 1:  "We use bcrypt, not argon2 — deployment doesn't support it"
            → Saved to memory

Session 2:  "Build the password reset endpoint"
            → AI uses bcrypt automatically (loaded from memory)
```

### 📊 Smart Pattern Detection

Analyzes review history to detect recurring antipatterns:

- Groups similar findings by frequency
- Detects quality trends (improving / degrading)
- Extracts lessons from past mistakes
- Injects warnings so agents proactively avoid known issues

### 🎯 Auto-Context Injection

Every message is enriched with relevant context automatically:

1. **Task classification** — bug fix, feature, refactor, test?
2. **Stack detection** — parses `package.json` for frameworks
3. **File relevance** — TF-IDF scoring ranks every file against your message
4. **Git history** — recent changes on the most relevant files

### 💰 Cost & Token Tracking

```
/cost                    # View per-model costs
/budget $5               # Set spending limit with alerts
```

Tracks every token, estimates costs per model, warns at 80% budget.

### 🌐 Multi-Provider LLM Support

| Provider | Models |
|----------|--------|
| **Anthropic** | Claude 4.5 / 4.6 (default) |
| **OpenAI** | GPT-4o, o1, o3 |
| **Google** | Gemini |
| **AWS Bedrock** | Claude via AWS |
| **Azure OpenAI** | GPT via Azure |
| + | Groq, Mistral, Cohere, xAI, OpenRouter, Together AI, and more |

---

## 🔌️ Plugin System

Fully extensible through a `.lobster/` directory:

| Type | Location | Description |
|------|----------|-------------|
| **Plugins** | `.lobster/plugins/*.ts` | Hook into agent lifecycle |
| **Tools** | `.lobster/tool/*.ts` + `*.txt` | Custom capabilities |
| **Agents** | `.lobster/agent/*.md` | Specialized agents with access rules |
| **Skills** | `.lobster/skill/*/SKILL.md` | Slash command templates |
| **Commands** | `.lobster/command/*.md` | Custom slash commands |

Ships with **5 plugins**, **18 tools**, **7 agents**, **7 skills** out of the box.

---

## 🖥️ Three Interfaces

| Interface | Command | Best For |
|-----------|---------|----------|
| **TUI** | `lobster` | Interactive development with rich terminal UI |
| **CLI** | `lobster run "message"` | Quick tasks and scripting |
| **API** | `lobster serve` | Programmatic access on port 4096 |

### TUI Dashboards

| Command | Shows |
|---------|-------|
| `/review` | Review loop pipeline, iteration count, quality score |
| `/findings` | Navigable review findings (j/k/Enter/a/r/s) |
| `/health` | Quality score, costs, memory stats |
| `/patterns` | Recurring antipatterns with trends |

---

## ⚙️ Configuration

Create `lobster.jsonc` in your project root:

```jsonc
{
  "provider": {
    "default": "anthropic"
  },
  "plugin": [
    "file://.lobster/plugins/lobster-orchestrator.ts",
    "file://.lobster/plugins/lobster-memory.ts",
    "file://.lobster/plugins/lobster-cost-tracker.ts",
    "file://.lobster/plugins/lobster-auto-context.ts",
    "file://.lobster/plugins/lobster-team.ts"
  ],
  "mcp": {
    "lobster-context": {
      "type": "local",
      "command": ["bun", "run", "./lobster-mcp/src/index.ts"]
    }
  }
}
```

---

## 📁 Architecture

```
lobster/
├── packages/
│   ├── lobster/              # Core CLI + TUI
│   │   └── src/
│   │       ├── cli/          # CLI commands + TUI (SolidJS)
│   │       ├── tool/         # 40+ built-in tools
│   │       ├── provider/     # LLM provider integrations
│   │       ├── agent/        # Agent system
│   │       ├── plugin/       # Plugin runtime
│   │       ├── session/      # Session management
│   │       ├── lsp/          # Language Server Protocol
│   │       ├── mcp/          # Model Context Protocol
│   │       └── server/       # API server (Hono)
│   ├── plugin/               # Plugin SDK
│   ├── sdk/                  # JS SDK
│   └── script/               # Build scripts
├── .lobster/
│   ├── plugins/              # 5 lifecycle plugins
│   ├── tool/                 # 18 custom tools
│   ├── agent/                # 7 specialized agents
│   ├── skill/                # 7 slash command skills
│   └── memory/               # Persistent storage
└── lobster-mcp/              # Context manager MCP server
```

---

## 📟 CLI Reference

| Command | Description |
|---------|-------------|
| `lobster` | Start interactive TUI |
| `lobster run [message]` | Run with a message |
| `lobster serve` | Start API server |
| `lobster upgrade` | Upgrade to latest |
| `lobster models` | List available models |
| `lobster auth` | Manage authentication |
| `lobster agent` | Manage agents |
| `lobster stats` | Usage statistics |
| `lobster session` | Manage sessions |
| `lobster pr` | Pull request commands |
| `lobster mcp` | MCP server mode |

---

## 🏗️ Built With

[OpenCode](https://github.com/anomalyco/opencode) • [Bun](https://bun.sh) • [SolidJS](https://www.solidjs.com/) • [AI SDK](https://sdk.vercel.ai) • [MCP](https://modelcontextprotocol.io) • [Claude Code](https://github.com/anthropics/claude-code)

---

## 🏆 Bridge Mind Vibeathon

<p align="center">
  <a href="https://www.bridgemind.ai/vibeathon">
    <img src="https://img.shields.io/badge/🏆_Bridge_Mind_Vibeathon-Feb_1--14,_2026-ff6b35?style=for-the-badge&labelColor=1a1a2e" alt="Bridge Mind Vibeathon">
  </a>
</p>

This project was built for the **[Bridge Mind Vibeathon](https://www.bridgemind.ai/vibeathon)** (February 1-14, 2026) — a competitive hackathon focused on building innovative AI-powered tools. LOBSTER demonstrates how AI agents can coordinate as a team to deliver production-quality code through structured planning, multi-agent review loops, and persistent learning.

---

<p align="center">
  <b>MIT License</b> — Built with 🦞 by <a href="https://github.com/HuskySteam">HuskySteam</a>
</p>
