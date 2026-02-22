import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"

mock.module("zustand", () => ({
  create: <T>() => (initializer: (set: (partial: Partial<T> | ((state: T) => Partial<T> | T)) => void, get: () => T) => T) => {
    let state: T
    const get = () => state
    const set = (partial: Partial<T> | ((state: T) => Partial<T> | T)) => {
      const next = typeof partial === "function" ? partial(state) : partial
      if (next === state || next === undefined) return
      state = { ...(state as any), ...(next as any) }
    }
    state = initializer(set, get)
    const useStore = ((selector?: (value: T) => unknown) => (selector ? selector(state) : state)) as any
    useStore.getState = get
    return useStore
  },
}))

mock.module("@/util/log", () => ({
  Log: {
    init: () => {},
    create: () => ({
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    }),
    Default: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  },
}))

const lspStatus = mock(async () => ({
  data: [{ id: "ts", status: "connected" }],
}))

mock.module("@lobster-ai/sdk/v2", () => ({
  createLobsterClient: () => ({
    lsp: {
      status: lspStatus,
    },
  }),
}))

const { useAppStore } = await import("../../../src/cli/cmd/tui-ink/store")
const { createSyncManager } = await import("../../../src/cli/cmd/tui-ink/sync")

describe("tui-ink sync lsp update coalescing", () => {
  beforeEach(() => {
    lspStatus.mockClear()
    useAppStore.getState().reset()
  })

  test("coalesces bursty lsp.updated events into one status refresh", async () => {
    let onEvent: ((event: any) => void) | undefined
    const sync = createSyncManager({
      url: "http://localhost:0",
      args: {},
      onExit: async () => {},
      events: {
        on(handler) {
          onEvent = handler
          return () => {
            onEvent = undefined
          }
        },
      },
    })

    const disposeEvents = await sync.startEventLoop()
    for (let i = 0; i < 20; i++) {
      onEvent?.({ type: "lsp.updated", properties: {} })
    }

    await new Promise((resolve) => setTimeout(resolve, 120))
    disposeEvents?.()
    sync.dispose()

    expect(lspStatus).toHaveBeenCalledTimes(1)
  })
})

afterAll(() => {
  mock.restore()
})
