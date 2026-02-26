import { describe, expect, test } from "bun:test"
import { formatTerminalHyperlink } from "../../../src/cli/cmd/tui-ink/ui/link"

describe("tui-ink link formatting", () => {
  test("encodes OSC-8 hyperlink with full href and short label", () => {
    const href = "https://example.com/oauth/authorize?client_id=abc&redirect_uri=https%3A%2F%2Flocalhost%2Fcb"
    const label = "Open authorization URL"
    const encoded = formatTerminalHyperlink(label, href)

    expect(encoded.startsWith("\u001B]8;;")).toBe(true)
    expect(encoded.includes(href)).toBe(true)
    expect(encoded.includes(label)).toBe(true)
    expect(encoded.endsWith("\u001B]8;;\u0007")).toBe(true)
  })
})
