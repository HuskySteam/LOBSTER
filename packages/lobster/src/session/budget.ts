import type { Provider } from "@/provider/provider"
import { Log } from "@/util/log"

export namespace TokenBudget {
  const log = Log.create({ service: "token-budget" })

  export interface TurnBudget {
    /** Max input tokens for this turn */
    maxInput: number
    /** Max output tokens */
    maxOutput: number
    /** Max tool calls before forcing a response */
    maxToolCalls: number
    /** Max tokens per individual tool output */
    maxToolOutput: number
  }

  /**
   * Compute an adaptive token budget for the current turn.
   *
   * Strategy:
   * - Early turns get generous budgets (exploration phase)
   * - Later turns get tighter budgets (should be wrapping up)
   * - If total spent is high, reduce budgets aggressively
   * - User-set budget caps override everything
   */
  export function compute(input: {
    model: Provider.Model
    step: number
    totalSpent: number
    userBudget?: number
  }): TurnBudget {
    const context = input.model.limit.context || 128_000
    const modelOutput = Math.min(input.model.limit.output || 32_000, 32_000)

    // Base budget: 80% of context for input
    let maxInput = Math.floor(context * 0.8)

    // Reduce budget as steps increase (diminishing returns)
    if (input.step > 5) maxInput = Math.floor(maxInput * 0.8)
    if (input.step > 10) maxInput = Math.floor(maxInput * 0.6)
    if (input.step > 20) maxInput = Math.floor(maxInput * 0.4)

    // Reduce if total spent is high relative to a reasonable session budget
    const sessionBudgetGuess = context * 5 // 5x context is a reasonable session
    const spentRatio = input.totalSpent / sessionBudgetGuess
    if (spentRatio > 0.5) maxInput = Math.floor(maxInput * 0.7)
    if (spentRatio > 0.8) maxInput = Math.floor(maxInput * 0.5)

    // User budget cap
    if (input.userBudget && input.totalSpent > input.userBudget * 0.8) {
      maxInput = Math.floor(maxInput * 0.5)
    }

    // Tool calls: generous early, tighter later
    let maxToolCalls = 25
    if (input.step > 10) maxToolCalls = 15
    if (input.step > 20) maxToolCalls = 10

    // Per-tool output limit
    let maxToolOutput = 10_000 // tokens
    if (input.step > 10) maxToolOutput = 5_000
    if (input.step > 20) maxToolOutput = 2_500

    const budget: TurnBudget = {
      maxInput: Math.max(maxInput, 10_000), // floor of 10k
      maxOutput: modelOutput,
      maxToolCalls,
      maxToolOutput,
    }

    log.info("computed budget", {
      step: input.step,
      totalSpent: input.totalSpent,
      ...budget,
    })

    return budget
  }
}
