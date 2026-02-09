/// <reference path="../env.d.ts" />
import { tool } from "@lobster-ai/plugin"
import DESCRIPTION from "./cost-budget.txt"
import path from "path"
import { mkdir } from "node:fs/promises"

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

interface BudgetConfig {
  budget_usd: number
  alert_threshold: number
  set_at: string
}

function calculateTotalCost(data: CostData): number {
  const sessionIds = Object.keys(data.sessions)
  let total = 0
  for (const sid of sessionIds) {
    const session = data.sessions[sid]
    const modelNames = Object.keys(session.models)
    for (const model of modelNames) {
      const usage = session.models[model]
      const pricing = PRICING[model]
      if (!pricing) {
        continue
      }
      total += (usage.input_tokens / 1_000_000) * pricing.input
      total += (usage.output_tokens / 1_000_000) * pricing.output
    }
  }
  return total
}

export default tool({
  description: DESCRIPTION,
  args: {
    budget_usd: tool.schema.number().describe("Budget limit in USD"),
    alert_threshold: tool.schema.number().default(0.8).describe("Fraction of budget at which to alert (0.0-1.0)"),
  },
  async execute(args, context) {
    const memoryDir = path.join(context.directory, ".lobster", "memory")
    await mkdir(memoryDir, { recursive: true })

    const budgetPath = path.join(memoryDir, "cost-budget.json")
    const config: BudgetConfig = {
      budget_usd: args.budget_usd,
      alert_threshold: args.alert_threshold,
      set_at: new Date().toISOString(),
    }
    await Bun.write(budgetPath, JSON.stringify(config, null, 2))

    const costPath = path.join(memoryDir, "cost-tracking.json")
    const costFile = Bun.file(costPath)
    const costExists = await costFile.exists()
    const currentSpend = costExists ? calculateTotalCost(await costFile.json()) : 0
    const remaining = args.budget_usd - currentSpend
    const alertAmount = args.budget_usd * args.alert_threshold
    const thresholdReached = currentSpend >= alertAmount

    const lines: string[] = [
      "## Budget Configuration Saved",
      "",
      `Budget:          $${args.budget_usd.toFixed(2)}`,
      `Alert threshold: ${(args.alert_threshold * 100).toFixed(0)}% ($${alertAmount.toFixed(2)})`,
      `Current spend:   $${currentSpend.toFixed(4)}`,
      `Remaining:       $${remaining.toFixed(4)}`,
      "",
    ]

    if (currentSpend >= args.budget_usd) {
      lines.push("WARNING: Current spending has EXCEEDED the budget!")
    } else if (thresholdReached) {
      lines.push("ALERT: Current spending has reached the alert threshold.")
    } else {
      lines.push("Status: Within budget.")
    }

    return lines.join("\n")
  },
})
