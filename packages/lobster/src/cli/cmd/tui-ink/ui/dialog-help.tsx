/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React from "react"
import { useTheme } from "../theme"
import { useDialog } from "./dialog"

const shortcuts = [
  { key: "Tab", desc: "Cycle agent" },
  { key: "Ctrl+M", desc: "Select model" },
  { key: "Ctrl+A", desc: "Select agent" },
  { key: "Ctrl+S", desc: "Session list" },
  { key: "Ctrl+C", desc: "Interrupt / Exit" },
  { key: "Esc", desc: "Close dialog" },
  { key: "Enter", desc: "Submit / Select" },
] as const

export function DialogHelp() {
  const { theme } = useTheme()
  const dialog = useDialog()

  useInput((_ch, key) => {
    if (key.escape || key.return) dialog.clear()
  })

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Text color={theme.text} bold>
        Keyboard Shortcuts
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {shortcuts.map((s) => (
          <Box key={s.key} gap={2}>
            <Box width={12}>
              <Text color={theme.accent} bold>{s.key}</Text>
            </Box>
            <Text color={theme.textMuted}>{s.desc}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.textMuted}>Press esc or enter to close</Text>
      </Box>
    </Box>
  )
}
