import z from "zod"
import { Tool } from "./tool"
import { TeamManager } from "../team/manager"
import { TeamMessage } from "../team/message"
import { ulid } from "ulid"

export const TeamSendMessageTool = Tool.define("sendmessage", {
  description:
    "Send messages to agent teammates. Supports DMs (message), broadcasts, " +
    "shutdown requests, and shutdown responses. " +
    "Use type 'message' for direct messages to a specific teammate. " +
    "Use type 'broadcast' sparingly - it sends to ALL teammates. " +
    "Use type 'shutdown_request' to ask a teammate to shut down. " +
    "Use type 'shutdown_response' to respond to a shutdown request.",
  parameters: z.object({
    type: z
      .enum(["message", "broadcast", "shutdown_request", "shutdown_response", "plan_approval_response"])
      .describe("Message type"),
    recipient: z
      .string()
      .describe("Agent name of the recipient (required for message and shutdown_request)")
      .optional(),
    content: z
      .string()
      .describe("Message text or reason")
      .optional(),
    summary: z
      .string()
      .describe("A 5-10 word summary of the message (required for message and broadcast)")
      .optional(),
    request_id: z
      .string()
      .describe("Request ID to respond to (required for shutdown_response)")
      .optional(),
    approve: z
      .boolean()
      .describe("Whether to approve the request (required for shutdown_response)")
      .optional(),
  }),
  async execute(params, ctx) {
    const teamName = ctx.team?.teamName ?? ctx.extra?.team?.teamName
    const agentName = ctx.team?.agentName ?? ctx.extra?.team?.agentName
    if (!teamName || !agentName) {
      return {
        title: "No team context",
        output:
          "Error: No team context available. This tool can only be used within a team session.",
        metadata: {} as Record<string, any>,
      }
    }

    await ctx.ask({
      permission: "sendmessage",
      patterns: [params.type],
      always: ["*"],
      metadata: { type: params.type },
    })

    const id = ulid()
    const content = params.content ?? ""
    const time = Date.now()

    switch (params.type) {
      case "message": {
        if (!params.recipient) {
          return {
            title: "Missing recipient",
            output: "Error: recipient is required for direct messages.",
            metadata: {} as Record<string, any>,
          }
        }
        const msg: TeamMessage.DirectMessage = {
          id,
          type: "message",
          teamName,
          sender: agentName,
          recipient: params.recipient,
          content,
          summary: params.summary,
          time,
        }
        await TeamManager.sendMessage(msg)
        return {
          title: `Sent DM to ${params.recipient}`,
          output: `Message sent to ${params.recipient}: ${params.summary ?? content.slice(0, 50)}`,
          metadata: { messageId: id } as Record<string, any>,
        }
      }

      case "broadcast": {
        const msg: TeamMessage.Broadcast = {
          id,
          type: "broadcast",
          teamName,
          sender: agentName,
          content,
          summary: params.summary,
          time,
        }
        await TeamManager.sendMessage(msg)
        const members = await TeamManager.getMembers(teamName)
        const recipients = members.filter((m) => m.name !== agentName).length
        return {
          title: `Broadcast to ${recipients} teammates`,
          output: `Message broadcast to ${recipients} teammates: ${params.summary ?? content.slice(0, 50)}`,
          metadata: { messageId: id, recipients } as Record<string, any>,
        }
      }

      case "shutdown_request": {
        if (!params.recipient) {
          return {
            title: "Missing recipient",
            output: "Error: recipient is required for shutdown requests.",
            metadata: {} as Record<string, any>,
          }
        }
        const requestId = ulid()
        const msg: TeamMessage.ShutdownRequest = {
          id,
          type: "shutdown_request",
          teamName,
          sender: agentName,
          recipient: params.recipient,
          content,
          requestId,
          time,
        }
        await TeamManager.sendMessage(msg)
        return {
          title: `Shutdown request sent to ${params.recipient}`,
          output: `Shutdown request sent to ${params.recipient} (requestId: ${requestId})`,
          metadata: { messageId: id, requestId } as Record<string, any>,
        }
      }

      case "shutdown_response": {
        if (params.request_id === undefined) {
          return {
            title: "Missing request_id",
            output: "Error: request_id is required for shutdown responses.",
            metadata: {} as Record<string, any>,
          }
        }
        if (params.approve === undefined) {
          return {
            title: "Missing approve",
            output: "Error: approve is required for shutdown responses.",
            metadata: {} as Record<string, any>,
          }
        }
        const msg: TeamMessage.ShutdownResponse = {
          id,
          type: "shutdown_response",
          teamName,
          sender: agentName,
          content,
          requestId: params.request_id,
          approve: params.approve,
          time,
        }
        await TeamManager.sendMessage(msg)

        if (params.approve) {
          await TeamManager.setMemberStatus(teamName, agentName, "shutdown")
        }

        return {
          title: params.approve
            ? "Shutdown approved"
            : "Shutdown rejected",
          output: params.approve
            ? `Shutdown approved. Agent "${agentName}" is shutting down.`
            : `Shutdown rejected: ${content}`,
          metadata: { messageId: id, approve: params.approve } as Record<string, any>,
        }
      }

      case "plan_approval_response": {
        if (!params.recipient) {
          return {
            title: "Missing recipient",
            output: "Error: recipient is required for plan approval responses.",
            metadata: {} as Record<string, any>,
          }
        }
        if (params.request_id === undefined) {
          return {
            title: "Missing request_id",
            output: "Error: request_id is required for plan approval responses.",
            metadata: {} as Record<string, any>,
          }
        }
        if (params.approve === undefined) {
          return {
            title: "Missing approve",
            output: "Error: approve is required for plan approval responses.",
            metadata: {} as Record<string, any>,
          }
        }
        const msg: TeamMessage.DirectMessage = {
          id,
          type: "message",
          teamName,
          sender: agentName,
          recipient: params.recipient,
          content: params.approve
            ? `[Plan approved] ${content}`
            : `[Plan rejected] ${content}`,
          summary: params.approve ? "Plan approved" : "Plan rejected",
          time,
        }
        await TeamManager.sendMessage(msg)
        return {
          title: params.approve
            ? `Plan approved for ${params.recipient}`
            : `Plan rejected for ${params.recipient}`,
          output: params.approve
            ? `Plan approval sent to ${params.recipient}.`
            : `Plan rejection sent to ${params.recipient}: ${content}`,
          metadata: { messageId: id, approve: params.approve } as Record<string, any>,
        }
      }

      default: {
        const _exhaustive: never = params.type
        return {
          title: "Unknown message type",
          output: `Error: Unknown message type "${params.type}".`,
          metadata: {} as Record<string, any>,
        }
      }
    }
  },
})
