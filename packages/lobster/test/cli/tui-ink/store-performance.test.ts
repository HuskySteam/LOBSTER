import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"

mock.module("zod", () => ({
  default: {
    enum: () => ({
      meta: () => ({}),
    }),
  },
}))

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

const { useAppStore } = await import("../../../src/cli/cmd/tui-ink/store")

function makeMessage(id: string, sessionID: string, role: "user" | "assistant" = "assistant") {
  return {
    id,
    sessionID,
    role,
    time: {},
  } as any
}

function makeTextPart(id: string, messageID: string, text: string) {
  return {
    id,
    messageID,
    type: "text",
    text,
  } as any
}

describe("tui-ink store performance state", () => {
  beforeEach(() => {
    useAppStore.getState().reset()
  })

  test("keeps per-session part state isolated across unrelated part updates", () => {
    const store = useAppStore.getState()
    store.upsertMessage(makeMessage("m-001", "session-a"))
    store.upsertMessage(makeMessage("m-002", "session-b"))

    store.setParts("m-001", [makeTextPart("p-001", "m-001", "hello")])
    store.setParts("m-002", [makeTextPart("p-002", "m-002", "world")])

    const before = (useAppStore.getState() as any).session_part?.["session-a"]
    store.upsertPart(makeTextPart("p-003", "m-002", "!!!"))

    const after = useAppStore.getState() as any
    expect(after.session_part?.["session-a"]).toBe(before)
    expect(after.session_part?.["session-b"]?.["m-002"]).toHaveLength(2)
  })

  test("maintains incremental per-session text token totals", () => {
    const store = useAppStore.getState()
    store.upsertMessage(makeMessage("m-003", "session-c"))
    store.setParts("m-003", [
      makeTextPart("p-010", "m-003", "abcd"),
      { id: "p-011", messageID: "m-003", type: "tool", tool: "bash", state: {} } as any,
    ])

    expect((useAppStore.getState() as any).session_text_tokens?.["session-c"]).toBe(1)

    store.upsertPart(makeTextPart("p-010", "m-003", "abcdefgh"))
    expect((useAppStore.getState() as any).session_text_tokens?.["session-c"]).toBe(2)

    store.removePart("m-003", "p-010")
    expect((useAppStore.getState() as any).session_text_tokens?.["session-c"]).toBe(0)
  })

  test("keeps a capped append/truncate message buffer and cleans derived mappings", () => {
    const store = useAppStore.getState()
    for (let i = 0; i < 101; i++) {
      store.upsertMessage(makeMessage(`m-${String(i).padStart(3, "0")}`, "session-d"))
    }

    const state = useAppStore.getState() as any
    const messages = state.message["session-d"] as any[]
    expect(messages).toHaveLength(100)
    expect(messages[0]?.id).toBe("m-001")
    expect(state.message_session?.["m-100"]).toBe("session-d")
    expect(state.message_session?.["m-000"]).toBeUndefined()
  })
})

afterAll(() => {
  mock.restore()
})
