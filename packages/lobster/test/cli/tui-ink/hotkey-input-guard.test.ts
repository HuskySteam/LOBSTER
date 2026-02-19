import { beforeEach, describe, expect, test } from "bun:test"
import {
  createHotkeyInputGuard,
  markGlobalHotkeyConsumed,
  resetGlobalHotkeyGuard,
  shouldIgnoreGlobalInput,
} from "../../../src/cli/cmd/tui-ink/ui/hotkey-input-guard"

describe("hotkey input guard", () => {
  beforeEach(() => {
    resetGlobalHotkeyGuard()
  })

  test("suppresses input during guard window", () => {
    const guard = createHotkeyInputGuard(20)
    guard.markHotkeyConsumed(100)
    expect(guard.shouldIgnoreInput(110)).toBe(true)
    expect(guard.shouldIgnoreInput(121)).toBe(false)
  })

  test("wrapped onChange ignores values while suppressed", () => {
    const guard = createHotkeyInputGuard(20)
    let value = ""
    const onChange = guard.wrapOnChange((next) => {
      value = next
    })

    guard.markHotkeyConsumed()
    onChange("leaked")
    expect(value).toBe("")
  })

  test("snapshot restore restores prior value once", () => {
    const guard = createHotkeyInputGuard()
    let value = "before"

    guard.captureSnapshot("before")
    value = "mutated"
    guard.restoreSnapshot(() => value, (next) => {
      value = next
    })
    expect(value).toBe("before")

    value = "new"
    guard.restoreSnapshot(() => value, (next) => {
      value = next
    })
    expect(value).toBe("new")
  })

  test("global suppression is visible across guards", () => {
    const first = createHotkeyInputGuard(20)
    const second = createHotkeyInputGuard(20)

    first.markHotkeyConsumed(200)
    expect(second.shouldIgnoreInput(210)).toBe(true)
    expect(second.shouldIgnoreInput(222)).toBe(false)
  })

  test("direct global suppression helper works", () => {
    markGlobalHotkeyConsumed(20, 300)
    expect(shouldIgnoreGlobalInput(310)).toBe(true)
    expect(shouldIgnoreGlobalInput(322)).toBe(false)
  })
})
