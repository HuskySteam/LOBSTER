/// <reference path="../env.d.ts" />
import { tool } from "@lobster-ai/plugin"
import DESCRIPTION from "./cost.txt"
import path from "path"

const PRICING: Record<string, { input: number, output: number }> = {
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 0.80, output: 4.0 },
  "claude-opus-4-6": { input: 15.0, output: 75.0 },
  "gpt-4o": { input: 2.50, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
}

interface ModelUsage {
  input_tokens: number
  output_tokens: number
  calls: number
}

interface SessionData {
  started_at: string
  models: Record<string, ModelUsage>
}

interface CostData {
  sessions: Record<string, SessionData>
}

function calculateCost(model: string, usage: ModelUsage): number {
  const pricing = PRICING[model]
  if (!pricing) {
    return 0
  }
  const inputCost = (usage.input_tokens / 1_000_000) * pricing.input
  const outputCost = (usage.output_tokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}

export default tool({
  description: DESCRIPTION,
  args: {
    session_id: tool.schema.string().optional().describe("Specific session ID to view, or omit for current session"),
  },
  async execute(args, context) {
    const costPath = path.join(context.directory, ".lobster", "memory", "cost-tracking.json")
    const costFile = Bun.file(costPath)
    const exists = await costFile.exists()

    if (!exists) {
      return "No cost data recorded yet. Cost tracking data will appear here as tools are used."
    }

    const data: CostData = await costFile.json()
    const sessionIds = Object.keys(data.sessions)

    if (sessionIds.length === 0) {
      return "No cost data recorded yet."
    }

    const targetId = args.session_id || sessionIds.at(-1)
    if (!targetId) {
      return "No sessions found."
    }

    const session = data.sessions[targetId]
    if (!session) {
      return `Session "${targetId}" not found. Available sessions: ${sessionIds.join(", ")}`
    }

    const lines: string[] = [
      `## Cost Summary`,
      `Session: ${targetId}`,
      `Started: ${session.started_at}`,
      "",
      "### Per-Model Breakdown",
      "",
    ]

    const modelNames = Object.keys(session.models)
    let totalInput = 0
    let totalOutput = 0
    let totalCost = 0

    for (const model of modelNames) {
      const usage = session.models[model]
      const cost = calculateCost(model, usage)
      totalInput += usage.input_tokens
      totalOutput += usage.output_tokens
      totalCost += cost

      lines.push(`**${model}**`)
      lines.push(`  Input tokens:  ${usage.input_tokens.toLocaleString()}`)
      lines.push(`  Output tokens: ${usage.output_tokens.toLocaleString()}`)
      lines.push(`  Calls:         ${usage.calls}`)
      lines.push(`  Est. cost:     $${cost.toFixed(4)}`)
      lines.push("")
    }

    lines.push("### Totals")
    lines.push(`Total input tokens:  ${totalInput.toLocaleString()}`)
    lines.push(`Total output tokens: ${totalOutput.toLocaleString()}`)
    lines.push(`Total estimated cost: $${totalCost.toFixed(4)}`)

    return lines.join("\n")
  },
})
