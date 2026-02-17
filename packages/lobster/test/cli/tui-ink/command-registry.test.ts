import { describe, expect, test } from "bun:test"
import { BUILT_IN_COMMANDS, parseSlashCommand, resolveBuiltInCommand } from "../../../src/cli/cmd/tui-ink/component/prompt/command-registry"

describe("tui-ink command registry", () => {
  test("parses slash command with args", () => {
    expect(parseSlashCommand("/export session.md")).toEqual({
      name: "export",
      args: "session.md",
    })
  })

  test("parses slash command without args", () => {
    expect(parseSlashCommand("/status")).toEqual({
      name: "status",
      args: "",
    })
  })

  test("returns null for non-slash input", () => {
    expect(parseSlashCommand("status")).toBeNull()
    expect(parseSlashCommand("")).toBeNull()
  })

  test("resolves aliases to canonical commands", () => {
    expect(resolveBuiltInCommand("models")?.name).toBe("model")
    expect(resolveBuiltInCommand("agents")?.name).toBe("agent")
    expect(resolveBuiltInCommand("mcps")?.name).toBe("mcp")
    expect(resolveBuiltInCommand("themes")?.name).toBe("theme")
    expect(resolveBuiltInCommand("shortcuts")?.name).toBe("keybinds")
    expect(resolveBuiltInCommand("plugins")?.name).toBe("plugin")
    expect(resolveBuiltInCommand("summarize")?.name).toBe("compact")
    expect(resolveBuiltInCommand("q")?.name).toBe("exit")
  })

  test("contains required parity commands", () => {
    const names = new Set(BUILT_IN_COMMANDS.map((x) => x.name))
    expect(names.has("review")).toBe(true)
    expect(names.has("findings")).toBe(true)
    expect(names.has("health")).toBe(true)
    expect(names.has("patterns")).toBe(true)
    expect(names.has("share")).toBe(true)
    expect(names.has("rename")).toBe(true)
    expect(names.has("compact")).toBe(true)
    expect(names.has("undo")).toBe(true)
    expect(names.has("redo")).toBe(true)
    expect(names.has("copy")).toBe(true)
    expect(names.has("export")).toBe(true)
  })
})
