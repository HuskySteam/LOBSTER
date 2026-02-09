import z from "zod"
import { BusEvent } from "@/bus/bus-event"

export namespace TeamTask {
  export const Status = z.enum(["pending", "in_progress", "completed", "deleted"])
  export type Status = z.infer<typeof Status>

  export const Info = z.object({
    id: z.string(),
    teamName: z.string(),
    subject: z.string(),
    description: z.string(),
    activeForm: z.string().optional(),
    status: Status,
    owner: z.string().optional(),
    blocks: z.array(z.string()).default([]),
    blockedBy: z.array(z.string()).default([]),
    metadata: z.record(z.string(), z.any()).default({}),
    time: z.object({
      created: z.number(),
      updated: z.number(),
    }),
  })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Created: BusEvent.define(
      "team.task.created",
      z.object({
        task: Info,
      }),
    ),
    Updated: BusEvent.define(
      "team.task.updated",
      z.object({
        task: Info,
      }),
    ),
    Unblocked: BusEvent.define(
      "team.task.unblocked",
      z.object({
        teamName: z.string(),
        taskId: z.string(),
        unblockedBy: z.string(),
      }),
    ),
  }
}
