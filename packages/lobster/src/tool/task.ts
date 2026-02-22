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
import { Team } from "../team/team"
import { Log } from "../util/log"
import { Instance } from "../project/instance"
import { MemoryManager } from "../memory/manager"

const log = Log.create({ service: "tool.task" })

// Subscribe to MemberStalled event — wrapped in try/catch since Bus may not be
// initialized at import time in test environments
try {
  Bus.subscribe(Team.Event.MemberStalled, (evt) => {
    log.warn("team member stalled", { team: evt.properties.teamName, member: evt.properties.memberName, staleMs: evt.properties.staleSinceMs })
  })
} catch {
  // Bus not initialized in this context — skip subscription
}

const EXPLORE_KEYWORDS = ["find", "search", "look", "where", "locate", "grep", "pattern", "file", "read", "understand", "analyze", "codebase"]
const GENERAL_KEYWORDS = ["implement", "write", "create", "build", "fix", "refactor", "modify", "test", "update", "add", "change", "delete", "remove"]
type TaskToolSummaryPart = {
  id: string
  tool: string
  state: {
    status: string
    title?: string
  }
}

function summarizeRecentToolParts(messages: MessageV2.WithParts[]): TaskToolSummaryPart[] {
  const byID = new Map<string, TaskToolSummaryPart>()
  for (const msg of messages) {
    if (msg.info.role !== "assistant") continue
    for (const part of msg.parts) {
      if (part.type !== "tool") continue
      byID.set(part.id, {
        id: part.id,
        tool: part.tool,
        state: {
          status: part.state.status,
          title: part.state.status === "completed" ? part.state.title : undefined,
        },
      })
    }
  }
  return Array.from(byID.values()).sort((a, b) => (a.id > b.id ? 1 : -1))
}

function routeTask(prompt: string, agents: Agent.Info[]): string {
  const lower = prompt.toLowerCase()
  const scores: Record<string, number> = {}

  for (const agent of agents) {
    if (agent.name === "team-member" || agent.hidden) continue
    scores[agent.name] = 0

    const keywords =
      agent.name === "explore" ? EXPLORE_KEYWORDS
      : agent.name === "general" ? GENERAL_KEYWORDS
      : []

    for (const kw of keywords) {
      if (lower.includes(kw)) scores[agent.name]++
    }

    // Match against agent description (2x weight)
    if (agent.description) {
      const descWords = agent.description.toLowerCase().split(/\s+/)
      for (const word of descWords) {
        if (word.length > 3 && lower.includes(word)) scores[agent.name] += 2
      }
    }
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1])
  if (sorted.length === 0) return "general"

  const [topName, topScore] = sorted[0]
  const secondScore = sorted.length > 1 ? sorted[1][1] : 0

  if (topScore < 3 || topScore - secondScore <= 1) return "general"

  return topName
}

