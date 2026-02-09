/// <reference path="../env.d.ts" />
import { tool } from "@lobster-ai/plugin"
import DESCRIPTION from "./team-complete.txt"
import path from "path"
import { Subtask, TeamSession, loadSession } from "./team-shared"

export default tool({
  description: DESCRIPTION,
  args: {
    subtask_id: tool.schema.number().describe("The subtask ID to mark as completed"),
    summary: tool.schema.string().describe("Summary of what was done"),
    files_changed: tool.schema.array(tool.schema.string()).optional().describe("List of files that were changed"),
    issues_found: tool.schema.array(tool.schema.string()).optional().describe("Any issues found during the work"),
    verdict: tool.schema.string().optional().describe("Overall verdict (e.g., 'pass', 'needs_revision')"),
    session_id: tool.schema.string().optional().describe("Team session ID (default: latest)"),
  },
  async execute(args, context) {
    const teamDir = path.join(context.directory, ".lobster", "memory", "team")

    const result = await loadSession(teamDir, args.session_id)
    if ("error" in result) return result.error
    const { session, sessionPath } = result
    const subtask = session.subtasks.find((s) => s.id === args.subtask_id)

    if (!subtask) {
      return `Subtask #${args.subtask_id} not found in session ${session.id}.`
    }

    if (subtask.status === "completed") {
      return `Subtask #${args.subtask_id} is already completed.`
    }

    // Mark completed
    subtask.status = "completed"
    subtask.completed_at = new Date().toISOString()
    subtask.result = {
      summary: args.summary,
      files_changed: args.files_changed || [],
      issues_found: args.issues_found,
      verdict: args.verdict,
    }

    // Check for newly unblocked subtasks
    const completedIds = new Set(
      session.subtasks.filter((s) => s.status === "completed").map((s) => s.id)
    )
    const unblocked: Subtask[] = []

    for (const st of session.subtasks) {
      if (st.status !== "blocked") continue
      if (st.depends_on.every((dep) => completedIds.has(dep))) {
        st.status = "assigned"
        unblocked.push(st)
      }
    }

    // Check if all subtasks are done
    const allDone = session.subtasks.every(
      (s) => s.status === "completed" || s.status === "failed"
    )
    if (allDone) {
      session.status = "completed"
    }

    session.updated_at = new Date().toISOString()
    await Bun.write(sessionPath, JSON.stringify(session, null, 2))

    // Format output
    const total = session.subtasks.length
    const completed = session.subtasks.filter((s) => s.status === "completed").length
    const progressPct = Math.round((completed / total) * 100)
    const barLen = 20
    const filledLen = Math.round((progressPct / 100) * barLen)
    const progressBar = "█".repeat(filledLen) + "░".repeat(barLen - filledLen)

    const lines: string[] = [
      `## Subtask #${args.subtask_id} Completed`,
      "",
      `**Title:** ${subtask.title}`,
      `**Agent:** ${subtask.assigned_to}`,
      `**Summary:** ${args.summary}`,
    ]

    if (args.files_changed && args.files_changed.length > 0) {
      lines.push(`**Files changed:** ${args.files_changed.join(", ")}`)
    }

    if (args.issues_found && args.issues_found.length > 0) {
      lines.push(`**Issues found:** ${args.issues_found.join(", ")}`)
    }

    if (args.verdict) {
      lines.push(`**Verdict:** ${args.verdict}`)
    }

    lines.push("")
    lines.push(`**Progress:** ${progressBar} ${progressPct}% (${completed}/${total})`)

    if (unblocked.length > 0) {
      lines.push("")
      lines.push("### Newly Unblocked")
      for (const st of unblocked) {
        lines.push(`- **#${st.id} ${st.title}** → ${st.assigned_to} [${st.priority}]`)
      }
    }

    if (allDone) {
      lines.push("")
      lines.push("### Session Complete!")
      lines.push("All subtasks have been completed. The team session is now marked as completed.")
    }

    return lines.join("\n")
  },
})
