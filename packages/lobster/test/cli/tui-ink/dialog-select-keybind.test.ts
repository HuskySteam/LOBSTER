import { describe, expect, test } from "bun:test"
import { Keybind } from "../../../src/util/keybind"
import {
  matchDialogSelectKeybind,
  toDialogSelectKeybindInfo,
} from "../../../src/cli/cmd/tui-ink/ui/dialog-select-keybind"

describe("dialog select keybind matching", () => {
  test("matches ctrl+d when ctrl modifier is pressed", () => {
    const binding = Keybind.parse("ctrl+d")[0]
    expect(matchDialogSelectKeybind(binding, "d", { ctrl: true })).toBe(true)
  })

  test("does not match ctrl+d without ctrl modifier", () => {
    const binding = Keybind.parse("ctrl+d")[0]
    expect(matchDialogSelectKeybind(binding, "d", {})).toBe(false)
  })

  test("does not match leader keybind in ink dialog", () => {
    const binding = Keybind.parse("<leader>d")[0]
    expect(matchDialogSelectKeybind(binding, "d", { ctrl: true })).toBe(false)
  })

  test("maps arrow keys to keybind names", () => {
    expect(toDialogSelectKeybindInfo("", { downArrow: true })).toEqual({
      name: "down",
      ctrl: false,
      meta: false,
      shift: false,
      super: false,
      leader: false,
    })
  })
})
