import type { Tool as AITool } from "ai"
import { Log } from "@/util/log"

export namespace ToolResolveCache {
  const log = Log.create({ service: "tool-resolve-cache" })

  interface CacheEntry {
    tools: Record<string, AITool>
    agent: string
    timestamp: number
  }

  const cache = new Map<string, CacheEntry>()
  const TTL = 120_000 // 2 minute TTL — tools don't change often

  /**
   * Get cached resolved tools for a session+agent combo.
   */
  export function get(sessionID: string, agentName: string): Record<string, AITool> | undefined {
    const key = `${sessionID}:${agentName}`
    const entry = cache.get(key)
    if (!entry) return undefined
    if (Date.now() - entry.timestamp > TTL) {
      cache.delete(key)
      return undefined
    }
    log.info("tool cache hit", { sessionID, agent: agentName, toolCount: Object.keys(entry.tools).length })
    return entry.tools
  }

  /**
   * Store resolved tools in cache.
   */
  export function set(sessionID: string, agentName: string, tools: Record<string, AITool>): void {
    const key = `${sessionID}:${agentName}`
    cache.set(key, {
      tools,
      agent: agentName,
      timestamp: Date.now(),
    })
    log.info("tool cache set", { sessionID, agent: agentName, toolCount: Object.keys(tools).length })
  }

  /**
   * Invalidate cache for a session (e.g., on MCP reconnect, plugin reload).
   */
  export function invalidate(sessionID: string): void {
    for (const [key] of cache) {
      if (key.startsWith(`${sessionID}:`)) {
        cache.delete(key)
      }
    }
    log.info("tool cache invalidated", { sessionID })
  }

  /**
   * Invalidate all cache entries (e.g., on MCP server reconnect).
   */
  export function invalidateAll(): void {
    cache.clear()
    log.info("tool cache cleared globally")
  }
}
