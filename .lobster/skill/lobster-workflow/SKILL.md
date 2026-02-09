---
name: lobster-workflow
description: Use this when starting any LOBSTER workflow -- planning, building, reviewing, testing, or coordinating a team of agents
---

## Use this when

- Starting any development task with LOBSTER
- Planning an implementation with `/plan`
- Coordinating parallel work with `/team`
- Running a quality review loop
- Needing to understand how LOBSTER's features work together

## Overview

LOBSTER is an all-in-one AI development platform that turns your coding assistant into a coordinated development team. It combines smart context, implementation planning, multi-agent coordination, persistent memory, and cost tracking into a unified workflow.

## Workflow Options

### Option A: Quick Build (single agent)

1. Context auto-injects relevant files (automatic)
2. Use the **coder** agent to implement directly
3. Store learnings in memory when done

### Option B: Planned Build (structured)

1. Use `/plan` to create an implementation plan
2. Review steps, dependencies, and risks
3. Work through steps in order, updating status as you go
4. Store learnings in memory when done

### Option C: Team Build (parallel, multi-agent)

1. Use `/plan` to create an implementation plan (optional)
2. Use `/team` to decompose into subtasks and assign agents
3. Work through subtasks with specialized agents (coder, tester, reviewer, architect)
4. Track progress with `team_status`
5. Store learnings in memory when done

### Option D: Review Loop (iterative quality)

1. Use `review_loop` for iterative code-review-test cycles
2. Coder generates code, reviewer reviews, tester tests
3. Fix issues and repeat until PASS

## Full Workflow

### Step 1: Context (automatic)

LOBSTER auto-injects relevant files, tech stack, and recent git activity into every message via `<lobster-auto-context>`. No action needed.

For manual context search:

```
find_relevant "description of what you want to build"
```

### Step 2: Check Memory

Search for relevant past decisions and patterns:

```
memory_search "keywords related to your task"
memory_retrieve category:"architecture"
```

### Step 3: Set Budget (Optional)

```
cost_budget budget_usd:5.00 alert_threshold:0.8
```

### Step 4: Plan (Optional)

```
implementation_plan task:"Build a user authentication system" analyze_depth:"deep"
```

### Step 5: Build

Choose your approach:
- **Solo**: Switch to coder agent and implement
- **Team**: Use `team_coordinate` to assign subtasks across agents
- **Review loop**: Use `review_loop` for iterative quality cycles

### Step 6: Track Progress

```
plan_status          # Check plan progress
team_status          # Check team progress
review_status        # Check review loop progress
```

### Step 7: Store Learnings

```
memory_store category:"pattern" title:"JWT auth pattern" content:"We use..." tags:["jwt", "auth"]
```

### Step 8: Check Costs

```
cost_summary
```

## Agent Reference

| Agent | Purpose | Access |
|-------|---------|--------|
| coder | Full-stack implementation, bug fixes, refactors | Full |
| reviewer | Code quality, security audits, analysis | Read-only |
| tester | Testing, coverage, QA | Full |
| architect | Design, planning, architecture | Read-only |
| team-lead | Task decomposition, coordination | Full |

## Quick checklist

- [ ] Let auto-context provide relevant files (or search manually)
- [ ] Check memory for past patterns and decisions
- [ ] Set budget if tracking costs
- [ ] Choose workflow: quick build, planned build, team build, or review loop
- [ ] Track progress as you work
- [ ] Store new learnings in memory
- [ ] Check cost summary when done
