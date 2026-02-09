---
name: plan
description: Use this when you need to create an implementation plan for a complex task, or check the status of an existing plan
---

## Use this when

- Starting a complex coding task that involves multiple files
- You want to break down a task into ordered steps before coding
- Checking progress on an existing implementation plan
- Deciding what to work on next in a multi-step task

## Creating a Plan

Use the `implementation_plan` tool:

```
implementation_plan task:"Build a user authentication system with JWT tokens and refresh flow" analyze_depth:"deep"
```

This will:
1. Scan the codebase for relevant files
2. Analyze complexity and dependencies
3. Generate ordered steps (types → config → implementation → tests)
4. Identify risks (complex files, high fan-in, missing tests)
5. Save the plan to `.lobster/memory/plans/`

## Checking Plan Status

Use the `plan_status` tool:

```
plan_status
```

This shows a visual progress tracker with `[DONE]`, `[WORK]`, `[    ]` indicators.

## Updating Progress

Mark steps as you work through them:

```
plan_status update_step:1 step_status:"in_progress"
plan_status update_step:1 step_status:"completed"
```

Update overall plan status:

```
plan_status plan_status:"in_progress"
plan_status plan_status:"completed"
```

## Workflow

1. `/plan` → Create implementation plan
2. Review the steps and risks
3. Start working on step 1
4. Update step status as you go
5. Check `plan_status` between steps
6. Mark plan as completed when done

## Tips

- Use `analyze_depth:"deep"` for complex tasks to get accurate complexity ratings
- Use `analyze_depth:"shallow"` for quick overviews
- Steps are ordered by dependency: types first, then implementation, then tests
- Watch for high-severity risks before starting implementation
- Plans integrate with the team coordination system via `plan_id`
