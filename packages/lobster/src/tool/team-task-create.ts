import z from "zod"
import { Tool } from "./tool"
import { TeamManager } from "../team/manager"

export const TeamTaskCreateTool = Tool.define("taskcreate", {
  description:
    "Create a new task in the team's shared task list. " +
    "Tasks help coordinate work between team members with dependency tracking.",
  parameters: z.object({
    subject: z.string().describe("A brief title for the task"),
    description: z
      .string()
      .describe("A detailed description of what needs to be done"),
    activeForm: z
      .string()
      .describe(
        'Present continuous form shown in spinner when in_progress (e.g., "Running tests")',
      )
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
      permission: "taskcreate",
      patterns: ["*"],
      always: ["*"],
      metadata: { subject: params.subject },
    })

    const task = await TeamManager.createTask({
      teamName,
      subject: params.subject,
      description: params.description,
      activeForm: params.activeForm,
    })

    return {
      title: `Created task #${task.id}: ${task.subject}`,
      output: JSON.stringify(task, null, 2),
      metadata: { task } as Record<string, any>,
    }
  },
})
