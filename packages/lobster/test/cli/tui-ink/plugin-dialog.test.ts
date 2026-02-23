import { describe, expect, test } from "bun:test"
import { resolveInitialPluginTab } from "../../../src/cli/cmd/tui-ink/component/dialog-plugin"

describe("tui-ink plugin dialog", () => {
  test("uses explicit initial tab when provided", () => {
    expect(resolveInitialPluginTab({ initialTab: "add", installedCount: 0 })).toBe("add")
    expect(resolveInitialPluginTab({ initialTab: "marketplace", installedCount: 8 })).toBe("marketplace")
  })

  test("defaults to marketplace when nothing is installed", () => {
    expect(resolveInitialPluginTab({ installedCount: 0 })).toBe("marketplace")
  })

  test("defaults to installed when plugins already exist", () => {
    expect(resolveInitialPluginTab({ installedCount: 1 })).toBe("installed")
    expect(resolveInitialPluginTab({ installedCount: 9 })).toBe("installed")
  })
})
