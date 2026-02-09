<div align="center">

<br>

<img src="https://img.shields.io/badge/%F0%9F%A6%9E-LOBSTER-ff3e3e?style=for-the-badge&labelColor=0d1117&fontSize=40" height="45" alt="LOBSTER">

<br><br>

# Stop coding alone. Deploy a team.

<h4>

An AI-powered coding agent that runs a full dev team in your terminal —<br>
architect, coder, reviewer, tester — coordinated, access-controlled, and relentless.

</h4>

<br>

[![Version](https://img.shields.io/github/v/tag/HuskySteam/LOBSTER?label=version&style=for-the-badge&color=ff3e3e&labelColor=0d1117)](https://github.com/HuskySteam/LOBSTER/releases)
&nbsp;
[![Stars](https://img.shields.io/github/stars/HuskySteam/LOBSTER?style=for-the-badge&color=f4c542&labelColor=0d1117)](https://github.com/HuskySteam/LOBSTER/stargazers)
&nbsp;
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge&labelColor=0d1117)](LICENSE)
&nbsp;
[![Platform](https://img.shields.io/badge/Win%20%7C%20Mac%20%7C%20Linux-brightgreen?style=for-the-badge&labelColor=0d1117&label=runs%20on)](https://github.com/HuskySteam/LOBSTER/releases)

<br>

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/HuskySteam/LOBSTER/main/install.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/HuskySteam/LOBSTER/main/install.ps1 | iex
```

<br>

[**Get Started**](#-get-started) &nbsp;&nbsp;|&nbsp;&nbsp; [**How It Works**](#-how-it-works) &nbsp;&nbsp;|&nbsp;&nbsp; [**Features**](#-features) &nbsp;&nbsp;|&nbsp;&nbsp; [**Providers**](#-20-llm-providers) &nbsp;&nbsp;|&nbsp;&nbsp; [**Extend**](#-extend-everything)

<br>

</div>

---

<br>

## What makes LOBSTER different?

<table>
<tr>
<td width="50%">

### Other AI tools

```
You  →  Single Agent  →  Output

- One model, one shot
- You review everything
- You write the tests
- You catch the bugs
- You are the team
```

</td>
<td width="50%">

### LOBSTER

```
You  →  Team Lead  →  Agents  →  Output
             │
     ┌───────┼───────┐
     ▼       ▼       ▼
  Architect Coder  Reviewer
             │       │
             └──fix──┘
                 │
              Tester ✓
```

</td>
</tr>
</table>

<br>

> **One prompt. Four agents. Zero babysitting.**
>
> Reviewer and Architect agents literally cannot write files — they only have read-only tools. No agent reviews its own code. This is enforced, not suggested.

<br>

---

<br>

## 🚀 Get Started

```bash
lobster
```

That's it. You're in the TUI. Start talking.

<details>
<summary><b>Install from source</b></summary>

```bash
git clone https://github.com/HuskySteam/LOBSTER.git && cd lobster
bun install    # requires Bun >= 1.3.5
bun dev
```

</details>

<details>
<summary><b>Upgrade</b></summary>

```bash
lobster upgrade
```

</details>

<details>
<summary><b>Run as API server</b></summary>

```bash
lobster serve              # default port 4096
lobster serve --port 8080  # custom port
```

</details>

<br>

---

<br>

## 🧠 How It Works

You give LOBSTER a task. It doesn't just start coding.

```
You: "Build a user authentication system with JWT, rate limiting, and tests"
```

```
┌─ Decomposition ─────────────────────────────────────────────────┐
│                                                                  │
│  #1  Define auth types & interfaces      → architect    [R/O]   │
│  #2  Implement JWT auth service          → coder        [R/W]   │
│  #3  Add rate limiting middleware        → coder        [R/W]   │
│  #4  Security review                    → reviewer      [R/O]   │
│  #5  Write unit + integration tests     → tester        [R/W]   │
│                                                                  │
│  Dependencies: #2,#3 wait for #1  ·  #4,#5 wait for #2,#3      │
│  Conflicts: none                                                 │
└──────────────────────────────────────────────────────────────────┘

  ✓ #1 Define auth types & interfaces      architect    done   2s
  ✓ #2 Implement JWT auth service          coder        done   8s
  ✓ #3 Add rate limiting middleware        coder        done   5s
  ⚠ #4 Security review                    reviewer     found: missing input validation
  ✓    Coder fixes validation              coder        done   4s
  ✓ #4 Security review (pass 2)           reviewer     done   3s
  ✓ #5 Write unit + integration tests     tester       done   6s

  All agents pass. 5 files created, 12 tests passing.
```

The review loop **keeps going** until the reviewer and tester are satisfied. No human in the loop unless you want to be.

<br>

---

<br>

## ⚡ Features

<table>
<tr>
<td width="33%">

### 40+ Tools

`read` `write` `edit` `multiedit`
`glob` `grep` `ls` `bash`
`codesearch` `websearch` `webfetch`
`task` `batch` `plan` `todo` `lsp`

File ops, search, execution,
planning, and code intelligence
— all built in.

</td>
<td width="33%">

### Persistent Memory

Your AI remembers across sessions.
Architecture decisions, patterns,
mistakes — stored and auto-loaded.

```
Session 1: "Use bcrypt"  → saved
Session 2: Uses bcrypt automatically
```

</td>
<td width="33%">

### Cost Control

Track every token. Set budgets.
Get warnings before you overspend.

```
/cost       # breakdown
/budget $5  # set limit
```

Alerts at 80%. Per-model tracking.

</td>
</tr>
</table>

<table>
<tr>
<td width="33%">

### Claude Code Plugins

Drop-in compatible with the
Claude Code plugin ecosystem.

```
/plugin install feature-dev
/plugin marketplace add org/repo
```

</td>
<td width="33%">

### Pattern Detection

Analyzes review history.
Groups recurring issues.
Detects quality trends.
Injects warnings proactively.

</td>
<td width="33%">

### Three Interfaces

**TUI** — `lobster`
**CLI** — `lobster run "msg"`
**API** — `lobster serve`

Interactive, scriptable,
or programmatic.

</td>
</tr>
</table>

<br>

---

<br>

## 🌐 20+ LLM Providers

Use any model you want. Switch with one config change.

<table>
<tr>
<td><b>Anthropic</b><br><code>Claude 4.5 / 4.6</code></td>
<td><b>OpenAI</b><br><code>GPT-4o · o1 · o3</code></td>
<td><b>Google</b><br><code>Gemini</code></td>
<td><b>AWS Bedrock</b><br><code>Claude via AWS</code></td>
</tr>
<tr>
<td><b>Azure OpenAI</b><br><code>GPT via Azure</code></td>
<td><b>Groq</b><br><code>Fast inference</code></td>
<td><b>Mistral</b><br><code>Open models</code></td>
<td><b>xAI · OpenRouter · Together AI · Cohere</b></td>
</tr>
</table>

Powered by [Vercel AI SDK v5](https://sdk.vercel.ai). Add your own provider with a few lines of config.

<br>

---

<br>

## 🔌 Extend Everything

Drop files into `.lobster/` and they just work:

```
.lobster/
├── plugins/     Lifecycle hooks — run code before/after any tool
├── tool/        Custom tools — *.ts with Zod schemas + *.txt descriptions
├── agent/       Custom agents — Markdown files with permission rules
├── skill/       Slash commands — /your-command triggers a template
├── command/     Command aliases — shorthand for anything
└── memory/      Persistent storage — survives across sessions
```

<br>

---

<br>

## ⚙️ Configuration

```jsonc
// lobster.jsonc
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

<br>

---

<br>

## 📟 Commands

```
lobster                    Interactive TUI
lobster run "do something" One-shot CLI
lobster serve              API server (port 4096)
lobster upgrade            Update to latest version
lobster models             List available models
lobster auth               Manage API keys
lobster agent              Manage agents
lobster stats              Token & cost stats
lobster pr                 Pull request tools
lobster mcp                Run as MCP server
```

<br>

---

<br>

<div align="center">

### Architecture

</div>

```
packages/
├── lobster/        Core — CLI, TUI (SolidJS), 40+ tools, providers, sessions, agents
├── plugin/         Plugin SDK — @lobster-ai/plugin
├── sdk/            Client SDK — @lobster-ai/sdk (auto-generated from OpenAPI)
├── script/         Build & release tooling
├── util/           Shared utilities
└── slack/          Slack integration
```

<div align="center">

Built on [OpenCode](https://github.com/anomalyco/opencode) · [Bun](https://bun.sh) · [SolidJS](https://www.solidjs.com) · [Vercel AI SDK](https://sdk.vercel.ai) · [MCP](https://modelcontextprotocol.io)

<br>

---

<br>

<a href="https://www.bridgemind.ai/vibeathon">
<img src="https://img.shields.io/badge/%F0%9F%8F%86_Bridge_Mind_Vibeathon-Feb_1--14,_2026-ff6b35?style=for-the-badge&labelColor=0d1117" alt="Bridge Mind Vibeathon">
</a>

<br><br>

**MIT License** · Made by [HuskySteam](https://github.com/HuskySteam)

<br>

</div>
