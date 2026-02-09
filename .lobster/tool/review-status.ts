/// <reference path="../env.d.ts" />
import { tool } from "@lobster-ai/plugin"
import description from "./review-status.txt"
import path from "path"

export default tool({
  description,
  args: {
    session_id: tool.schema
      .string()
      .optional()
      .describe("Optional session ID (reserved for future use)"),
  },
  async execute(args, context) {
    const statePath = path.join(
      context.directory,
      ".lobster",
      "memory",
      "review-loop-state.json"
    )

    const state = await Bun.file(statePath)
      .json()
      .catch(() => null)

    if (!state) {
      return "No active review loop. Use `review_loop` to start one."
    }

    const lines = [
      "## Review Loop Status",
      "",
      `**Task:** ${state.task}`,
      `**Phase:** ${state.current_phase}`,
      `**Iteration:** ${state.iteration} / ${state.max_iterations}`,
      `**Started:** ${state.started_at}`,
      `**Updated:** ${state.updated_at}`,
    ]

    if (state.completed_at) {
      lines.push(`**Completed:** ${state.completed_at}`)
    }

    if (state.history && state.history.length > 0) {
      lines.push("", "### Verdict History")
      for (const entry of state.history) {
        lines.push(
          "",
          `**Iteration ${entry.iteration}:** ${entry.verdict}`
        )
        if (entry.issues && entry.issues.length > 0) {
          for (const issue of entry.issues) {
            lines.push(`  - ${issue}`)
          }
        }
      }
    }

    if (state.history && state.history.length === 0) {
      lines.push("", "No verdicts recorded yet.")
    }

    return lines.join("\n")
  },
})
