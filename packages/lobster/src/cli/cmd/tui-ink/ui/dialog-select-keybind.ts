import { Keybind } from "@/util/keybind"

export type DialogSelectInputKey = {
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  upArrow?: boolean
  downArrow?: boolean
  leftArrow?: boolean
  rightArrow?: boolean
  return?: boolean
  escape?: boolean
  tab?: boolean
  backspace?: boolean
  delete?: boolean
}

function resolveKeyName(ch: string, key: DialogSelectInputKey) {
  if (key.return) return "return"
  if (key.escape) return "escape"
  if (key.upArrow) return "up"
  if (key.downArrow) return "down"
  if (key.leftArrow) return "left"
  if (key.rightArrow) return "right"
  if (key.tab) return "tab"
  if (key.backspace) return "backspace"
  if (key.delete) return "delete"
  if (ch) return ch.toLowerCase()
  return undefined
}

export function toDialogSelectKeybindInfo(
  ch: string,
  key: DialogSelectInputKey,
): Keybind.Info | undefined {
  const name = resolveKeyName(ch, key)
  if (!name) return
  return {
    name,
    ctrl: key.ctrl ?? false,
    meta: key.meta ?? false,
    shift: key.shift ?? false,
    super: false,
    leader: false,
  }
}

export function matchDialogSelectKeybind(
  binding: Keybind.Info | undefined,
  ch: string,
  key: DialogSelectInputKey,
) {
  if (!binding || binding.leader) return false
  const parsed = toDialogSelectKeybindInfo(ch, key)
  if (!parsed) return false
  return Keybind.match(binding, parsed)
}
