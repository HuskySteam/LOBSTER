import { Plugin } from "@lobster-ai/plugin"
import path from "path"
import { mkdir } from "node:fs/promises"

function validatePluginPath(basePath: string, filePath: string): void {
  const resolved = path.resolve(filePath)
  const allowed = path.resolve(basePath, ".lobster")
  if (!resolved.startsWith(allowed + path.sep) && resolved !== allowed) {
    throw new Error(`Plugin path validation failed: ${filePath} is outside .lobster directory`)
  }
}

// Cost estimation uses flat per-token rates since tool hooks only expose
// tool names (e.g. "read", "bash"), not the underlying model. These rates
// are a middle-ground approximation across common models.
const DEFAULT_INPUT_RATE = 5.0   // $ per 1M tokens
const DEFAULT_OUTPUT_RATE = 10.0 // $ per 1M tokens

interface ModelUsage {
  input_tokens: number
  output_tokens: number
  calls: number
}

interface SessionData {
  started_at: string
  tools: Record<string, ModelUsage>
}

interface CostData {
  sessions: Record<string, SessionData>
}

interface BudgetConfig {
  budget_usd: number
  alert_threshold: number
  set_at: string
}

function estimateTokensFromContent(content: string): number {
  return Math.ceil(content.length / 4)
}

function calculateTotalCost(data: CostData): number {
  const sessionIds = Object.keys(data.sessions)
  let total = 0
  for (const sid of sessionIds) {
    const session = data.sessions[sid]
    const toolNames = Object.keys(session.tools)
    for (const name of toolNames) {
      const usage = session.tools[name]
      total += (usage.input_tokens / 1_000_000) * DEFAULT_INPUT_RATE
      total += (usage.output_tokens / 1_000_000) * DEFAULT_OUTPUT_RATE
    }
  }
  return total
}

const plugin: Plugin = async (input) => {
  return {
    "tool.execute.after": async (inp, output) => {
      const memoryDir = path.join(input.directory, ".lobster", "memory")
      await mkdir(memoryDir, { recursive: true })

      const costPath = path.join(memoryDir, "cost-tracking.json")
      validatePluginPath(input.directory, costPath)
      const costFile = Bun.file(costPath)
      const costExists = await costFile.exists()
      const data: CostData = costExists
        ? await costFile.json().catch(() => ({ sessions: {} }))
        : { sessions: {} }

      const sessionId = inp.sessionID || "default"
      const toolName = inp.tool || "unknown"

      if (!data.sessions[sessionId]) {
        data.sessions[sessionId] = {
          started_at: new Date().toISOString(),
          tools: {},
        }
      }

      const session = data.sessions[sessionId]
      if (!session.tools[toolName]) {
        session.tools[toolName] = {
          input_tokens: 0,
          output_tokens: 0,
          calls: 0,
        }
      }

      const usage = session.tools[toolName]
      const outputEstimate = output.output ? estimateTokensFromContent(output.output) : 0

      usage.output_tokens += outputEstimate
      usage.calls += 1

      validatePluginPath(input.directory, costPath)
      await Bun.write(costPath, JSON.stringify(data, null, 2))
    },

    "experimental.chat.system.transform": async (_inp, output) => {
      const budgetPath = path.join(input.directory, ".lobster", "memory", "cost-budget.json")
      validatePluginPath(input.directory, budgetPath)
      const budgetFile = Bun.file(budgetPath)
      const budgetExists = await budgetFile.exists()

      if (!budgetExists) {
        return
      }

      const budget: BudgetConfig = await budgetFile.json().catch(() => null) as BudgetConfig
      if (!budget) {
        return
      }

      const costPath = path.join(input.directory, ".lobster", "memory", "cost-tracking.json")
      validatePluginPath(input.directory, costPath)
      const costFile = Bun.file(costPath)
      const costExists = await costFile.exists()

      if (!costExists) {
        return
      }

      const costData: CostData = await costFile.json().catch(() => null) as CostData
      if (!costData) {
        return
      }

      const totalSpend = calculateTotalCost(costData)
      const alertAmount = budget.budget_usd * budget.alert_threshold

      if (totalSpend < alertAmount) {
        return
      }

      const remaining = budget.budget_usd - totalSpend
      const exceeded = totalSpend >= budget.budget_usd

      const block = [
        "<lobster-cost-alert>",
        exceeded
          ? `BUDGET EXCEEDED! Spent $${totalSpend.toFixed(4)} of $${budget.budget_usd.toFixed(2)} budget.`
          : `Budget alert: Spent $${totalSpend.toFixed(4)} of $${budget.budget_usd.toFixed(2)} budget (${(budget.alert_threshold * 100).toFixed(0)}% threshold reached).`,
        `Remaining: $${remaining.toFixed(4)}`,
        exceeded
          ? "Consider stopping or switching to a cheaper model."
          : "Be mindful of token usage to stay within budget.",
        "</lobster-cost-alert>",
      ]

      output.system.push(block.join("\n"))
    },
  }
}

export default plugin
