import z from "zod"
import { Tool } from "./tool"
import { TeamManager } from "../team/manager"

export const TeamTaskUpdateTool = Tool.define("taskupdate", {
  description:
    "Update a task in the team's shared task list. " +
    "Use this to change status, assign owners, add dependencies, or update details. " +
    "When a task is marked completed, dependent tasks are automatically unblocked.",
  parameters: z.object({
    taskId: z.string().describe("The ID of the task to update"),
    status: z
      .enum(["pending", "in_progress", "completed", "deleted"])
      .describe("New status for the task")
      .optional(),
    owner: z
      .string()
      .describe("New owner for the task (agent name)")
      .optional(),
    subject: z
      .string()
      .describe("New subject for the task")
      .optional(),
    description: z
      .string()
      .describe("New description for the task")
      .optional(),
    activeForm: z
      .string()
      .describe(
        'Present continuous form shown in spinner when in_progress (e.g., "Running tests")',
      )
      .optional(),
    metadata: z
      .record(z.string(), z.any())
      .describe(
        "Metadata keys to merge into the task. Set a key to null to delete it.",
      )
      .optional(),
    addBlocks: z
      .array(z.string())
      .describe("Task IDs that this task blocks (cannot start until this one completes)")
      .optional(),
    addBlockedBy: z
      .array(z.string())
      .describe("Task IDs that must complete before this one can start")
      .optional(),
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
      permission: "taskupdate",
      patterns: [params.taskId],
      always: ["*"],
      metadata: { taskId: params.taskId },
    })

    const existing = await TeamManager.getTask(teamName, params.taskId)
    if (!existing) {
      return {
        title: `Task #${params.taskId} not found`,
        output: `Error: Task "${params.taskId}" does not exist in team "${teamName}".`,
        metadata: {} as Record<string, any>,
      }
    }

    const task = await TeamManager.updateTask(teamName, params.taskId, {
      status: params.status,
      owner: params.owner,
      subject: params.subject,
      description: params.description,
      activeForm: params.activeForm,
      metadata: params.metadata,
      addBlocks: params.addBlocks,
      addBlockedBy: params.addBlockedBy,
    })

    return {
      title: `Updated task #${task.id}`,
      output: JSON.stringify(task, null, 2),
      metadata: { task } as Record<string, any>,
    }
  },
})
