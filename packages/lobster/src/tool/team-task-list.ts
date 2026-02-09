import z from "zod"
import { Tool } from "./tool"
import { TeamManager } from "../team/manager"

export const TeamTaskListTool = Tool.define("tasklist", {
  description:
    "List all tasks in the team's shared task list. " +
    "Returns a summary of each task including id, subject, status, owner, and blockedBy. " +
    "Use this to find available work, check progress, or identify blocked tasks.",
  parameters: z.object({}),
  async execute(_params, ctx) {
    const teamName = ctx.team?.teamName ?? ctx.extra?.team?.teamName
    if (!teamName) {
      return {
        title: "No team context",
        output:
          "Error: No team context available. This tool can only be used within a team session.",
        metadata: {} as Record<string, any>,
      }
    }

    await ctx.ask({
      permission: "tasklist",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })

    const tasks = await TeamManager.listTasks(teamName)

    const summary = tasks.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      owner: t.owner ?? "",
      blockedBy: t.blockedBy.filter((id) => {
        const blocker = tasks.find((task) => task.id === id)
        return blocker && blocker.status !== "completed"
      }),
    }))

    const pending = tasks.filter((t) => t.status === "pending").length
    const inProgress = tasks.filter((t) => t.status === "in_progress").length
    const completed = tasks.filter((t) => t.status === "completed").length

    return {
      title: `${tasks.length} tasks (${pending} pending, ${inProgress} active, ${completed} done)`,
      output: JSON.stringify(summary, null, 2),
      metadata: { tasks: summary, counts: { pending, inProgress, completed } } as Record<string, any>,
    }
  },
})
