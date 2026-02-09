import { Tool } from "./tool"
import DESCRIPTION from "./task.txt"
import z from "zod"
import { Session } from "../session"
import { Bus } from "../bus"
import { MessageV2 } from "../session/message-v2"
import { Identifier } from "../id/id"
import { Agent } from "../agent/agent"
import { SessionPrompt } from "../session/prompt"
import { iife } from "@/util/iife"
import { defer } from "@/util/defer"
import { Config } from "../config/config"
import { PermissionNext } from "@/permission/next"
import { TeamManager } from "../team/manager"
import { Log } from "../util/log"
import { Instance } from "../project/instance"
import { Provider } from "../provider/provider"

const log = Log.create({ service: "tool.task" })

const parameters = z.object({
  description: z.string().describe("A short (3-5 words) description of the task"),
  prompt: z.string().describe("The task for the agent to perform"),
  subagent_type: z.string().describe("The type of specialized agent to use for this task"),
  task_id: z
    .string()
    .describe(
      "This should only be set if you mean to resume a previous task (you can pass a prior task_id and the task will continue the same subagent session as before instead of creating a fresh one)",
    )
    .optional(),
  command: z.string().describe("The command that triggered this task").optional(),
  team_name: z
    .string()
    .describe("Team name to register this agent as a team member. When set, the agent runs in the background (fire-and-forget).")
    .optional(),
  name: z
    .string()
    .describe("Agent name within the team. Required when team_name is set.")
    .optional(),
  model_hint: z
    .string()
    .describe("Optional model to use for this task (e.g., 'anthropic/claude-sonnet-4-5-20250929'). Overrides the agent's default model.")
    .optional(),
})

