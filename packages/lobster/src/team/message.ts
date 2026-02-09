import z from "zod"
import { BusEvent } from "@/bus/bus-event"

export namespace TeamMessage {
  const Base = z.object({
    id: z.string(),
    teamName: z.string(),
    sender: z.string(),
    content: z.string(),
    time: z.number(),
  })

  export const DirectMessage = Base.extend({
    type: z.literal("message"),
    recipient: z.string(),
    summary: z.string().optional(),
  })
  export type DirectMessage = z.infer<typeof DirectMessage>

  export const Broadcast = Base.extend({
    type: z.literal("broadcast"),
    summary: z.string().optional(),
  })
  export type Broadcast = z.infer<typeof Broadcast>

  export const ShutdownRequest = Base.extend({
    type: z.literal("shutdown_request"),
    recipient: z.string(),
    requestId: z.string(),
  })
  export type ShutdownRequest = z.infer<typeof ShutdownRequest>

  export const ShutdownResponse = Base.extend({
    type: z.literal("shutdown_response"),
    requestId: z.string(),
    approve: z.boolean(),
  })
  export type ShutdownResponse = z.infer<typeof ShutdownResponse>

  export const Info = z.discriminatedUnion("type", [
    DirectMessage,
    Broadcast,
    ShutdownRequest,
    ShutdownResponse,
  ])
  export type Info = z.infer<typeof Info>

  export const Event = {
    Sent: BusEvent.define(
      "team.message.sent",
      z.object({
        message: Info,
      }),
    ),
    Delivered: BusEvent.define(
      "team.message.delivered",
      z.object({
        teamName: z.string(),
        recipientName: z.string(),
        messageId: z.string(),
      }),
    ),
  }
}
