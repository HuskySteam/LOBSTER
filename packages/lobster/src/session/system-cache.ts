import { Log } from "@/util/log"

export namespace SystemCache {
  const log = Log.create({ service: "system-cache" })

  interface CacheEntry {
    system: string[]
    hash: string
    agent: string
    timestamp: number
  }

  const cache = new Map<string, CacheEntry>()
  const TTL = 60_000 // 1 minute TTL

  function computeHash(system: string[]): string {
    const content = system.join("\n---\n")
    return Bun.hash.xxHash32(content).toString(36)
  }

  /**
   * Get cached system prompt for a session+agent combo.
   * Returns undefined if cache miss or expired.
   */
  export function get(sessionID: string, agent: string): string[] | undefined {
    const key = `${sessionID}:${agent}`
    const entry = cache.get(key)
    if (!entry) return undefined
    if (entry.agent !== agent) return undefined
    if (Date.now() - entry.timestamp > TTL) {
      cache.delete(key)
      return undefined
    }
    log.info("cache hit", { sessionID, agent })
    return entry.system
  }

  /**
   * Store system prompt in cache.
   */
  export function set(sessionID: string, agent: string, system: string[]): void {
    const key = `${sessionID}:${agent}`
    cache.set(key, {
      system,
      hash: computeHash(system),
      agent,
      timestamp: Date.now(),
    })
  }

  /**
   * Invalidate cache for a session (e.g., on agent switch, config change).
   */
  export function invalidate(sessionID: string): void {
    for (const [key] of cache) {
      if (key.startsWith(`${sessionID}:`)) {
        cache.delete(key)
      }
    }
    log.info("cache invalidated", { sessionID })
  }

  /**
   * Clear all cache entries.
   */
  export function clear(): void {
    cache.clear()
  }
}
