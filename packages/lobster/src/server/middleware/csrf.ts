import type { MiddlewareHandler } from "hono"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

export function csrf(): MiddlewareHandler {
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next()
    // Only exempt specific OAuth callback endpoints from CSRF, not all auth routes
    if (c.req.path.match(/^\/provider\/[^/]+\/oauth\/callback$/) || c.req.path.match(/^\/mcp\/[^/]+\/auth\/callback$/))
      return next()

    // Skip CSRF for internal App().fetch() requests (no real HTTP origin)
    // Verify request actually comes from internal fetch, not just a spoofed Host header
    try {
      const url = new URL(c.req.url)
      if (url.hostname === "lobster.internal") {
        const origin = c.req.header("origin")
        const referer = c.req.header("referer")
        if (!origin && !referer) return next()
      }
    } catch {
      // URL parsing failed — proceed with CSRF check
    }

    const hasCSRFHeader = c.req.header("x-lobster-csrf") === "1"
    const hasXHRHeader = c.req.header("x-requested-with") === "XMLHttpRequest"
    if (!hasCSRFHeader && !hasXHRHeader) {
      return c.json(
        { error: "CSRF validation failed: missing X-Lobster-CSRF or X-Requested-With header" },
        { status: 403 },
      )
    }

    return next()
  }
}
