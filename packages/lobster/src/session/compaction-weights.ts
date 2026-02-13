import { Token } from "../util/token"
import type { MessageV2 } from "./message-v2"

export namespace CompactionWeights {
  const RECENCY_BONUS = 3
  const RECENCY_THRESHOLD = 0.8
  const ERROR_BONUS = 2
  const LARGE_OUTPUT_THRESHOLD = 5000
  const LARGE_OUTPUT_PENALTY = -2
  const EXPLORATION_BONUS = 1

  const EXPLORATION_TOOLS = ["read", "grep", "glob"]

  export function score(
    part: MessageV2.ToolPart,
    msgIndex: number,
    totalMsgs: number,
  ): number {
    let s = 0
    // recency: last 20% of messages are protected
    if (msgIndex > totalMsgs * RECENCY_THRESHOLD) s += RECENCY_BONUS
    // errors: keep for context
    if (part.state.status === "error") s += ERROR_BONUS
    // large outputs: deprioritize (they consume context)
    if (part.state.status === "completed" && Token.estimate(part.state.output) > LARGE_OUTPUT_THRESHOLD) s += LARGE_OUTPUT_PENALTY
    // exploration tools: slightly protected (contain useful context)
    if (EXPLORATION_TOOLS.includes(part.tool)) s += EXPLORATION_BONUS
    return s
  }
}
