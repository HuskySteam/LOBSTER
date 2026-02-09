import type { MiddlewareHandler } from "hono"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

export function csrf(): MiddlewareHandler {
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next()
    if (c.req.path.startsWith("/auth/")) return next()

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
