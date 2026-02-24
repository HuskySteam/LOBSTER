import { describe, expect, it } from "bun:test"
import { getTriggerDeleteFallback, normalizePromptInput } from "../../../src/cli/cmd/tui-ink/component/prompt/input-normalize"

describe("prompt input normalization", () => {
  it("keeps normal text unchanged", () => {
    expect(normalizePromptInput("/model gpt-5")).toBe("/model gpt-5")
  })

  it("removes generic control characters", () => {
    expect(normalizePromptInput("a\u0000b\u001fc")).toBe("abc")
  })

  it("applies backspace semantics", () => {
    expect(normalizePromptInput("/\b")).toBe("")
    expect(normalizePromptInput("abc\b")).toBe("ab")
    expect(normalizePromptInput("a😀\b")).toBe("a")
  })

  it("applies delete semantics", () => {
    expect(normalizePromptInput("/\u007f")).toBe("")
    expect(normalizePromptInput("abc\u007f")).toBe("ab")
    expect(normalizePromptInput("a😀\u007f")).toBe("a")
  })

  it("handles mixed deletes and controls", () => {
    expect(normalizePromptInput("ab\u0008c\u007fd")).toBe("ad")
  })
})

describe("trigger delete fallback", () => {
  it("clears single slash in slash mode", () => {
    expect(getTriggerDeleteFallback("/", { acMode: "/", acTriggerPos: 0, isDeleteKey: true })).toBe("")
  })

  it("does not fallback for slash command body", () => {
    expect(getTriggerDeleteFallback("/x", { acMode: "/", acTriggerPos: 0, isDeleteKey: true })).toBeUndefined()
  })

  it("clears single mention trigger at start", () => {
    expect(getTriggerDeleteFallback("@", { acMode: "@", acTriggerPos: 0, isDeleteKey: true })).toBe("")
  })

  it("clears single mention trigger after text", () => {
    expect(getTriggerDeleteFallback("hello @", { acMode: "@", acTriggerPos: 6, isDeleteKey: true })).toBe("hello ")
  })

  it("returns undefined for non-delete or non-trigger states", () => {
    expect(getTriggerDeleteFallback("/", { acMode: "/", acTriggerPos: 0, isDeleteKey: false })).toBeUndefined()
    expect(getTriggerDeleteFallback("@", { acMode: "@", acTriggerPos: 0, isDeleteKey: false })).toBeUndefined()
    expect(getTriggerDeleteFallback("hello @bob", { acMode: "@", acTriggerPos: 6, isDeleteKey: true })).toBeUndefined()
    expect(getTriggerDeleteFallback("/", { acMode: false, acTriggerPos: 0, isDeleteKey: true })).toBeUndefined()
  })
})
