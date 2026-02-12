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
  budget_tokens?: number
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

function calculateTotalTokens(data: CostData): number {
  let total = 0
  for (const sid of Object.keys(data.sessions)) {
    const session = data.sessions[sid]
    for (const name of Object.keys(session.tools)) {
      const usage = session.tools[name]
      total += usage.input_tokens + usage.output_tokens
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
      const totalTokens = calculateTotalTokens(costData)
      const usdAlertAmount = budget.budget_usd * budget.alert_threshold
      const usdTriggered = totalSpend >= usdAlertAmount
      const tokenTriggered = budget.budget_tokens != null && totalTokens >= budget.budget_tokens * budget.alert_threshold

      if (!usdTriggered && !tokenTriggered) {
        return
      }

      const lines: string[] = ["<system-reminder>"]

      if (usdTriggered) {
        const remaining = budget.budget_usd - totalSpend
        const exceeded = totalSpend >= budget.budget_usd
        lines.push(
          exceeded
            ? `BUDGET EXCEEDED! Spent $${totalSpend.toFixed(4)} of $${budget.budget_usd.toFixed(2)} budget.`
            : `Budget alert: Spent $${totalSpend.toFixed(4)} of $${budget.budget_usd.toFixed(2)} budget (${(budget.alert_threshold * 100).toFixed(0)}% threshold reached).`,
          `Remaining: $${remaining.toFixed(4)}`,
        )
        if (exceeded) {
          lines.push("Consider stopping or switching to a cheaper model.")
        }
      }

      if (tokenTriggered && budget.budget_tokens != null) {
        const remainingTokens = budget.budget_tokens - totalTokens
        const exceededTokens = totalTokens >= budget.budget_tokens
        lines.push(
          exceededTokens
            ? `TOKEN BUDGET EXCEEDED! Used ${totalTokens.toLocaleString()} of ${budget.budget_tokens.toLocaleString()} token budget.`
            : `Token budget alert: Used ${totalTokens.toLocaleString()} of ${budget.budget_tokens.toLocaleString()} tokens (${(budget.alert_threshold * 100).toFixed(0)}% threshold reached).`,
          `Remaining tokens: ${remainingTokens.toLocaleString()}`,
        )
      }

      if (!usdTriggered || (totalSpend < budget.budget_usd && (!tokenTriggered || totalTokens < (budget.budget_tokens ?? Infinity)))) {
        lines.push("Be mindful of token usage to stay within budget.")
      }

      lines.push("</system-reminder>")
      output.system.push(lines.join("\n"))
    },
  }
}

export default plugin
