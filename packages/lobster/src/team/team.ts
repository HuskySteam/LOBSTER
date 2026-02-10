import z from "zod"
import { BusEvent } from "@/bus/bus-event"

export namespace Team {
  export const MemberStatus = z.enum(["starting", "active", "idle", "shutdown"])
  export type MemberStatus = z.infer<typeof MemberStatus>

  export const Member = z.object({
    name: z.string(),
    agentId: z.string(),
    agentType: z.string(),
    status: MemberStatus,
  })
  export type Member = z.infer<typeof Member>

  export const Config = z.object({
    agentTimeoutMinutes: z.number().positive().default(30),
  }).default({ agentTimeoutMinutes: 30 })
  export type Config = z.infer<typeof Config>

  export const Info = z.object({
    name: z.string(),
    members: z.array(Member),
    leadSessionID: z.string(),
    config: Config,
    time: z.object({
      created: z.number(),
      updated: z.number(),
    }),
  })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Created: BusEvent.define(
      "team.created",
      z.object({
        info: Info,
      }),
    ),
    Updated: BusEvent.define(
      "team.updated",
      z.object({
        info: Info,
      }),
    ),
    Deleted: BusEvent.define(
      "team.deleted",
      z.object({
        teamName: z.string(),
      }),
    ),
    MemberJoined: BusEvent.define(
      "team.member.joined",
      z.object({
        teamName: z.string(),
        member: Member,
      }),
    ),
    MemberStatusChanged: BusEvent.define(
      "team.member.status",
      z.object({
        teamName: z.string(),
        memberName: z.string(),
        status: MemberStatus,
      }),
    ),
    MemberStalled: BusEvent.define(
      "team.member.stalled",
      z.object({
        teamName: z.string(),
        memberName: z.string(),
        staleSinceMs: z.number(),
      }),
    ),
  }
}