const parameters = z.object({
  description: z.string().describe("A short (3-5 words) description of the task"),
  prompt: z.string().describe("The task for the agent to perform"),
  subagent_type: z.string().describe("The type of specialized agent to use for this task. If omitted, the system auto-selects the best agent.").optional(),
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

      // Auto-route when subagent_type is not provided
      const subagentType = params.subagent_type ?? routeTask(params.prompt, accessibleAgents)

      // Skip permission check when user explicitly invoked via @ or command subtask
      if (!ctx.extra?.bypassAgentCheck) {
        await ctx.ask({
          permission: "task",
          patterns: [subagentType],
          always: ["*"],
          metadata: {
            description: params.description,
            subagent_type: subagentType,
          },
        })
      }

      const agent = await Agent.get(subagentType)
      if (!agent) throw new Error(`Unknown agent type: ${subagentType} is not a valid agent type`)

      const hasTaskPermission = agent.permission.some((rule) => rule.permission === "task")

      // Determine team context: either from explicit params or from parent session
      const teamName = params.team_name ?? ctx.extra?.team?.teamName
      const agentName = params.name

      // Extract team permissions from the team-member agent definition at runtime
      const teamPermissions: PermissionNext.Ruleset = teamName
        ? await Agent.get("team-member").then(
            (tm) => (tm ? Agent.extractTeamPermissions(tm.permission) : []),
          ).catch(() => [])
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

      const model = agent.model ?? {
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

        let promptParts: Awaited<ReturnType<typeof SessionPrompt.resolvePromptParts>>
        promptParts = await SessionPrompt.resolvePromptParts(params.prompt)

        // Inject relevant memories into subagent context
        const asyncMemories = await MemoryManager.relevant(params.prompt).catch(() => [])
        if (asyncMemories.length > 0) {
          const memoryContext = asyncMemories.slice(0, 5).map(m => {
            const content = m.content.length > 400 ? m.content.slice(0, 400) + "..." : m.content
            return `- [${m.category}] ${content}`
          }).join("\n").slice(0, 2000)
          promptParts.unshift({
            type: "text",
            text: `<memory-context>\nRelevant memories:\n${memoryContext}\n</memory-context>`,
          })
        }

        // Register member only after prompt resolution succeeds to avoid orphaned members
        await TeamManager.addMember({
          teamName,
          name: agentName,
          agentId: session.id,
          agentType: subagentType,
        })
        await TeamManager.setMemberStatus(teamName, agentName, "starting")

        // Inject team context so the agent knows its teammates and current tasks
        const members = await TeamManager.getMembers(teamName)
        const tasks = await TeamManager.listTasks(teamName)
        const rosterLines = members
          .filter((m) => m.name !== agentName)
          .map((m) => `- ${m.name} (type: ${m.agentType}, status: ${m.status})`)
        const taskLines = tasks
          .filter((t) => t.status !== "deleted")
          .map((t) => `- #${t.id} [${t.status}] ${t.subject}${t.owner ? ` (owner: ${t.owner})` : ""}`)

        const teamContext = [
          `<team-context>`,
          `Team: ${teamName}`,
          `Your name: ${agentName}`,
          ``,
          `## Teammates`,
          rosterLines.length > 0 ? rosterLines.join("\n") : "(no other members yet)",
          ``,
          `## Current Task List`,
          taskLines.length > 0 ? taskLines.join("\n") : "(no tasks yet)",
          ``,
          `Use sendmessage type:"message" recipient:"<name>" to message any teammate directly.`,
          `Check tasklist to find and claim available work.`,
          `</team-context>`,
        ].join("\n")

        promptParts.push({
          type: "text",
          text: teamContext,
        })

        const messageID = Identifier.ascending("message")

        // Transition to active now that prompt is about to start
        await TeamManager.setMemberStatus(teamName, agentName, "active")

        // Fire-and-forget: start prompt in background with configurable timeout
        const teamTimeout = team?.config?.agentTimeoutMinutes
        const maxLifetimeMs = (teamTimeout ?? config.experimental?.team_agent_timeout_minutes ?? 30) * 60 * 1000
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

        // Health check: periodically verify the agent session is still active
        const healthCheckInterval = setInterval(async () => {
          const member = (await TeamManager.getMembers(teamName)).find(m => m.name === agentName)
          if (!member || member.status === "idle" || member.status === "shutdown") {
            clearInterval(healthCheckInterval)
            return
          }
          const sessionInfo = await Session.get(session.id).catch(() => undefined)
          if (!sessionInfo) {
            clearInterval(healthCheckInterval)
            return
          }
          const lastActivity = sessionInfo.time?.updated ?? sessionInfo.time?.created ?? 0
          const staleMs = Date.now() - lastActivity
          if (staleMs > 5 * 60 * 1000) {
            log.warn("team agent stalled", { teamName, agentName, staleMs })
            Bus.publish(Team.Event.MemberStalled, { teamName, memberName: agentName, staleSinceMs: staleMs })
          }
        }, 5 * 60 * 1000)

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
            clearInterval(healthCheckInterval)
            TeamManager.setMemberStatus(teamName, agentName, "idle").catch(() => {})
            log.info("team agent completed", { teamName, agentName, sessionId: session.id })
          })
          .catch((err) => {
            clearTimeout(timeoutId)
            clearInterval(healthCheckInterval)
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
            `Agent type: ${subagentType}`,
            `The agent is now running in the background.`,
          ].join("\n"),
        }
      }

      // Synchronous execution path (original behavior)
      const messageID = Identifier.ascending("message")
      const parts: Record<string, TaskToolSummaryPart> = {}
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

      // Inject relevant memories into subagent context
      const memories = await MemoryManager.relevant(params.prompt).catch(() => [])
      if (memories.length > 0) {
        const memoryContext = memories.slice(0, 5).map(m => {
          const content = m.content.length > 400 ? m.content.slice(0, 400) + "..." : m.content
          return `- [${m.category}] ${content}`
        }).join("\n").slice(0, 2000)
        promptParts.unshift({
          type: "text",
          text: `<memory-context>\nRelevant memories:\n${memoryContext}\n</memory-context>`,
        })
      }

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

      let summary = Object.values(parts).sort((a, b) => (a.id > b.id ? 1 : -1))
      if (summary.length === 0) {
        const recentMessages = await Session.messages({ sessionID: session.id, limit: 24 }).catch(() => [])
        summary = summarizeRecentToolParts(recentMessages)
      }
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
