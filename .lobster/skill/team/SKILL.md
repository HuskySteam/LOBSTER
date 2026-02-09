---
name: team
description: Use this when you need to coordinate multiple agents working on a complex task in parallel, or check team session status
---

## Use this when

- A task is complex enough to benefit from multiple specialized agents
- You want to parallelize work across coder, tester, reviewer, and architect agents
- Checking progress on an active team coordination session
- Coordinating subtask dependencies and file conflict resolution

## Quick Start

### 1. Create a Team Session

Use the `team_coordinate` tool to decompose a task:

```
team_coordinate task:"Build user authentication with JWT" subtasks:[
  { title: "Define auth types", description: "TypeScript interfaces for auth", files: ["src/types/auth.ts"], priority: "high", depends_on: [] },
  { title: "Implement auth service", description: "JWT sign/verify logic", files: ["src/auth/service.ts"], priority: "high", depends_on: [1] },
  { title: "Write auth tests", description: "Unit tests", files: ["src/auth/service.test.ts"], priority: "medium", depends_on: [2] },
  { title: "Security review", description: "Review auth implementation", files: ["src/auth/service.ts"], priority: "medium", depends_on: [2] }
]
```

### 2. Check Status

```
team_status
```

Shows progress bar, per-agent breakdown, ready queue, and file conflicts.

### 3. Work Through Subtasks

Work through subtasks in dependency order. Use the appropriate agent for each:
- Switch to **coder** agent for implementation subtasks
- Switch to **tester** agent for test writing
- Switch to **reviewer** agent for code review
- Switch to **architect** agent for design decisions

### 4. Mark Subtasks Complete

```
team_complete subtask_id:1 summary:"Created auth interfaces with User, Token, Session types" files_changed:["src/types/auth.ts"]
```

### 5. Reassign if Needed

```
team_assign subtask_id:3 agent:"coder"
```

## Agent Capabilities

| Agent | Best For | Access |
|-------|----------|--------|
| coder | Implementing features, fixing bugs, refactoring | Full |
| tester | Writing tests, coverage analysis | Full |
| reviewer | Code review, security audit | Read-only |
| architect | Design planning, architecture | Read-only |

## Integration with Plans

Link a team session to an implementation plan:

```
team_coordinate task:"..." subtasks:[...] plan_id:"plan-1234567890-abc"
```

## Tips

- Use the `team-lead` agent to automatically decompose complex tasks
- Subtask dependencies are 1-based IDs matching their position in the subtask array
- File conflicts are automatically detected and displayed in status
- The `<lobster-team>` context block auto-appears in the system prompt when a session is active
- All sessions are saved in `.lobster/memory/team/` for persistence
