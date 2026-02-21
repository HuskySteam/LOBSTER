/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import TextInput from "ink-text-input"
import React, { useState, useMemo, useCallback, useEffect, type ReactNode } from "react"
import { Keybind } from "@/util/keybind"
import { useTheme } from "../theme"
import { useDialog } from "./dialog"
import { matchDialogSelectKeybind } from "./dialog-select-keybind"
import { useHotkeyInputGuard } from "./hotkey-input-guard"

export interface DialogSelectOption<T = any> {
  title: string
  value: T
  description?: string
  footer?: string
  category?: string
  disabled?: boolean
}

export interface DialogSelectProps<T> {
  title: string
  placeholder?: string
  options: DialogSelectOption<T>[]
  current?: T
  onSelect?: (option: DialogSelectOption<T>) => void
  onFilter?: (query: string) => void
  onMove?: (option: DialogSelectOption<T> | undefined) => void
  skipFilter?: boolean
  footer?: ReactNode
  keybind?: {
    keybind?: Keybind.Info
    title: string
    disabled?: boolean
    onTrigger: (option: DialogSelectOption<T>) => void
  }[]
}

export function DialogSelect<T>(props: DialogSelectProps<T>) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const { markHotkeyConsumed, wrapOnChange } = useHotkeyInputGuard()
  const [selected, setSelected] = useState(0)
  const [filter, setFilter] = useState("")

  const filtered = useMemo(() => {
    const items = props.options.filter((x) => !x.disabled)
    if (props.skipFilter || !filter) return items
    const needle = filter.toLowerCase()
    return items.filter(
      (x) =>
        x.title.toLowerCase().includes(needle) ||
        x.category?.toLowerCase().includes(needle) ||
        x.description?.toLowerCase().includes(needle),
    )
  }, [props.options, props.skipFilter, filter])

  const grouped = useMemo(() => {
    const groups: [string, DialogSelectOption<T>[]][] = []
    const map = new Map<string, DialogSelectOption<T>[]>()
    for (const item of filtered) {
      const key = item.category ?? ""
      const arr = map.get(key)
      if (arr) {
        arr.push(item)
      } else {
        const next = [item]
        map.set(key, next)
        groups.push([key, next])
      }
    }
    return groups
  }, [filtered])

  const flat = useMemo(() => grouped.flatMap(([, items]) => items), [grouped])
  const activeKeybinds = useMemo(
    () => (props.keybind ?? []).filter((x) => !x.disabled && x.keybind),
    [props.keybind],
  )

  useEffect(() => {
    if (flat.length === 0) {
      setSelected(0)
      return
    }

    let next = selected
    if (props.current !== undefined) {
      const idx = flat.findIndex((x) => JSON.stringify(x.value) === JSON.stringify(props.current))
      if (idx >= 0) next = idx
    }

    if (next >= flat.length) next = flat.length - 1
    setSelected((prev) => (prev === next ? prev : next))
  }, [flat, props.current, selected])

  const handleFilter = useCallback(
    (value: string) => {
      setFilter(value)
      props.onFilter?.(value)
    },
    [props.onFilter],
  )
  const guardedFilterChange = useMemo(
    () => wrapOnChange(handleFilter),
    [handleFilter, wrapOnChange],
  )

  useEffect(() => {
    props.onMove?.(flat[selected])
  }, [selected])

  useInput((ch, key) => {
    if (key.escape) {
      dialog.clear()
      return
    }

    if (key.upArrow) {
      if (flat.length === 0) return
      const next = (selected - 1 + flat.length) % flat.length
      if (next === selected) return
      setSelected(next)
      return
    }

    if (key.downArrow) {
      if (flat.length === 0) return
      const next = (selected + 1) % flat.length
      if (next === selected) return
      setSelected(next)
      return
    }

    if (key.return) {
      const opt = flat[selected]
      if (opt) props.onSelect?.(opt)
      return
    }

    for (const item of activeKeybinds) {
      if (!item.keybind) continue
      if (!matchDialogSelectKeybind(item.keybind, ch, key)) continue
      markHotkeyConsumed()
      const opt = flat[selected]
      if (!opt) return
      item.onTrigger(opt)
      return
    }
  })

  const maxVisible = 15
  const scrollOffset = useMemo(() => {
    if (flat.length <= maxVisible) return 0
    const half = Math.floor(maxVisible / 2)
    if (selected < half) return 0
    if (selected > flat.length - maxVisible + half) return flat.length - maxVisible
    return selected - half
  }, [selected, flat.length])

  const visibleItems = useMemo(() => flat.slice(scrollOffset, scrollOffset + maxVisible), [flat, scrollOffset])

  let globalIndex = scrollOffset

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Box justifyContent="space-between">
        <Text color={theme.text} bold>
          {props.title}
        </Text>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={theme.textMuted}>{"> "}</Text>
        <TextInput
          value={filter}
          onChange={guardedFilterChange}
          placeholder={props.placeholder ?? "Search..."}
        />
      </Box>

      {flat.length === 0 ? (
        <Box marginTop={1}>
          <Text color={theme.textMuted}>No results found</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {scrollOffset > 0 && <Text color={theme.textMuted}>  ... {scrollOffset} more above</Text>}
          {visibleItems.map((opt) => {
            const idx = globalIndex++
            const isSelected = idx === selected
            const isCurrent =
              props.current !== undefined && JSON.stringify(opt.value) === JSON.stringify(props.current)
            return (
              <Box key={idx} flexDirection="row">
                <Text color={isCurrent ? theme.primary : theme.textMuted}>{isCurrent ? "* " : "  "}</Text>
                <Text color={isSelected ? theme.secondary : theme.text} bold={isSelected}>
                  {opt.title}
                </Text>
                {opt.description && <Text color={theme.textMuted}> {opt.description}</Text>}
                {opt.footer && <Text color={theme.textMuted}> {opt.footer}</Text>}
              </Box>
            )
          })}
          {scrollOffset + maxVisible < flat.length && (
            <Text color={theme.textMuted}>{"  "}... {flat.length - scrollOffset - maxVisible} more below</Text>
          )}
        </Box>
      )}

      {props.footer ?? (
        <Box marginTop={1} gap={2}>
          <Text color={theme.textMuted}>up/down navigate</Text>
          <Text color={theme.textMuted}>enter select</Text>
          <Text color={theme.textMuted}>esc close</Text>
          {activeKeybinds.map((item) => (
            <Text
              key={`${item.title}:${item.keybind ? Keybind.toString(item.keybind) : ""}`}
              color={theme.textMuted}
            >
              {item.title} {item.keybind ? Keybind.toString(item.keybind) : ""}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  )
}
