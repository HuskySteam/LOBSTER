import { describe, expect, it } from "bun:test"
import { normalizePromptInput } from "../../../src/cli/cmd/tui-ink/component/prompt/input-normalize"

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
  })

  it("applies delete semantics", () => {
    expect(normalizePromptInput("/\u007f")).toBe("")
    expect(normalizePromptInput("abc\u007f")).toBe("ab")
  })

  it("handles mixed deletes and controls", () => {
    expect(normalizePromptInput("ab\u0008c\u007fd")).toBe("ad")
  })
})

