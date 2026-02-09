/// <reference path="../env.d.ts" />
import { tool } from "@lobster-ai/plugin"
import DESCRIPTION from "./team-coordinate.txt"
import path from "path"
import { mkdir } from "node:fs/promises"
import { Subtask, TeamSession, detectFileConflicts } from "./team-shared"

interface SubtaskInput {
  title: string
  description: string
  files: string[]
  priority: "high" | "medium" | "low"
  depends_on: number[]
  agent?: string
}

const AGENT_CAPABILITIES: Record<string, string[]> = {
  coder: ["implement", "build", "create", "fix", "add", "write", "code", "develop", "feature", "refactor"],
  tester: ["test", "spec", "coverage", "assert", "verify", "validate", "qa", "check"],
  reviewer: ["review", "audit", "security", "inspect", "quality", "lint", "analyze"],
  architect: ["design", "plan", "architecture", "structure", "diagram", "model", "schema"],
}

function autoAssignAgent(title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase()
  let bestAgent = "coder"
  let bestScore = 0

  for (const [agent, keywords] of Object.entries(AGENT_CAPABILITIES)) {
    let score = 0
    for (const kw of keywords) {
      if (text.includes(kw)) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestAgent = agent
    }
  }

  return bestAgent
}

export default tool({
  description: DESCRIPTION,
  args: {
    task: tool.schema.string().describe("Overall task description"),
    subtasks: tool.schema.array(
      tool.schema.object({
        title: tool.schema.string().describe("Subtask title"),
        description: tool.schema.string().describe("What needs to be done"),
        files: tool.schema.array(tool.schema.string()).default([]).describe("Files this subtask will touch"),
        priority: tool.schema.enum(["high", "medium", "low"]).default("medium").describe("Priority level"),
        depends_on: tool.schema.array(tool.schema.number()).default([]).describe("IDs of subtasks this depends on (1-based)"),
        agent: tool.schema.string().optional().describe("Override agent assignment (coder/tester/reviewer/architect)"),
      })
    ).describe("List of subtasks"),
    plan_id: tool.schema.string().optional().describe("Optional link to an implementation plan ID"),
  },
  async execute(args, context) {
    if (args.subtasks.length === 0) {
      return "At least one subtask is required."
    }

    const timestamp = Date.now()
    const suffix = Math.random().toString(36).substring(2, 5)
    const sessionId = `team-${timestamp}-${suffix}`
    const now = new Date().toISOString()

    // Build subtasks with auto-assignment
    const subtasks: Subtask[] = args.subtasks.map((st: SubtaskInput, idx: number) => {
      const agent = st.agent || autoAssignAgent(st.title, st.description)
      const hasDeps = st.depends_on.length > 0
      const status = hasDeps ? "blocked" as const : "assigned" as const

      return {
        id: idx + 1,
        title: st.title,
        description: st.description,
        assigned_to: agent,
        status,
        depends_on: st.depends_on,
        priority: st.priority || "medium",
        files_affected: st.files || [],
      }
    })

    // Validate depends_on references
    const validIds = new Set(subtasks.map((s) => s.id))
    const invalidDeps: string[] = []
    for (const st of subtasks) {
      for (const dep of st.depends_on) {
        if (!validIds.has(dep)) {
          invalidDeps.push(`Subtask #${st.id} depends on non-existent #${dep}`)
        }
      }
    }
    if (invalidDeps.length > 0) {
      return `Invalid dependencies:\n${invalidDeps.join("\n")}`
    }

    // Check for dependency cycles
    function hasCycle(subtasks: Subtask[]): number[] | null {
      const visited = new Set<number>()
      const inStack = new Set<number>()

      function dfs(id: number, path: number[]): number[] | null {
        if (inStack.has(id)) return [...path, id]
        if (visited.has(id)) return null
        visited.add(id)
        inStack.add(id)
        const st = subtasks.find((s) => s.id === id)
        if (st) {
          for (const dep of st.depends_on) {
            const cycle = dfs(dep, [...path, id])
            if (cycle) return cycle
          }
        }
        inStack.delete(id)
        return null
      }

      for (const st of subtasks) {
        const cycle = dfs(st.id, [])
        if (cycle) return cycle
      }
      return null
    }

    const cycle = hasCycle(subtasks)
    if (cycle) {
      return `Dependency cycle detected: ${cycle.join(" → ")}`
    }

    // Detect file conflicts
    const conflicts = detectFileConflicts(subtasks)

    const session: TeamSession = {
      id: sessionId,
      task: args.task,
      created_at: now,
      updated_at: now,
      status: "active",
      subtasks,
      plan_id: args.plan_id,
    }

    // Save session
    const teamDir = path.join(context.directory, ".lobster", "memory", "team")
    await mkdir(teamDir, { recursive: true })

    const sessionPath = path.join(teamDir, `${sessionId}.json`)
    await Bun.write(sessionPath, JSON.stringify(session, null, 2))

    const latestPath = path.join(teamDir, "latest.json")
    await Bun.write(latestPath, JSON.stringify({ id: sessionId, path: sessionPath }, null, 2))

    // Format output
    const lines: string[] = [
      `## Team Session Created: ${sessionId}`,
      "",
      `**Task:** ${args.task}`,
      `**Subtasks:** ${subtasks.length}`,
      args.plan_id ? `**Linked Plan:** ${args.plan_id}` : "",
      "",
      "### Assignment Table",
      "",
      "| # | Title | Agent | Priority | Status | Dependencies |",
      "|---|-------|-------|----------|--------|-------------|",
    ]

    for (const st of subtasks) {
      const depsStr = st.depends_on.length > 0 ? st.depends_on.join(", ") : "none"
      lines.push(`| ${st.id} | ${st.title} | ${st.assigned_to} | ${st.priority} | ${st.status} | ${depsStr} |`)
    }

    if (conflicts.length > 0) {
      lines.push("")
      lines.push("### File Conflicts")
      lines.push("")
      for (const c of conflicts) {
        lines.push(`- **${c.file}** is touched by subtasks: ${c.subtasks.join(", ")}`)
      }
      lines.push("")
      lines.push("*Coordinate these subtasks carefully to avoid merge conflicts.*")
    }

    // Ready queue
    const ready = subtasks.filter((st) => st.status === "assigned")
    if (ready.length > 0) {
      lines.push("")
      lines.push("### Ready to Start")
      lines.push("")
      for (const st of ready) {
        lines.push(`- **#${st.id} ${st.title}** → ${st.assigned_to}`)
      }
    }

    lines.push("")
    lines.push("### Execution Protocol")
    lines.push("")
    lines.push("1. Start with subtasks that have no dependencies (shown in Ready to Start)")
    lines.push("2. Use `team_complete` to mark each subtask done when finished")
    lines.push("3. Use `team_status` to check progress and see newly unblocked subtasks")
    lines.push("4. Use `team_assign` if you need to reassign a subtask to a different agent")
    lines.push("5. Handle file conflicts by coordinating the order of conflicting subtasks")

    return lines.filter((l) => l !== "").join("\n")
  },
})
