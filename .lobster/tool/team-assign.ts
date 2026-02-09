/// <reference path="../env.d.ts" />
import { tool } from "@lobster-ai/plugin"
import DESCRIPTION from "./team-assign.txt"
import path from "path"
import { TeamSession, loadSession } from "./team-shared"

export default tool({
  description: DESCRIPTION,
  args: {
    subtask_id: tool.schema.number().describe("The subtask ID to reassign"),
    agent: tool.schema.enum(["coder", "tester", "reviewer", "architect"]).describe("New agent to assign"),
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
      return `Subtask #${args.subtask_id} is already completed and cannot be reassigned.`
    }

    const oldAgent = subtask.assigned_to
    subtask.assigned_to = args.agent
    session.updated_at = new Date().toISOString()

    await Bun.write(sessionPath, JSON.stringify(session, null, 2))

    return `Subtask #${args.subtask_id} "${subtask.title}" reassigned from **${oldAgent}** to **${args.agent}**.`
  },
})
