import { Log } from "../util/log"

export namespace ToolCache {
  const log = Log.create({ service: "tool.cache" })
  const MAX_ENTRIES = 100

  interface CacheEntry {
    key: string
    output: any
    time: number
  }

  const sessions = new Map<string, Map<string, CacheEntry>>()

  const CACHEABLE_TOOLS = new Set(["grep", "glob", "read", "ls", "lsp", "codesearch"])

  const MUTATING_TOOLS = new Set(["edit", "write", "multiedit", "apply_patch", "bash"])

  export function isCacheable(toolName: string): boolean {
    return CACHEABLE_TOOLS.has(toolName)
  }

  function makeKey(toolName: string, args: any): string {
    const sorted = JSON.stringify(args, Object.keys(args ?? {}).sort())
    return `${toolName}:${sorted}`
  }

  function getSessionCache(sessionID: string): Map<string, CacheEntry> {
    let cache = sessions.get(sessionID)
    if (!cache) {
      cache = new Map()
      sessions.set(sessionID, cache)
    }
    return cache
  }

  export function get(sessionID: string, toolName: string, args: any): any | undefined {
    if (!isCacheable(toolName)) return undefined
    const cache = sessions.get(sessionID)
    if (!cache) return undefined
    const key = makeKey(toolName, args)
    const entry = cache.get(key)
    if (!entry) return undefined
    log.info("cache hit", { sessionID, tool: toolName })
    return entry.output
  }

  export function set(sessionID: string, toolName: string, args: any, output: any): void {
    if (!isCacheable(toolName)) return
    const cache = getSessionCache(sessionID)
    const key = makeKey(toolName, args)

    // LRU eviction
    if (cache.size >= MAX_ENTRIES) {
      let oldest: string | undefined
      let oldestTime = Infinity
      for (const [k, v] of cache) {
        if (v.time < oldestTime) {
          oldestTime = v.time
          oldest = k
        }
      }
      if (oldest) cache.delete(oldest)
    }

    cache.set(key, { key, output, time: Date.now() })
    log.info("cache set", { sessionID, tool: toolName })
  }

  export function invalidateAfterTool(sessionID: string, toolName: string, args?: any): void {
    if (!MUTATING_TOOLS.has(toolName)) return
    const cache = sessions.get(sessionID)
    if (!cache || cache.size === 0) return

    if (toolName === "bash") {
      // Bash can change anything — clear entire cache
      cache.clear()
      log.info("cache cleared after bash", { sessionID })
      return
    }

    // edit/write/apply_patch: clear read entries for affected file, clear all grep/glob
    const filePath = args?.filePath ?? args?.file_path ?? args?.path
    const toDelete: string[] = []
    for (const [key] of cache) {
      if (key.startsWith("grep:") || key.startsWith("glob:")) {
        toDelete.push(key)
      } else if (filePath && key.startsWith("read:") && key.includes(filePath)) {
        toDelete.push(key)
      }
    }
    for (const key of toDelete) {
      cache.delete(key)
    }
    if (toDelete.length > 0) {
      log.info("cache invalidated", { sessionID, tool: toolName, cleared: toDelete.length })
    }
  }

  export function clear(sessionID: string): void {
    const deleted = sessions.delete(sessionID)
    if (deleted) log.info("cache cleared", { sessionID })
  }
}
