import { describe, expect, test } from "bun:test"
import type { Context } from "hono"
import { callTui, TuiRoutes } from "../../src/server/routes/tui"

function createMockContext(path: string, body: unknown): Context {
  return {
    req: {
      path,
      json: async () => body,
    },
  } as unknown as Context
}

describe("tui control queue timeout handling", () => {
  test("removes timed out waiter so late response is still delivered to next request", async () => {
    const timedOutPromise = callTui(createMockContext("/tui/control/example", { request: 1 }), 30)
    await expect(timedOutPromise).rejects.toThrow("timed out")

    const control = TuiRoutes()
    const submit = await control.request("/control/response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, source: "late-response" }),
    })
    expect(submit.status).toBe(200)

    const nextResult = await callTui(createMockContext("/tui/control/example", { request: 2 }), 500)
    expect(nextResult).toEqual({ ok: true, source: "late-response" })
  })
})
