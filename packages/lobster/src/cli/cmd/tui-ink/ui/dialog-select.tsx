/** @jsxImportSource react */
import { Box, Text, useInput, useStdout } from "ink"
import TextInput from "ink-text-input"
import React, { useState, useMemo, useCallback, useEffect, type ReactNode } from "react"
import { Keybind } from "@/util/keybind"
import { useDialog } from "./dialog"
import { matchDialogSelectKeybind } from "./dialog-select-keybind"
import { useHotkeyInputGuard } from "./hotkey-input-guard"
import { EmptyState, KeyHints, PanelHeader, StatusBadge } from "./chrome"
import { useDesignTokens } from "./design"

export interface DialogSelectOption<T = any> {
  title: string
  value: T
  description?: string
  footer?: string
  category?: string
  disabled?: boolean
}

interface DialogSelectProps<T> {
  title: string
  placeholder?: string
  options: DialogSelectOption<T>[]
  current?: T
  isEqual?: (left: T, right: T) => boolean
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

function truncateLine(value: string, width: number) {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (width <= 0) return ""
  if (normalized.length <= width) return normalized
  if (width <= 3) return ".".repeat(width)
  return `${normalized.slice(0, width - 3)}...`
}

export function DialogSelect<T>(props: DialogSelectProps<T>) {
  const tokens = useDesignTokens()
  const { stdout } = useStdout()
  const dialog = useDialog()
  const { markHotkeyConsumed, wrapOnChange } = useHotkeyInputGuard()
  const [selected, setSelected] = useState(0)
  const [filter, setFilter] = useState("")

  const isEqual = useMemo(() => {
    if (props.isEqual) return props.isEqual
    return (left: T, right: T) => {
      if (Object.is(left, right)) return true
      try {
        return JSON.stringify(left) === JSON.stringify(right)
      } catch {
        return false
      }
    }
  }, [props.isEqual])

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
  const activeKeybinds = useMemo(() => (props.keybind ?? []).filter((x) => !x.disabled && x.keybind), [props.keybind])
  const lineWidth = useMemo(() => {
    const columns = stdout?.columns ?? 80
    return Math.max(24, columns - 16)
  }, [stdout?.columns])

  useEffect(() => {
    if (flat.length === 0) {
      setSelected((prev) => (prev === 0 ? prev : 0))
      return
    }

    setSelected((prev) => {
      let next = prev
      if (props.current !== undefined) {
        const idx = flat.findIndex((x) => isEqual(x.value, props.current as T))
        if (idx >= 0) next = idx
      }
      if (next >= flat.length) next = flat.length - 1
      return prev === next ? prev : next
    })
  }, [flat, props.current, isEqual])

  const handleFilter = useCallback(
    (value: string) => {
      setFilter(value)
      props.onFilter?.(value)
    },
    [props.onFilter],
  )
  const guardedFilterChange = useMemo(() => wrapOnChange(handleFilter), [handleFilter, wrapOnChange])

  useEffect(() => {
    const next = selected >= 0 && selected < flat.length ? flat[selected] : undefined
    props.onMove?.(next)
  }, [selected, flat, props.onMove])

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

  const optionKey = useCallback((opt: DialogSelectOption<T>) => {
    let value = ""
    try {
      value = JSON.stringify(opt.value)
    } catch {
      value = String(opt.value)
    }
    return `${opt.category ?? ""}:${opt.title}:${value}`
  }, [])

  let globalIndex = scrollOffset

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <PanelHeader title={props.title} right="esc close" />

      <Box marginTop={1}>
        <Text color={tokens.text.accent}>{"> "}</Text>
        <TextInput value={filter} onChange={guardedFilterChange} placeholder={props.placeholder ?? "Search..."} />
      </Box>

      {flat.length === 0 ? (
        <EmptyState title="No results found" detail="Adjust your search query." />
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {scrollOffset > 0 && <Text color={tokens.text.muted}> ... {scrollOffset} more above</Text>}
          {visibleItems.map((opt) => {
            const idx = globalIndex++
            const isSelected = idx === selected
            const isCurrent = props.current !== undefined && isEqual(opt.value, props.current as T)
            const marker = isSelected ? ">" : " "
            const hasDetails = !!(opt.description || opt.footer)
            const availableWidth = Math.max(16, lineWidth - (isCurrent ? 10 : 0))
            const titleWidth = hasDetails ? Math.max(12, Math.floor(availableWidth * 0.45)) : availableWidth
            const detailWidth = Math.max(10, availableWidth - titleWidth - 2)
            const title = truncateLine(opt.title, titleWidth)
            const details = hasDetails
              ? truncateLine([opt.description, opt.footer].filter(Boolean).join(" | "), detailWidth)
              : ""
            return (
              <Box key={optionKey(opt)} flexDirection="row" paddingLeft={1} paddingRight={1}>
                <Text
                  color={isSelected ? tokens.list.selectedText : tokens.list.marker}
                  backgroundColor={isSelected ? tokens.list.selectedBackground : undefined}
                >
                  {marker}{" "}
                </Text>
                <Text
                  color={isSelected ? tokens.list.selectedText : tokens.text.primary}
                  bold={isSelected}
                  backgroundColor={isSelected ? tokens.list.selectedBackground : undefined}
                >
                  {title}
                </Text>
                {isCurrent ? (
                  <>
                    <Text
                      color={isSelected ? tokens.list.selectedText : tokens.text.muted}
                      backgroundColor={isSelected ? tokens.list.selectedBackground : undefined}
                    >
                      {" "}
                    </Text>
                    <StatusBadge label="current" tone={isSelected ? "accent" : "muted"} />
                  </>
                ) : null}
                {details ? (
                  <Text
                    color={isSelected ? tokens.list.selectedText : tokens.text.muted}
                    backgroundColor={isSelected ? tokens.list.selectedBackground : undefined}
                  >
                    {"-"} {details}
                  </Text>
                ) : null}
              </Box>
            )
          })}
          {scrollOffset + maxVisible < flat.length && (
            <Text color={tokens.text.muted}>
              {"  "}... {flat.length - scrollOffset - maxVisible} more below
            </Text>
          )}
        </Box>
      )}

      {props.footer ?? (
        <KeyHints
          items={[
            "up/down navigate",
            "enter select",
            "esc close",
            ...activeKeybinds.map((item) =>
              `${item.title} ${item.keybind ? Keybind.toString(item.keybind) : ""}`.trim(),
            ),
          ]}
        />
      )}
    </Box>
  )
}
