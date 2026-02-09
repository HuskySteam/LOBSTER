import z from "zod"
import { Tool } from "./tool"
import { TeamManager } from "../team/manager"

export const TeamCreateTool = Tool.define("teamcreate", {
  description:
    "Create a new team to coordinate multiple agents working on a project. " +
    "Teams have shared task lists and enable inter-agent messaging. " +
    "Use this when you need multiple agents to collaborate on a complex task.",
  parameters: z.object({
    team_name: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "Must be 1-63 lowercase alphanumeric characters or hyphens, starting with alphanumeric")
      .describe("Name for the new team (lowercase, alphanumeric with hyphens)"),
    description: z
      .string()
      .describe("Brief description of the team's purpose")
      .optional(),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "teamcreate",
      patterns: [params.team_name],
      always: ["*"],
      metadata: { team_name: params.team_name },
    })

    const existing = await TeamManager.get(params.team_name)
    if (existing) {
      return {
        title: `Team "${params.team_name}" already exists`,
        output: JSON.stringify(existing, null, 2),
        metadata: { team: existing } as Record<string, any>,
      }
    }

    const team = await TeamManager.create({
      name: params.team_name,
      leadSessionID: ctx.sessionID,
    })

    return {
      title: `Created team "${params.team_name}"`,
      output: JSON.stringify(team, null, 2),
      metadata: { team } as Record<string, any>,
    }
  },
})
