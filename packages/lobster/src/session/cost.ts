import type { MessageV2 } from "./message-v2"

export namespace SessionCost {
  export interface Stats {
    totalCost: number
    inputTokens: number
    outputTokens: number
    reasoningTokens: number
    cacheRead: number
    cacheWrite: number
  }

  export function aggregate(messages: Array<{ role: string; cost?: number; tokens?: MessageV2.Assistant["tokens"] }>): Stats {
    const stats: Stats = {
      totalCost: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheRead: 0,
      cacheWrite: 0,
    }
    for (const msg of messages) {
      if (msg.role !== "assistant") continue
      stats.totalCost += msg.cost ?? 0
      if (msg.tokens) {
        stats.inputTokens += msg.tokens.input ?? 0
        stats.outputTokens += msg.tokens.output ?? 0
        stats.reasoningTokens += msg.tokens.reasoning ?? 0
        stats.cacheRead += msg.tokens.cache?.read ?? 0
        stats.cacheWrite += msg.tokens.cache?.write ?? 0
      }
    }
    return stats
  }

  export function cacheHitRatio(stats: Stats): number {
    const total = stats.inputTokens + stats.cacheRead
    if (total === 0) return 0
    return stats.cacheRead / total
  }

  export function formatTokens(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K"
    return String(n)
  }
}
