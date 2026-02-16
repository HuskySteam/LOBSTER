import { Token } from "@/util/token"
import { MessageV2 } from "./message-v2"
import type { Provider } from "@/provider/provider"
import type { Agent } from "@/agent/agent"
import type { ModelMessage } from "ai"
import { Log } from "@/util/log"
import { Instance } from "@/project/instance"

export namespace ContextWindow {
  const log = Log.create({ service: "context-window" })

  export interface Budget {
    total: number
    system: number
    history: number
    tools: number
    current: number
  }

  // Rolling summaries per session
  const rollingSummaries = new Map<string, string>()

  export function getRollingSummary(sessionID: string): string | undefined {
    return rollingSummaries.get(sessionID)
  }

  export function setRollingSummary(sessionID: string, summary: string): void {
    rollingSummaries.set(sessionID, summary)
  }

  export function clearRollingSummary(sessionID: string): void {
    rollingSummaries.delete(sessionID)
  }

  /**
   * Compute a token budget for the current turn based on model limits.
   * Reserves space for system prompt, tool outputs, and current turn.
   */
  export function computeBudget(model: Provider.Model): Budget {
    const context = model.limit.context || 128_000
    const outputReserve = Math.min(model.limit.output || 32_000, 32_000)
    const usable = (model.limit.input || context - outputReserve) * 0.85 // 85% of usable to leave headroom
    return {
      total: Math.floor(usable),
      system: Math.min(Math.floor(usable * 0.15), 15_000), // 15% for system prompt, max 15k
      history: Math.floor(usable * 0.60), // 60% for conversation history
      tools: Math.floor(usable * 0.15), // 15% for tool outputs in history
      current: Math.floor(usable * 0.10), // 10% for current turn
    }
  }

  /**
   * Score a message for importance in context retention.
   * Higher score = more important = keep in context.
   *
   * Scoring factors:
   * - Recency (newer = higher)
   * - User messages score higher than assistant messages
   * - Messages with tool errors score higher (need to be visible)
   * - Summary messages are always kept
   * - Last 2 user/assistant exchanges always kept
   */
  export function scoreMessage(msg: MessageV2.WithParts, position: number, total: number): number {
    let score = 0

    // Recency: linear scale 0-50 based on position
    score += (position / Math.max(total - 1, 1)) * 50

    // Role bonus
    if (msg.info.role === "user") score += 20
    if (msg.info.role === "assistant" && (msg.info as MessageV2.Assistant).summary) score += 100 // summaries are critical

    // Error visibility
    for (const part of msg.parts) {
      if (part.type === "tool" && part.state.status === "error") score += 30
    }

    // Last 2 exchanges always kept (score 200+)
    if (position >= total - 4) score += 200

    return score
  }

  /**
   * Truncate a tool output to fit within a token budget.
   * Preserves the beginning and end of the output with a truncation marker.
   */
  export function truncateToolOutput(output: string, maxTokens: number): string {
    const currentTokens = Token.estimate(output)
    if (currentTokens <= maxTokens) return output

    const maxChars = maxTokens * 4 // reverse the token estimation
    const headChars = Math.floor(maxChars * 0.6)
    const tailChars = Math.floor(maxChars * 0.3)
    const head = output.slice(0, headChars)
    const tail = output.slice(-tailChars)
    const truncatedLines = output.split("\n").length - head.split("\n").length - tail.split("\n").length

    return `${head}\n\n[... ${truncatedLines} lines truncated — use the tool again if you need the full output ...]\n\n${tail}`
  }

  /**
   * Summarize old tool outputs that are being re-sent.
   * Returns a compact representation to save tokens.
   */
  export function summarizeOldToolOutput(tool: string, output: string): string {
    const tokens = Token.estimate(output)
    if (tokens <= 200) return output

    // For re-sent outputs, just keep a brief summary
    const firstLines = output.split("\n").slice(0, 5).join("\n")
    return `[Previous ${tool} output — ${tokens} tokens, showing first 5 lines]\n${firstLines}\n[... truncated — re-run tool if needed ...]`
  }

