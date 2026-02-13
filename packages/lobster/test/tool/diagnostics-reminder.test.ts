import { test, expect, describe } from "bun:test"
import { DiagnosticsReminder } from "../../src/tool/diagnostics-reminder"

describe("DiagnosticsReminder.EDIT_TOOLS", () => {
  test("contains expected tools", () => {
    expect(DiagnosticsReminder.EDIT_TOOLS).toContain("edit")
    expect(DiagnosticsReminder.EDIT_TOOLS).toContain("write")
    expect(DiagnosticsReminder.EDIT_TOOLS).toContain("multiedit")
    expect(DiagnosticsReminder.EDIT_TOOLS).toContain("apply_patch")
    expect(DiagnosticsReminder.EDIT_TOOLS).toHaveLength(4)
  })
})

describe("DiagnosticsReminder.hadRecentEdits", () => {
  test("returns true when completed edit tool found", () => {
    const parts = [
      { type: "tool", tool: "edit", state: { status: "completed" } },
    ]
    expect(DiagnosticsReminder.hadRecentEdits(parts)).toBe(true)
  })

  test("returns true when completed write tool found", () => {
    const parts = [
      { type: "tool", tool: "write", state: { status: "completed" } },
    ]
    expect(DiagnosticsReminder.hadRecentEdits(parts)).toBe(true)
  })

  test("returns true when completed multiedit tool found", () => {
    const parts = [
      { type: "tool", tool: "multiedit", state: { status: "completed" } },
    ]
    expect(DiagnosticsReminder.hadRecentEdits(parts)).toBe(true)
  })

  test("returns true when completed apply_patch tool found", () => {
    const parts = [
      { type: "tool", tool: "apply_patch", state: { status: "completed" } },
    ]
    expect(DiagnosticsReminder.hadRecentEdits(parts)).toBe(true)
  })

  test("returns false for non-edit tools", () => {
    const parts = [
      { type: "tool", tool: "bash", state: { status: "completed" } },
      { type: "tool", tool: "read", state: { status: "completed" } },
    ]
    expect(DiagnosticsReminder.hadRecentEdits(parts)).toBe(false)
  })

  test("returns false for edit tool that is not completed", () => {
    const parts = [
      { type: "tool", tool: "edit", state: { status: "error" } },
      { type: "tool", tool: "write", state: { status: "running" } },
    ]
    expect(DiagnosticsReminder.hadRecentEdits(parts)).toBe(false)
  })

  test("returns false for non-tool parts", () => {
    const parts = [
      { type: "text" },
      { type: "reasoning" },
    ]
    expect(DiagnosticsReminder.hadRecentEdits(parts)).toBe(false)
  })

  test("returns false for empty array", () => {
    expect(DiagnosticsReminder.hadRecentEdits([])).toBe(false)
  })

  test("mixed parts with one completed edit returns true", () => {
    const parts = [
      { type: "text" },
      { type: "tool", tool: "bash", state: { status: "completed" } },
      { type: "tool", tool: "edit", state: { status: "completed" } },
      { type: "tool", tool: "read", state: { status: "completed" } },
    ]
    expect(DiagnosticsReminder.hadRecentEdits(parts)).toBe(true)
  })
})

describe("DiagnosticsReminder.format", () => {
  test("empty errors returns empty string", () => {
    expect(DiagnosticsReminder.format([])).toBe("")
  })

  test("formats single error correctly", () => {
    const errors: DiagnosticsReminder.FormattedDiagnostic[] = [
      {
        file: "/project/src/index.ts",
        relativePath: "src/index.ts",
        line: 42,
        severity: 1,
        message: "Type 'string' is not assignable to type 'number'",
      },
    ]
    const result = DiagnosticsReminder.format(errors)
    expect(result).toContain("<system-reminder>")
    expect(result).toContain("</system-reminder>")
    expect(result).toContain("New diagnostics detected after edits:")
    expect(result).toContain("src/index.ts:42: Type 'string' is not assignable to type 'number'")
  })

  test("formats multiple errors", () => {
    const errors: DiagnosticsReminder.FormattedDiagnostic[] = [
      { file: "/a.ts", relativePath: "a.ts", line: 1, severity: 1, message: "error1" },
      { file: "/b.ts", relativePath: "b.ts", line: 2, severity: 1, message: "error2" },
    ]
    const result = DiagnosticsReminder.format(errors)
    expect(result).toContain("a.ts:1: error1")
    expect(result).toContain("b.ts:2: error2")
  })

  test("truncates at maxCount", () => {
    const errors: DiagnosticsReminder.FormattedDiagnostic[] = Array.from({ length: 25 }, (_, i) => ({
      file: `/file${i}.ts`,
      relativePath: `file${i}.ts`,
      line: i + 1,
      severity: 1,
      message: `error ${i}`,
    }))
    const result = DiagnosticsReminder.format(errors)
    // Default maxCount is 20
    expect(result).toContain("file0.ts:1: error 0")
    expect(result).toContain("file19.ts:20: error 19")
    expect(result).not.toContain("file20.ts")
    expect(result).toContain("... and 5 more")
  })

  test("custom maxCount", () => {
    const errors: DiagnosticsReminder.FormattedDiagnostic[] = Array.from({ length: 5 }, (_, i) => ({
      file: `/file${i}.ts`,
      relativePath: `file${i}.ts`,
      line: i + 1,
      severity: 1,
      message: `error ${i}`,
    }))
    const result = DiagnosticsReminder.format(errors, 3)
    expect(result).toContain("file0.ts:1: error 0")
    expect(result).toContain("file2.ts:3: error 2")
    expect(result).not.toContain("file3.ts")
    expect(result).toContain("... and 2 more")
  })

  test("no suffix when errors count equals maxCount", () => {
    const errors: DiagnosticsReminder.FormattedDiagnostic[] = Array.from({ length: 3 }, (_, i) => ({
      file: `/file${i}.ts`,
      relativePath: `file${i}.ts`,
      line: i + 1,
      severity: 1,
      message: `error ${i}`,
    }))
    const result = DiagnosticsReminder.format(errors, 3)
    expect(result).not.toContain("... and")
  })
})
