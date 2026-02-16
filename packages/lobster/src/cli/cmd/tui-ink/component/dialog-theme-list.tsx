/** @jsxImportSource react */
import React, { useMemo, useRef, useCallback } from "react"
import { useTheme } from "../theme"
import { useDialog } from "../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"

export function DialogThemeList() {
  const themeCtx = useTheme()
  const dialog = useDialog()
  const initial = useRef(themeCtx.selected)

  const options = useMemo<DialogSelectOption<string>[]>(() => {
    const all = themeCtx.all()
    return Object.keys(all).sort().map((name) => ({
      title: name,
      value: name,
      footer: name === themeCtx.selected ? "(current)" : undefined,
    }))
  }, [themeCtx])

  const handleSelect = useCallback(
    (opt: DialogSelectOption<string>) => {
      themeCtx.set(opt.value)
      dialog.clear()
    },
    [themeCtx, dialog],
  )

  return (
    <DialogSelect
      title="Theme"
      placeholder="Search themes..."
      options={options}
      current={themeCtx.selected}
      onSelect={handleSelect}
    />
  )
}
