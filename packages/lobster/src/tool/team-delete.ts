import z from "zod"
import { Tool } from "./tool"
import { TeamManager } from "../team/manager"

export const TeamDeleteTool = Tool.define("teamdelete", {
  description:
    "Remove a team and all its task and message data. " +
    "Only use this after all teammates have shut down gracefully.",
  parameters: z.object({
    team_name: z
      .string()
      .describe("Name of the team to delete")
      .optional(),
  }),
  async execute(params, ctx) {
    const teamName =
      params.team_name ?? ctx.extra?.team?.teamName
    if (!teamName) {
      return {
        title: "No team specified",
        output: "Error: No team_name provided and no team context available.",
        metadata: {} as Record<string, any>,
      }
    }

    await ctx.ask({
      permission: "teamdelete",
      patterns: [teamName],
      always: ["*"],
      metadata: { team_name: teamName },
    })

    const team = await TeamManager.get(teamName)
    if (!team) {
      return {
        title: `Team "${teamName}" not found`,
        output: `Error: Team "${teamName}" does not exist.`,
        metadata: {} as Record<string, any>,
      }
    }

    const active = team.members.filter((m) => m.status !== "shutdown")
    if (active.length > 0) {
      return {
        title: `Team has active members`,
        output:
          `Error: Team "${teamName}" still has ${active.length} active member(s): ` +
          `${active.map((m) => m.name).join(", ")}. ` +
          `Send shutdown requests and wait for all members to shut down before deleting.`,
        metadata: { activeMembers: active.map((m) => m.name) } as Record<string, any>,
      }
    }

    await TeamManager.remove(teamName)

    return {
      title: `Deleted team "${teamName}"`,
      output: `Team "${teamName}" and all associated tasks and messages have been removed.`,
      metadata: { teamName } as Record<string, any>,
    }
  },
})
