import z from "zod"
import { Tool } from "./tool"
import { TeamManager } from "../team/manager"

export const TeamTaskGetTool = Tool.define("taskget", {
  description:
    "Retrieve full details of a specific task from the team's shared task list. " +
    "Use this to read the complete description and context before starting work on a task.",
  parameters: z.object({
    taskId: z.string().describe("The ID of the task to retrieve"),
  }),
  async execute(params, ctx) {
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
      permission: "taskget",
      patterns: [params.taskId],
      always: ["*"],
      metadata: { taskId: params.taskId },
    })

    const task = await TeamManager.getTask(teamName, params.taskId)
    if (!task) {
      return {
        title: `Task #${params.taskId} not found`,
        output: `Error: Task "${params.taskId}" does not exist in team "${teamName}".`,
        metadata: {} as Record<string, any>,
      }
    }

    return {
      title: `Task #${task.id}: ${task.subject}`,
      output: JSON.stringify(task, null, 2),
      metadata: { task } as Record<string, any>,
    }
  },
})
