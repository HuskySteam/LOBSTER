/// <reference path="../env.d.ts" />
import { tool } from "@lobster-ai/plugin"
import DESCRIPTION from "./team-status.txt"
import path from "path"
import { Subtask, TeamSession, detectFileConflicts, loadSession } from "./team-shared"

function statusIcon(status: string): string {
  switch (status) {
    case "completed": return "✅"
    case "in_progress": return "🔄"
    case "assigned": return "📋"
    case "blocked": return "🚫"
    case "failed": return "❌"
    default: return "⬜"
  }
}

export default tool({
  description: DESCRIPTION,
  args: {
    session_id: tool.schema.string().optional().describe("Team session ID (default: latest)"),
  },
  async execute(args, context) {
    const teamDir = path.join(context.directory, ".lobster", "memory", "team")

    const result = await loadSession(teamDir, args.session_id)
    if ("error" in result) return result.error
    const { session } = result
    const subtasks = session.subtasks

    // Calculate progress
    const total = subtasks.length
    const completed = subtasks.filter((s) => s.status === "completed").length
    const inProgress = subtasks.filter((s) => s.status === "in_progress").length
    const assigned = subtasks.filter((s) => s.status === "assigned").length
    const blocked = subtasks.filter((s) => s.status === "blocked").length
    const failed = subtasks.filter((s) => s.status === "failed").length

    const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0
    const barLen = 20
    const filledLen = Math.round((progressPct / 100) * barLen)
    const progressBar = "█".repeat(filledLen) + "░".repeat(barLen - filledLen)

    const lines: string[] = [
      `## Team Session: ${session.id}`,
      "",
      `**Task:** ${session.task}`,
      `**Status:** ${session.status}`,
      session.plan_id ? `**Linked Plan:** ${session.plan_id}` : "",
      `**Progress:** ${progressBar} ${progressPct}% (${completed}/${total})`,
      "",
      "### Subtasks",
      "",
    ]

    // Group by agent
    const byAgent: Record<string, Subtask[]> = {}
    for (const st of subtasks) {
      if (!byAgent[st.assigned_to]) byAgent[st.assigned_to] = []
      byAgent[st.assigned_to].push(st)
    }

    for (const [agent, tasks] of Object.entries(byAgent)) {
      lines.push(`**${agent}:**`)
      for (const st of tasks) {
        const depsStr = st.depends_on.length > 0 ? ` (after: ${st.depends_on.join(", ")})` : ""
        lines.push(`  ${statusIcon(st.status)} #${st.id} ${st.title} [${st.priority}]${depsStr}`)
        if (st.result) {
          lines.push(`     → ${st.result.summary}`)
          if (st.result.issues_found && st.result.issues_found.length > 0) {
            lines.push(`     Issues: ${st.result.issues_found.join(", ")}`)
          }
        }
      }
      lines.push("")
    }

    // File conflicts
    const conflicts = detectFileConflicts(subtasks)
    if (conflicts.length > 0) {
      lines.push("### File Conflicts")
      lines.push("")
      for (const c of conflicts) {
        const allDone = c.subtasks.every((id) => {
          const st = subtasks.find((s) => s.id === id)
          return st?.status === "completed"
        })
        const marker = allDone ? "✅" : "⚠️"
        lines.push(`${marker} **${c.file}** → subtasks ${c.subtasks.join(", ")}`)
      }
      lines.push("")
    }

    // Ready queue
    const completedIds = new Set(subtasks.filter((s) => s.status === "completed").map((s) => s.id))
    const ready = subtasks.filter((st) => {
      if (st.status === "completed" || st.status === "in_progress" || st.status === "failed") return false
      return st.depends_on.every((dep) => completedIds.has(dep))
    })

    if (ready.length > 0) {
      lines.push("### Ready to Start")
      lines.push("")
      for (const st of ready) {
        lines.push(`- **#${st.id} ${st.title}** → ${st.assigned_to} [${st.priority}]`)
      }
      lines.push("")
    }

    // Summary
    lines.push("### Summary")
    lines.push(`Completed: ${completed} | In Progress: ${inProgress} | Assigned: ${assigned} | Blocked: ${blocked} | Failed: ${failed}`)

    return lines.filter((l) => l !== "").join("\n")
  },
})
