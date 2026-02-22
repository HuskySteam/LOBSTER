import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { MCP } from "../../mcp"
import { Config } from "../../config/config"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { lookup as dnsLookup } from "dns/promises"
import { Flag } from "../../flag/flag"

type IPRange =
  | { prefix: string; exact: false; value?: undefined }
  | { value: string; exact: true; prefix?: undefined }

const PRIVATE_IP_RANGES: IPRange[] = [
  { prefix: "127.", exact: false },
  { prefix: "10.", exact: false },
  { prefix: "192.168.", exact: false },
  { prefix: "0.", exact: false },
  { value: "169.254.169.254", exact: true },
  { value: "::1", exact: true },
  { prefix: "fe80:", exact: false },
  { prefix: "fc00:", exact: false },
  { prefix: "fd00:", exact: false },
  { prefix: "198.18.", exact: false },
  { prefix: "198.19.", exact: false },
  { prefix: "240.", exact: false },
]

function normalizeHost(hostname: string) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "")
}

function isPrivateIP(hostname: string): boolean {
  const normalized = normalizeHost(hostname)

  if (normalized.startsWith("172.")) {
    const second = parseInt(normalized.split(".")[1], 10)
    if (second >= 16 && second <= 31) return true
  }

  if (normalized.startsWith("100.")) {
    const second = parseInt(normalized.split(".")[1], 10)
    if (second >= 64 && second <= 127) return true
  }

  for (const range of PRIVATE_IP_RANGES) {
    if (range.exact) {
      if ("value" in range && normalized === range.value) return true
    } else if ("prefix" in range) {
      if (normalized.startsWith(range.prefix)) return true
    }
  }

  return false
}

function isLoopbackHost(hostname: string) {
  const normalized = normalizeHost(hostname)
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1"
}

async function resolvesToPrivateAddress(hostname: string) {
  const result = await Promise.race([
    dnsLookup(hostname, { all: true }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
  ])
  if (!result) return false
  return result.some((entry) => isPrivateIP(entry.address))
}

async function validateMcpRemoteUrl(
  urlString: string,
  options: { allowPrivateTargets: boolean },
): Promise<string | undefined> {
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    return "Invalid MCP remote URL."
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "MCP remote URL must use http:// or https://."
  }

  if (url.username || url.password) {
    return "MCP remote URL must not contain embedded credentials."
  }

  const hostname = normalizeHost(url.hostname)

  if (url.protocol === "http:" && !isLoopbackHost(hostname)) {
    return "MCP remote URL must use https:// unless it targets localhost."
  }

  if (!options.allowPrivateTargets) {
    if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".localdomain")) {
      return "MCP remote URL cannot target local network hostnames."
    }

    if (isPrivateIP(hostname)) {
      return "MCP remote URL cannot target private or internal IP addresses."
    }

    try {
      if (await resolvesToPrivateAddress(hostname)) {
        return "MCP remote URL resolves to a private or internal IP address."
      }
    } catch {
      // If DNS lookup fails, keep existing behavior and let MCP connection handle unreachable hosts.
    }
  }

  return undefined
}

export const McpRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "Get MCP status",
        description: "Get the status of all Model Context Protocol (MCP) servers.",
        operationId: "mcp.status",
        responses: {
          200: {
            description: "MCP server status",
            content: {
              "application/json": {
                schema: resolver(z.record(z.string(), MCP.Status)),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await MCP.status())
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Add MCP server",
        description: "Dynamically add a new Model Context Protocol (MCP) server to the system.",
        operationId: "mcp.add",
        responses: {
          200: {
            description: "MCP server added successfully",
            content: {
              "application/json": {
                schema: resolver(z.record(z.string(), MCP.Status)),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          name: z.string(),
          config: Config.Mcp,
        }),
      ),
      async (c) => {
        const { name, config } = c.req.valid("json")
        if (config.type === "remote") {
          const validationError = await validateMcpRemoteUrl(config.url, {
            allowPrivateTargets: Boolean(Flag.LOBSTER_SERVER_PASSWORD),
          })
          if (validationError) {
            return c.json({ error: validationError }, 400)
          }
        }
        const result = await MCP.add(name, config)
        return c.json(result.status)
      },
    )
    .post(
      "/:name/auth",
      describeRoute({
        summary: "Start MCP OAuth",
        description: "Start OAuth authentication flow for a Model Context Protocol (MCP) server.",
        operationId: "mcp.auth.start",
        responses: {
          200: {
            description: "OAuth flow started",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    authorizationUrl: z.string().describe("URL to open in browser for authorization"),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      async (c) => {
        const name = c.req.param("name")
        const supportsOAuth = await MCP.supportsOAuth(name)
        if (!supportsOAuth) {
          return c.json({ error: `MCP server ${name} does not support OAuth` }, 400)
        }
        const result = await MCP.startAuth(name)
        return c.json(result)
      },
    )
    .post(
      "/:name/auth/callback",
      describeRoute({
        summary: "Complete MCP OAuth",
        description:
          "Complete OAuth authentication for a Model Context Protocol (MCP) server using the authorization code.",
        operationId: "mcp.auth.callback",
        responses: {
          200: {
            description: "OAuth authentication completed",
            content: {
              "application/json": {
                schema: resolver(MCP.Status),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "json",
        z.object({
          code: z.string().describe("Authorization code from OAuth callback"),
        }),
      ),
      async (c) => {
        const name = c.req.param("name")
        const { code } = c.req.valid("json")
        const status = await MCP.finishAuth(name, code)
        return c.json(status)
      },
    )
    .post(
      "/:name/auth/authenticate",
      describeRoute({
        summary: "Authenticate MCP OAuth",
        description: "Start OAuth flow and wait for callback (opens browser)",
        operationId: "mcp.auth.authenticate",
        responses: {
          200: {
            description: "OAuth authentication completed",
            content: {
              "application/json": {
                schema: resolver(MCP.Status),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      async (c) => {
        const name = c.req.param("name")
        const supportsOAuth = await MCP.supportsOAuth(name)
        if (!supportsOAuth) {
          return c.json({ error: `MCP server ${name} does not support OAuth` }, 400)
        }
        const status = await MCP.authenticate(name)
        return c.json(status)
      },
    )
    .delete(
      "/:name/auth",
      describeRoute({
        summary: "Remove MCP OAuth",
        description: "Remove OAuth credentials for an MCP server",
        operationId: "mcp.auth.remove",
        responses: {
          200: {
            description: "OAuth credentials removed",
            content: {
              "application/json": {
                schema: resolver(z.object({ success: z.literal(true) })),
              },
            },
          },
          ...errors(404),
        },
      }),
      async (c) => {
        const name = c.req.param("name")
        await MCP.removeAuth(name)
        return c.json({ success: true as const })
      },
    )
    .post(
      "/:name/connect",
      describeRoute({
        description: "Connect an MCP server",
        operationId: "mcp.connect",
        responses: {
          200: {
            description: "MCP server connected successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      validator("param", z.object({ name: z.string() })),
      async (c) => {
        const { name } = c.req.valid("param")
        await MCP.connect(name)
        return c.json(true)
      },
    )
    .post(
      "/:name/disconnect",
      describeRoute({
        description: "Disconnect an MCP server",
        operationId: "mcp.disconnect",
        responses: {
          200: {
            description: "MCP server disconnected successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      validator("param", z.object({ name: z.string() })),
      async (c) => {
        const { name } = c.req.valid("param")
        await MCP.disconnect(name)
        return c.json(true)
      },
    ),
)
