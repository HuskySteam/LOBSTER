import { describe, expect, test } from "bun:test"
import {
  computeAutocompleteLayout,
  truncateWithEllipsis,
} from "../../../src/cli/cmd/tui-ink/component/prompt/autocomplete-layout"

describe("autocomplete layout", () => {
  test("truncates long strings with ellipsis", () => {
    expect(truncateWithEllipsis("abcdefghijklmnopqrstuvwxyz", 10)).toBe("abcdefg...")
  })

  test("does not truncate short strings", () => {
    expect(truncateWithEllipsis("short", 10)).toBe("short")
  })

  test("returns dotted filler for very small width", () => {
    expect(truncateWithEllipsis("abcdef", 2)).toBe("..")
  })

  test("hides description on narrow widths", () => {
    const result = computeAutocompleteLayout(48)
    expect(result.showDescription).toBe(false)
    expect(result.descriptionWidth).toBe(0)
  })

  test("shows description on wider widths", () => {
    const result = computeAutocompleteLayout(80)
    expect(result.showDescription).toBe(true)
    expect(result.labelWidth).toBeGreaterThanOrEqual(18)
    expect(result.descriptionWidth).toBeGreaterThanOrEqual(12)
  })
})
