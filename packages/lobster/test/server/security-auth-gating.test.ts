import { describe, expect, test } from "bun:test"
import path from "path"
import { Log } from "../../src/util/log"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

const csrfHeaders = {
  "Content-Type": "application/json",
  "X-Lobster-CSRF": "1",
}

describe("critical mutating route auth gating", () => {
  test("blocks config mutation without session token and allows authenticated request path", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const app = Server.App()

        const unauthenticated = await app.request("/config", {
          method: "PATCH",
          headers: csrfHeaders,
          body: JSON.stringify({ unknown_field: true }),
        })
        expect(unauthenticated.status).toBe(401)

        const authenticated = await app.request("/config", {
          method: "PATCH",
          headers: {
            ...csrfHeaders,
            "x-lobster-token": Server.sessionToken(),
          },
          body: JSON.stringify({ unknown_field: true }),
        })
        expect(authenticated.status).toBe(400)
      },
    })
  })

  test("blocks experimental worktree mutations without session token", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const app = Server.App()

        const createResponse = await app.request("/experimental/worktree", {
          method: "POST",
          headers: csrfHeaders,
          body: JSON.stringify({}),
        })
        expect(createResponse.status).toBe(401)

        const deleteResponse = await app.request("/experimental/worktree", {
          method: "DELETE",
          headers: csrfHeaders,
          body: JSON.stringify({}),
        })
        expect(deleteResponse.status).toBe(401)

        const resetResponse = await app.request("/experimental/worktree/reset", {
          method: "POST",
          headers: csrfHeaders,
          body: JSON.stringify({}),
        })
        expect(resetResponse.status).toBe(401)

        const blockedStartCommand = await app.request("/experimental/worktree", {
          method: "POST",
          headers: {
            ...csrfHeaders,
            "x-lobster-token": Server.sessionToken(),
          },
          body: JSON.stringify({ name: "safe-worktree", startCommand: "echo pwned" }),
        })
        expect(blockedStartCommand.status).toBe(400)

        const requiresConfirmDelete = await app.request("/experimental/worktree", {
          method: "DELETE",
          headers: {
            ...csrfHeaders,
            "x-lobster-token": Server.sessionToken(),
          },
          body: JSON.stringify({ directory: "C:\\fake\\worktree" }),
        })
        expect(requiresConfirmDelete.status).toBe(400)

        const requiresConfirmReset = await app.request("/experimental/worktree/reset", {
          method: "POST",
          headers: {
            ...csrfHeaders,
            "x-lobster-token": Server.sessionToken(),
          },
          body: JSON.stringify({ directory: "C:\\fake\\worktree" }),
        })
        expect(requiresConfirmReset.status).toBe(400)
      },
    })
  })

  test("blocks mcp add without session token and allows authenticated request path", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const app = Server.App()

        const unauthenticated = await app.request("/mcp", {
          method: "POST",
          headers: csrfHeaders,
          body: JSON.stringify({}),
        })
        expect(unauthenticated.status).toBe(401)

        const authenticated = await app.request("/mcp", {
          method: "POST",
          headers: {
            ...csrfHeaders,
            "x-lobster-token": Server.sessionToken(),
          },
          body: JSON.stringify({}),
        })
        expect(authenticated.status).toBe(400)

        const privateTarget = await app.request("/mcp", {
          method: "POST",
          headers: {
            ...csrfHeaders,
            "x-lobster-token": Server.sessionToken(),
          },
          body: JSON.stringify({
            name: "private-target",
            config: {
              type: "remote",
              url: "http://169.254.169.254/latest/meta-data",
            },
          }),
        })
        expect(privateTarget.status).toBe(400)
      },
    })
  })
})
