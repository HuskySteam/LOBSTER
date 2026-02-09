import type { Context, MiddlewareHandler } from "hono"
import { getConnInfo } from "hono/bun"

interface Entry {
  count: number
  resetTime: number
}

const WRITE_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"])
const WINDOW_MS = 60_000
const CLEANUP_INTERVAL_MS = 300_000

// Per-route rate limit tiers (requests per minute)
const TIER_AUTH = 10
const TIER_SHELL = 30
const TIER_WRITE = 100
const TIER_READ = 1000

// NOTE: Rate limit state is held in-memory and will be lost on process
// restart. This is acceptable for a local development tool but would need
// a shared store (e.g. Redis) for a production multi-process deployment.
const buckets = new Map<string, Entry>()

const cleanup = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of buckets) {
    if (now >= entry.resetTime) buckets.delete(key)
  }
}, CLEANUP_INTERVAL_MS)
cleanup.unref()

let connectionCounter = 0

/**
 * Trusted proxy IPs. Only trust X-Forwarded-For when the direct connection
 * comes from one of these addresses. Configurable via LOBSTER_TRUSTED_PROXIES
 * environment variable (comma-separated).
 */
const trustedProxies = new Set(
  (process.env.LOBSTER_TRUSTED_PROXIES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
)

function getClientIP(c: Context): string {
  // Prefer the actual socket remote address from Bun's ConnInfo
  // getConnInfo may fail for internal fetch() calls that lack c.env.server
  let socketIP: string | undefined
  try {
    const info = getConnInfo(c)
    socketIP = info.remote.address
  } catch {
    // Internal request (e.g. App().fetch()) — no socket context
  }

  // Only trust X-Forwarded-For if the direct connection is from a known proxy
  if (socketIP && trustedProxies.has(socketIP)) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
    if (forwarded) return forwarded
  }

  if (socketIP) return socketIP

  // Fallback: assign a unique identifier so unknown connections don't share a bucket
  return `unknown-${++connectionCounter}`
}

function getTierForPath(path: string, isWrite: boolean): { limit: number; tier: string } {
  if (path.startsWith("/auth/")) return { limit: TIER_AUTH, tier: "auth" }
  if (path.startsWith("/pty/")) return { limit: TIER_SHELL, tier: "shell" }
  if (isWrite) return { limit: TIER_WRITE, tier: "w" }
  return { limit: TIER_READ, tier: "r" }
}

export function rateLimit(): MiddlewareHandler {
  return async (c, next) => {
    const ip = getClientIP(c)
    const isWrite = WRITE_METHODS.has(c.req.method)
    const { limit, tier } = getTierForPath(c.req.path, isWrite)
    const key = `${ip}:${tier}`
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
