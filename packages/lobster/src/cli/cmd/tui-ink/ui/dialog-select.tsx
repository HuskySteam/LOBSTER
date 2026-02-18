/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import TextInput from "ink-text-input"
import React, { useState, useMemo, useCallback, useEffect, type ReactNode } from "react"
import { useTheme } from "../theme"
import { useDialog } from "./dialog"

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
  skipFilter?: boolean
  footer?: ReactNode
}

export function DialogSelect<T>(props: DialogSelectProps<T>) {
  const { theme } = useTheme()
  const dialog = useDialog()
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

  // Group by category
  const grouped = useMemo(() => {
    const groups: [string, DialogSelectOption<T>[]][] = []
    const map = new Map<string, DialogSelectOption<T>[]>()
    for (const item of filtered) {
      const key = item.category ?? ""
      const arr = map.get(key)
      if (arr) {
        arr.push(item)
      } else {
        const newArr = [item]
        map.set(key, newArr)
        groups.push([key, newArr])
      }
    }
    return groups
  }, [filtered])

  const flat = useMemo(() => grouped.flatMap(([, items]) => items), [grouped])

  // Reset selection when filter changes
  useEffect(() => {
    if (props.current) {
      const idx = flat.findIndex((x) => JSON.stringify(x.value) === JSON.stringify(props.current))
      if (idx >= 0) {
        setSelected(idx)
        return
      }
    }
    setSelected(0)
  }, [flat, props.current])

  const handleFilter = useCallback(
    (value: string) => {
      setFilter(value)
      props.onFilter?.(value)
    },
    [props.onFilter],
  )

  useInput((ch, key) => {
    if (key.escape) {
      dialog.clear()
      return
    }
    if (key.upArrow) {
      if (flat.length === 0) return
      setSelected((s) => (s - 1 + flat.length) % flat.length)
    }
    if (key.downArrow) {
      if (flat.length === 0) return
      setSelected((s) => (s + 1) % flat.length)
    }
    if (key.return) {
      const opt = flat[selected]
      if (opt) {
        props.onSelect?.(opt)
      }
    }
  })

  // Visible window for scrolling (show max 15 items)
  const maxVisible = 15
  const scrollOffset = useMemo(() => {
    if (flat.length <= maxVisible) return 0
    const half = Math.floor(maxVisible / 2)
    if (selected < half) return 0
    if (selected > flat.length - maxVisible + half) return flat.length - maxVisible
    return selected - half
  }, [selected, flat.length])

  const visibleItems = useMemo(() => {
    return flat.slice(scrollOffset, scrollOffset + maxVisible)
  }, [flat, scrollOffset])

  let globalIndex = scrollOffset

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      {/* Title */}
      <Box justifyContent="space-between">
        <Text color={theme.text} bold>
          {props.title}
        </Text>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>

      {/* Search input */}
      <Box marginTop={1}>
        <Text color={theme.textMuted}>{"> "}</Text>
        <TextInput
          value={filter}
          onChange={handleFilter}
          placeholder={props.placeholder ?? "Search..."}
        />
      </Box>

      {/* Options */}
      {flat.length === 0 ? (
        <Box marginTop={1}>
          <Text color={theme.textMuted}>No results found</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {scrollOffset > 0 && (
            <Text color={theme.textMuted}>  ... {scrollOffset} more above</Text>
          )}
          {visibleItems.map((opt) => {
            const idx = globalIndex++
            const isSelected = idx === selected
            const isCurrent =
              props.current !== undefined && JSON.stringify(opt.value) === JSON.stringify(props.current)
            return (
              <Box key={idx} flexDirection="row">
                <Text color={isCurrent ? theme.primary : theme.textMuted}>
                  {isCurrent ? "● " : "  "}
                </Text>
                <Text
                  color={isSelected ? theme.secondary : theme.text}
                  bold={isSelected}
                >
                  {opt.title}
                </Text>
                {opt.description && (
                  <Text color={theme.textMuted}> {opt.description}</Text>
                )}
                {opt.footer && (
                  <Text color={theme.textMuted}> {opt.footer}</Text>
                )}
              </Box>
            )
          })}
          {scrollOffset + maxVisible < flat.length && (
            <Text color={theme.textMuted}>
              {"  "}... {flat.length - scrollOffset - maxVisible} more below
            </Text>
          )}
        </Box>
      )}

      {/* Footer hints */}
      {props.footer ?? (
        <Box marginTop={1} gap={2}>
          <Text color={theme.textMuted}>{"↑↓ navigate"}</Text>
          <Text color={theme.textMuted}>enter select</Text>
          <Text color={theme.textMuted}>esc close</Text>
        </Box>
      )}
    </Box>
  )
}