export const TaskTool = Tool.define("task", async (ctx) => {
  const agents = await Agent.list().then((x) => x.filter((a) => a.mode !== "primary"))

  // Filter agents by permissions if agent provided
  const caller = ctx?.agent
  const accessibleAgents = caller
    ? agents.filter((a) => PermissionNext.evaluate("task", a.name, caller.permission).action !== "deny")
    : agents

  const description = DESCRIPTION.replace(
    "{agents}",
    accessibleAgents
      .map((a) => `- ${a.name}: ${a.description ?? "This subagent should only be called manually by the user."}`)
      .join("\n"),
  )
  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const config = await Config.get()

      // Skip permission check when user explicitly invoked via @ or command subtask
      if (!ctx.extra?.bypassAgentCheck) {
        await ctx.ask({
          permission: "task",
          patterns: [params.subagent_type],
          always: ["*"],
          metadata: {
            description: params.description,
            subagent_type: params.subagent_type,
          },
        })
      }

      const agent = await Agent.get(params.subagent_type)
      if (!agent) throw new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`)

      const hasTaskPermission = agent.permission.some((rule) => rule.permission === "task")

      // Determine team context: either from explicit params or from parent session
      const teamName = params.team_name ?? ctx.extra?.team?.teamName
      const agentName = params.name

      // Build team-specific permissions for team members
      const teamPermissions: PermissionNext.Ruleset = teamName
        ? [
            {
              permission: "taskcreate",
              pattern: "*",
              action: "allow" as const,
            },
            {
              permission: "taskupdate",
              pattern: "*",
              action: "allow" as const,
            },
            {
              permission: "taskget",
              pattern: "*",
              action: "allow" as const,
            },
            {
              permission: "tasklist",
              pattern: "*",
              action: "allow" as const,
            },
            {
              permission: "sendmessage",
              pattern: "*",
              action: "allow" as const,
            },
            {
              permission: "teamcreate",
              pattern: "*",
              action: "deny" as const,
            },
            {
              permission: "teamdelete",
              pattern: "*",
              action: "deny" as const,
            },
          ]
        : []

      const teamContext = teamName && agentName
        ? { teamName, agentName }
        : undefined

      const session = await iife(async () => {
        if (params.task_id) {
          const found = await Session.get(params.task_id).catch(() => {})
          if (found) return found
        }

        return await Session.createNext({
          parentID: ctx.sessionID,
          directory: Instance.directory,
          title: params.description + ` (@${agent.name} subagent)`,
          permission: [
            {
              permission: "todowrite",
              pattern: "*",
              action: "deny",
            },
            {
              permission: "todoread",
              pattern: "*",
              action: "deny",
            },
            ...(hasTaskPermission
              ? []
              : [
                  {
                    permission: "task" as const,
                    pattern: "*" as const,
                    action: "deny" as const,
                  },
                ]),
            ...(config.experimental?.primary_tools?.map((t) => ({
              pattern: "*",
              action: "allow" as const,
              permission: t,
            })) ?? []),
            ...teamPermissions,
          ],
          team: teamContext,
        })
      })
      const msg = await MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID })
      if (msg.info.role !== "assistant") throw new Error("Not an assistant message")

      const model = params.model_hint
        ? Provider.parseModel(params.model_hint)
        : agent.model ?? {
            modelID: msg.info.modelID,
            providerID: msg.info.providerID,
          }

      ctx.metadata({
        title: params.description,
        metadata: {
          sessionId: session.id,
          model,
        },
      })

      // Background execution path: fire-and-forget when team_name is set
      if (teamName && agentName) {
        // Validate agent name before creating session to avoid orphaned sessions
        if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(agentName)) {
          throw new Error(
            `Invalid agent name: "${agentName}". Must be 1-63 lowercase alphanumeric characters or hyphens, starting with alphanumeric.`,
          )
        }
        const team = await TeamManager.get(teamName)
        if (!team) {
          throw new Error(`Team "${teamName}" does not exist.`)
        }

        // Register as "starting" initially; transition to "active" once prompt begins
        await TeamManager.addMember({
          teamName,
          name: agentName,
          agentId: session.id,
          agentType: params.subagent_type,
        })
        await TeamManager.setMemberStatus(teamName, agentName, "starting")

        let promptParts: Awaited<ReturnType<typeof SessionPrompt.resolvePromptParts>>
        try {
          promptParts = await SessionPrompt.resolvePromptParts(params.prompt)
        } catch (err) {
          // Roll back member registration on failure
          await TeamManager.removeMember(teamName, agentName)
          throw err
        }
        const messageID = Identifier.ascending("message")

        // Transition to active now that prompt is about to start
        await TeamManager.setMemberStatus(teamName, agentName, "active")

        // Fire-and-forget: start prompt in background with configurable timeout
        const maxLifetimeMs = (config.experimental?.team_agent_timeout_minutes ?? 30) * 60 * 1000
        const timeoutController = new AbortController()
        const timeoutId = setTimeout(() => {
          log.warn("team agent exceeded max lifetime, terminating", {
            teamName,
            agentName,
            maxLifetimeMs,
          })
          SessionPrompt.cancel(session.id)
          timeoutController.abort()
        }, maxLifetimeMs)

        SessionPrompt.prompt({
          messageID,
          sessionID: session.id,
          model: {
            modelID: model.modelID,
            providerID: model.providerID,
          },
          agent: agent.name,
          tools: {
            todowrite: false,
            todoread: false,
            ...(hasTaskPermission ? {} : { task: false }),
            ...Object.fromEntries((config.experimental?.primary_tools ?? []).map((t) => [t, false])),
          },
          parts: promptParts,
        })
          .then(() => {
            clearTimeout(timeoutId)
            TeamManager.setMemberStatus(teamName, agentName, "idle").catch(() => {})
            log.info("team agent completed", { teamName, agentName, sessionId: session.id })
          })
          .catch((err) => {
            clearTimeout(timeoutId)
            log.error("team agent failed", { teamName, agentName, error: err })
            TeamManager.setMemberStatus(teamName, agentName, "idle").catch(() => {})
          })

        return {
          title: `Spawned team member "${agentName}" in "${teamName}"`,
          metadata: {
            sessionId: session.id,
            model,
            teamName,
            agentName,
          } as Record<string, any>,
          output: [
            `Team member "${agentName}" spawned in team "${teamName}"`,
            `Session ID: ${session.id}`,
            `Agent type: ${params.subagent_type}`,
            `The agent is now running in the background.`,
          ].join("\n"),
        }
      }

      // Synchronous execution path (original behavior)
      const messageID = Identifier.ascending("message")
      const parts: Record<string, { id: string; tool: string; state: { status: string; title?: string } }> = {}
      const unsub = Bus.subscribe(MessageV2.Event.PartUpdated, async (evt) => {
        if (evt.properties.part.sessionID !== session.id) return
        if (evt.properties.part.messageID === messageID) return
        if (evt.properties.part.type !== "tool") return
        const part = evt.properties.part
        parts[part.id] = {
          id: part.id,
          tool: part.tool,
          state: {
            status: part.state.status,
            title: part.state.status === "completed" ? part.state.title : undefined,
          },
        }
        ctx.metadata({
          title: params.description,
          metadata: {
            sessionId: session.id,
            model,
          },
        })
      })

      function cancel() {
        SessionPrompt.cancel(session.id)
      }
      ctx.abort.addEventListener("abort", cancel)
      using _ = defer(() => ctx.abort.removeEventListener("abort", cancel))
      const promptParts = await SessionPrompt.resolvePromptParts(params.prompt)

      const result = await SessionPrompt.prompt({
        messageID,
        sessionID: session.id,
        model: {
          modelID: model.modelID,
          providerID: model.providerID,
        },
        agent: agent.name,
        tools: {
          todowrite: false,
          todoread: false,
          ...(hasTaskPermission ? {} : { task: false }),
          ...Object.fromEntries((config.experimental?.primary_tools ?? []).map((t) => [t, false])),
        },
        parts: promptParts,
      }).finally(() => {
        unsub()
      })

      const messages = await Session.messages({ sessionID: session.id })
      const summary = messages
        .filter((x) => x.info.role === "assistant")
        .flatMap((msg) => msg.parts.filter((x: any) => x.type === "tool") as MessageV2.ToolPart[])
        .map((part) => ({
          id: part.id,
          tool: part.tool,
          state: {
            status: part.state.status,
            title: part.state.status === "completed" ? part.state.title : undefined,
          },
        }))
      const text = result.parts.findLast((x) => x.type === "text")?.text ?? ""

      const output = [
        `task_id: ${session.id} (for resuming to continue this task if needed)`,
        "",
        "<task_result>",
        text,
        "</task_result>",
      ].join("\n")

      return {
        title: params.description,
        metadata: {
          summary,
          sessionId: session.id,
          model,
        } as Record<string, any>,
        output,
      }
    },
  }
})
