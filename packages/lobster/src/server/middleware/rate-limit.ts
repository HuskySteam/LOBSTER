import type { MiddlewareHandler } from "hono"

interface Entry {
  count: number
  resetTime: number
}

const WRITE_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"])
const WRITE_LIMIT = 100
const READ_LIMIT = 1000
const WINDOW_MS = 60_000
const CLEANUP_INTERVAL_MS = 300_000

const buckets = new Map<string, Entry>()

const cleanup = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of buckets) {
    if (now >= entry.resetTime) buckets.delete(key)
  }
}, CLEANUP_INTERVAL_MS)
cleanup.unref()

function getClientIP(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
}

export function rateLimit(): MiddlewareHandler {
  return async (c, next) => {
    const ip = getClientIP(c)
    const isWrite = WRITE_METHODS.has(c.req.method)
    const limit = isWrite ? WRITE_LIMIT : READ_LIMIT
    const key = `${ip}:${isWrite ? "w" : "r"}`
    const now = Date.now()

    let entry = buckets.get(key)
    if (!entry || now >= entry.resetTime) {
      entry = { count: 0, resetTime: now + WINDOW_MS }
      buckets.set(key, entry)
    }

    entry.count++

    if (entry.count > limit) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000)
      c.res = new Response(
        JSON.stringify({ error: "Too many requests" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
          },
        },
      )
      return
    }

    return next()
  }
}