  /**
   * Build an optimized message array that fits within the model's context window.
   * This is the main entry point that replaces raw MessageV2.toModelMessages().
   *
   * Strategy:
   * 1. Always include: rolling summary (if exists), last 2 exchanges, current user message
   * 2. Score all other messages by importance
   * 3. Include highest-scoring messages until budget is exhausted
   * 4. Truncate tool outputs in older messages
   * 5. Convert to ModelMessage format via MessageV2.toModelMessages()
   */
  export function build(input: {
    messages: MessageV2.WithParts[]
    model: Provider.Model
    agent: Agent.Info
    step: number
    sessionID: string
  }): MessageV2.WithParts[] {
    const budget = computeBudget(input.model)
    const msgs = input.messages

    // If messages fit comfortably, return all (small conversations)
    const totalEstimate = estimateMessages(msgs)
    if (totalEstimate <= budget.history) {
      return msgs
    }

    log.info("applying context window", {
      totalMessages: msgs.length,
      estimatedTokens: totalEstimate,
      budgetHistory: budget.history,
    })

    const result: MessageV2.WithParts[] = []
    let usedTokens = 0

    // 1. Always include summary messages (compaction results)
    for (const msg of msgs) {
      if (msg.info.role === "assistant" && (msg.info as MessageV2.Assistant).summary) {
        result.push(msg)
        usedTokens += estimateMessage(msg)
      }
    }

    // 2. Inject rolling summary if available
    const rollingSummary = getRollingSummary(input.sessionID)
    if (rollingSummary) {
      usedTokens += Token.estimate(rollingSummary)
    }

    // 3. Always include last 4 messages (last 2 exchanges)
    const recentMessages = msgs.slice(-4).filter(
      (m) => !result.includes(m),
    )
    for (const msg of recentMessages) {
      result.push(msg)
      usedTokens += estimateMessage(msg)
    }

    // 4. Score remaining messages and include by importance
    const remaining = msgs.filter((m) => !result.includes(m))
    const scored = remaining.map((msg, idx) => ({
      msg,
      score: scoreMessage(msg, msgs.indexOf(msg), msgs.length),
      tokens: estimateMessage(msg),
    }))
    scored.sort((a, b) => b.score - a.score) // highest importance first

    for (const item of scored) {
      if (usedTokens + item.tokens > budget.history) {
        // Try to include with truncated tool outputs
        const truncated = truncateMessageToolOutputs(item.msg, 500)
        const truncatedTokens = estimateMessage(truncated)
        if (usedTokens + truncatedTokens <= budget.history) {
          result.push(truncated)
          usedTokens += truncatedTokens
        }
        continue
      }
      result.push(item.msg)
      usedTokens += item.tokens
    }

    // 5. Sort by original order
    result.sort((a, b) => {
      const aIdx = msgs.indexOf(a)
      const bIdx = msgs.indexOf(b)
      return aIdx - bIdx
    })

    log.info("context window applied", {
      originalMessages: msgs.length,
      keptMessages: result.length,
      droppedMessages: msgs.length - result.length,
      usedTokens,
      budgetHistory: budget.history,
    })

    return result
  }

  /**
   * Estimate total tokens for an array of messages.
   */
  function estimateMessages(msgs: MessageV2.WithParts[]): number {
    return msgs.reduce((sum, msg) => sum + estimateMessage(msg), 0)
  }

  /**
   * Estimate tokens for a single message including all its parts.
   */
  function estimateMessage(msg: MessageV2.WithParts): number {
    let tokens = 10 // base overhead for message structure
    for (const part of msg.parts) {
      switch (part.type) {
        case "text":
          tokens += Token.estimate(part.text)
          break
        case "reasoning":
          tokens += Token.estimate(part.text)
          break
        case "tool":
          tokens += Token.estimate(JSON.stringify(part.state))
          if (part.state.status === "completed" && part.state.output) {
            tokens += Token.estimate(
              typeof part.state.output === "string"
                ? part.state.output
                : JSON.stringify(part.state.output),
            )
          }
          break
        case "file":
          tokens += 100 // approximate for file metadata
          break
        default:
          tokens += 50
      }
    }
    return tokens
  }

  /**
   * Create a copy of a message with truncated tool outputs.
   */
  function truncateMessageToolOutputs(msg: MessageV2.WithParts, maxTokensPerTool: number): MessageV2.WithParts {
    return {
      ...msg,
      parts: msg.parts.map((part) => {
        if (part.type !== "tool") return part
        if (part.state.status !== "completed") return part
        if (!part.state.output) return part

        const output = typeof part.state.output === "string"
          ? part.state.output
          : JSON.stringify(part.state.output)

        const summarized = summarizeOldToolOutput(part.tool, output)
        return {
          ...part,
          state: {
            ...part.state,
            output: summarized,
          },
        }
      }),
    }
  }
}
