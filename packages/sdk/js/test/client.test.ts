import { describe, expect, mock, test } from "bun:test"

const { createLobsterClient } = await import("../src/client")

async function withDeadline<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Timed out waiting after ${ms}ms`)), ms)
    }),
  ])
}

describe("createLobsterClient", () => {
  test("applies configured request timeout and does not force req.timeout=false", async () => {
    const originalFetch = globalThis.fetch
    let seenRequest: Request | undefined

    globalThis.fetch = mock((request: Request) => {
      seenRequest = request
      return new Promise((_resolve, reject) => {
        if (request.signal.aborted) {
          reject(request.signal.reason ?? new Error("aborted"))
          return
        }
        request.signal.addEventListener(
          "abort",
          () => {
            reject(request.signal.reason ?? new Error("aborted"))
          },
          { once: true },
        )
      })
    }) as unknown as typeof fetch

    try {
      const client = createLobsterClient({
        baseUrl: "https://example.com",
        timeout: 20,
      })

      await expect(withDeadline(client.project.list(), 200)).rejects.toBeDefined()

      expect(seenRequest).toBeDefined()
      expect((seenRequest as any).timeout).toBeUndefined()
      expect(seenRequest!.signal.aborted).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("preserves caller abort semantics when a signal is provided", async () => {
    const originalFetch = globalThis.fetch
    const reason = new Error("caller-aborted")

    globalThis.fetch = mock((request: Request) => {
      return new Promise((_resolve, reject) => {
        if (request.signal.aborted) {
          reject(request.signal.reason ?? new Error("aborted"))
          return
        }
        request.signal.addEventListener(
          "abort",
          () => {
            reject(request.signal.reason ?? new Error("aborted"))
          },
          { once: true },
        )
      })
    }) as unknown as typeof fetch

    try {
      const client = createLobsterClient({
        baseUrl: "https://example.com",
        timeout: 1_000,
      })
      const controller = new AbortController()
      const pending = client.project.list({ signal: controller.signal }).catch((error) => error)

      controller.abort(reason)

      const error = await pending
      expect(error).toBe(reason)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("disables timeout when config.timeout is false", async () => {
    const originalFetch = globalThis.fetch
    let abortReason: unknown

    globalThis.fetch = mock((request: Request) => {
      return new Promise((_resolve, reject) => {
        request.signal.addEventListener(
          "abort",
          () => {
            abortReason = request.signal.reason
            reject(request.signal.reason ?? new Error("aborted"))
          },
          { once: true },
        )
      })
    }) as unknown as typeof fetch

    try {
      const client = createLobsterClient({
        baseUrl: "https://example.com",
        timeout: false,
      })
      const controller = new AbortController()
      const reason = new Error("manual-stop")

      const pending = client.project.list({ signal: controller.signal }).catch((error) => error)

      await Bun.sleep(30)
      expect(abortReason).toBeUndefined()

      controller.abort(reason)
      const error = await pending
      expect(error).toBe(reason)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
