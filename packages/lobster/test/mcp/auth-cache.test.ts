import { test, expect } from "bun:test"
import path from "path"
import { Global } from "../../src/global"

const authPath = path.join(Global.Path.data, "mcp-auth.json")

async function loadMcpAuth() {
  const mod = await import(`../../src/mcp/auth.ts?cache-test=${Date.now()}-${Math.random()}`)
  return mod.McpAuth
}

test("McpAuth caches reads in memory after first load", async () => {
  await Bun.write(
    authPath,
    JSON.stringify(
      {
        server: {
          tokens: {
            accessToken: "first-token",
          },
        },
      },
      null,
      2,
    ),
  )

  const McpAuth = await loadMcpAuth()
  const first = await McpAuth.get("server")
  expect(first?.tokens?.accessToken).toBe("first-token")

  await Bun.write(
    authPath,
    JSON.stringify(
      {
        server: {
          tokens: {
            accessToken: "second-token",
          },
        },
      },
      null,
      2,
    ),
  )

  const second = await McpAuth.get("server")
  expect(second?.tokens?.accessToken).toBe("first-token")
})

test("McpAuth batches concurrent updates into a single persisted write", async () => {
  await Bun.write(authPath, JSON.stringify({}, null, 2))
  const McpAuth = await loadMcpAuth()

  const originalWrite = Bun.write
  let writeCalls = 0
  ;(Bun as any).write = async (...args: Parameters<typeof Bun.write>) => {
    writeCalls++
    return originalWrite(...args)
  }

  try {
    await Promise.all([
      McpAuth.updateTokens("server", {
        accessToken: "batched-token",
      }),
      McpAuth.updateClientInfo("server", {
        clientId: "batched-client",
      }),
      McpAuth.updateOAuthState("server", "oauth-state"),
    ])
  } finally {
    ;(Bun as any).write = originalWrite
  }

  expect(writeCalls).toBe(1)

  const persisted = await Bun.file(authPath).json()
  expect(persisted.server.tokens.accessToken).toBe("batched-token")
  expect(persisted.server.clientInfo.clientId).toBe("batched-client")
  expect(persisted.server.oauthState).toBe("oauth-state")
})
