<div align="center">

```
        ██╗      ██████╗ ██████╗ ███████╗████████╗███████╗██████╗
        ██║     ██╔═══██╗██╔══██╗██╔════╝╚══██╔══╝██╔════╝██╔══██╗
        ██║     ██║   ██║██████╔╝███████╗   ██║   █████╗  ██████╔╝
        ██║     ██║   ██║██╔══██╗╚════██║   ██║   ██╔══╝  ██╔══██╗
        ███████╗╚██████╔╝██████╔╝███████║   ██║   ███████╗██║  ██║
        ╚══════╝ ╚═════╝ ╚═════╝ ╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
```

**Your AI development team, not just another coding assistant.**

[![Version](https://img.shields.io/badge/v1.4.3-ff3e3e?style=flat-square&label=LOBSTER)](https://github.com/HuskySteam/LOBSTER/releases)
[![License](https://img.shields.io/badge/MIT-blue?style=flat-square&label=License)](LICENSE)
[![Platform](https://img.shields.io/badge/Windows%20%7C%20macOS%20%7C%20Linux-brightgreen?style=flat-square&label=Platform)](#-install)
[![Bun](https://img.shields.io/badge/Bun-f472b6?style=flat-square&label=Runtime)](https://bun.sh)

[Install](#-install) · [Why LOBSTER](#-why-lobster) · [Features](#-features) · [Providers](#-providers) · [Plugins](#-plugins) · [Config](#%EF%B8%8F-configuration)

</div>

---

## The Problem

Most AI coding tools give you **one agent**. You prompt it, it writes code, you hope for the best. No review. No tests. No safety net. You become the QA team.

## The Solution

LOBSTER gives you a **coordinated AI dev team** — agents that plan, build, review, and test your code together, with enforced access controls so no agent can review its own work.

```
You: "Add JWT authentication with rate limiting and tests"

LOBSTER:
  ✓ Architect designs the interface              2s
  ✓ Coder implements JWT auth service            8s
  ✓ Coder adds rate limiting middleware          5s
  ✓ Reviewer catches missing input validation    3s
  ✓ Coder fixes validation                      4s
  ✓ Tester writes & runs 12 tests               6s
  ✓ All agents pass — done
```

---

## 📥 Install

**macOS / Linux**
```bash
curl -fsSL https://raw.githubusercontent.com/HuskySteam/LOBSTER/main/install.sh | bash
```

**Windows (PowerShell)**
```powershell
irm https://raw.githubusercontent.com/HuskySteam/LOBSTER/main/install.ps1 | iex
```

**Then run**
```
lobster
```

<details>
<summary>Other methods</summary>

**From source** (requires [Bun](https://bun.sh) >= 1.3.5):
```bash
git clone https://github.com/HuskySteam/LOBSTER.git && cd lobster
bun install && bun dev
```

**Upgrade an existing install:**
```bash
lobster upgrade
```

</details>

---

## 🦞 Why LOBSTER

### Multi-Agent Architecture

```
                         ┌──────────────────┐
                         │    TEAM LEAD      │
                         │ Decompose·Assign  │
                         └──┬───┬───┬───┬───┘
                            │   │   │   │
                     ┌──────┘   │   │   └──────┐
                     ▼          ▼   ▼          ▼
                ┌─────────┐ ┌──────┐ ┌──────┐ ┌──────────┐
                │  CODER  │ │REVIEW│ │TESTER│ │ARCHITECT │
                │  R/W    │ │ R/O  │ │ R/W  │ │   R/O    │
                └─────────┘ └──────┘ └──────┘ └──────────┘
```

**Access control is enforced at the tool level.** Reviewer and Architect agents cannot write files — they only get read-only tools. This prevents an agent from rubber-stamping its own code.

### How a Task Runs

| Step | What Happens |
|:-----|:------------|
| **Decompose** | Your prompt is split into subtasks with dependency graph |
| **Validate** | Cycle detection, file conflict warnings, blocking resolution |
| **Execute** | Agents work in dependency order with enforced access levels |
| **Review** | Coder → Reviewer → Tester → fix → repeat until all pass |

---

## 🔧 Features

### 40+ Built-in Tools

| Category | Tools |
|:---------|:------|
| **Files** | `read` `write` `edit` `multiedit` `glob` `ls` |
| **Search** | `grep` `codesearch` `websearch` `webfetch` |
| **Execute** | `bash` `task` `batch` |
| **Plan** | `plan` `todo` |
| **Code Intel** | `lsp` — go-to-def, find refs, diagnostics |

### Claude Code Plugin Compatibility

Drop-in compatible with the Claude Code plugin ecosystem:

```
/plugin install feature-dev
/plugin marketplace add owner/repo
/plugin list
```

### Persistent Memory

Architecture decisions, patterns, past mistakes — stored and auto-loaded across sessions.

```
Session 1:  "We use bcrypt, deployment doesn't support argon2"  → saved
Session 2:  "Build password reset endpoint"  → uses bcrypt automatically
```

### Cost Tracking

```
/cost                    # Per-model cost breakdown
/budget $5               # Set spending limit
```

Tracks every token, estimates cost per model, warns at 80% budget.

### Three Interfaces

| Interface | Command | Use Case |
|:----------|:--------|:---------|
| **TUI** | `lobster` | Interactive terminal UI |
| **CLI** | `lobster run "message"` | Scripting & automation |
| **API** | `lobster serve` | Programmatic access (port 4096) |

---

## 🌐 Providers

20+ LLM providers via [Vercel AI SDK](https://sdk.vercel.ai):

| Provider | Models |
|:---------|:-------|
| **Anthropic** | Claude 4.5 / 4.6 |
| **OpenAI** | GPT-4o, o1, o3 |
| **Google** | Gemini |
| **AWS Bedrock** | Claude via AWS |
| **Azure OpenAI** | GPT via Azure |
| **+ more** | Groq, Mistral, xAI, OpenRouter, Together AI, Cohere |

---

## 🔌 Plugins

Extend LOBSTER through `.lobster/` in your project:

```
.lobster/
├── plugins/     # Hook into agent lifecycle
├── tool/        # Custom tools (*.ts + *.txt)
├── agent/       # Specialized agents (*.md)
├── skill/       # Slash command skills
├── command/     # Custom slash commands
└── memory/      # Persistent storage
```

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
    "file://.lobster/plugins/lobster-cost-tracker.ts"
  ],
  "mcp": {
    "context": {
      "type": "local",
      "command": ["bun", "run", "./lobster-mcp/src/index.ts"]
    }
  }
}
```

---

## 📟 CLI

| Command | Description |
|:--------|:-----------|
| `lobster` | Interactive TUI |
| `lobster run [msg]` | Run with a message |
| `lobster serve` | API server |
| `lobster upgrade` | Upgrade to latest |
| `lobster models` | List models |
| `lobster auth` | Manage auth |
| `lobster agent` | Manage agents |
| `lobster stats` | Usage stats |
| `lobster pr` | Pull request tools |
| `lobster mcp` | MCP server mode |

---

## 📁 Project Structure

```
packages/
├── lobster/      Core CLI + TUI + tools + providers
├── plugin/       Plugin SDK (@lobster-ai/plugin)
├── sdk/          JS client SDK (@lobster-ai/sdk)
├── script/       Build & release scripts
├── util/         Shared utilities
└── slack/        Slack integration
```

Built on [OpenCode](https://github.com/anomalyco/opencode) · [Bun](https://bun.sh) · [SolidJS](https://www.solidjs.com) · [AI SDK](https://sdk.vercel.ai) · [MCP](https://modelcontextprotocol.io)

---

<div align="center">

**[Bridge Mind Vibeathon](https://www.bridgemind.ai/vibeathon)** — February 1–14, 2026

MIT License · Built by [HuskySteam](https://github.com/HuskySteam)

</div>
