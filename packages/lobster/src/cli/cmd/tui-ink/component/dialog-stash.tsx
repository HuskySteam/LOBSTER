/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React, { useState, useMemo } from "react"
import { useTheme } from "../theme"
import { useDialog } from "../ui/dialog"

interface StashEntry {
  input: string
  timestamp: number
}

interface DialogStashProps {
  entries?: StashEntry[]
  onSelect?: (entry: StashEntry) => void
}

function getRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function DialogStash(props: DialogStashProps) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const [selected, setSelected] = useState(0)

  const entries = useMemo(
    () => [...(props.entries ?? [])].reverse(),
    [props.entries],
  )

  useInput((_ch, key) => {
    if (key.escape) { dialog.clear(); return }
    if (key.upArrow) setSelected((s) => Math.max(0, s - 1))
    if (key.downArrow) setSelected((s) => Math.min(entries.length - 1, s + 1))
    if (key.return) {
      const entry = entries[selected]
      if (entry) {
        props.onSelect?.(entry)
        dialog.clear()
      }
    }
  })

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Box justifyContent="space-between">
        <Text color={theme.text} bold>Prompt History</Text>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>

      {entries.length === 0 ? (
        <Box marginTop={1}>
          <Text color={theme.textMuted}>No saved prompts.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {entries.slice(0, 15).map((entry, i) => {
            const isSel = i === selected
            const preview = entry.input.split("\n")[0]?.slice(0, 50) ?? ""
            const lines = entry.input.split("\n").length
            return (
              <Box key={i}>
                <Text color={isSel ? theme.secondary : theme.textMuted}>
                  {isSel ? "> " : "  "}
                </Text>
                <Text color={isSel ? theme.text : theme.textMuted}>{preview}</Text>
                {lines > 1 && <Text color={theme.textMuted} dimColor> ({lines} lines)</Text>}
                <Text color={theme.textMuted} dimColor> {getRelativeTime(entry.timestamp)}</Text>
              </Box>
            )
          })}
        </Box>
      )}

      <Box marginTop={1} gap={2}>
        <Text color={theme.textMuted}>{"↑↓ navigate"}</Text>
        <Text color={theme.textMuted}>enter select</Text>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>
    </Box>
  )
}
