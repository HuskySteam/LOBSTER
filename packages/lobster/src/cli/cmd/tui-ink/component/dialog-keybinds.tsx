/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React from "react"
import { useTheme } from "../theme"
import { useDialog } from "../ui/dialog"

const KEYBIND_GROUPS = [
  {
    title: "Session",
    bindings: [
      { action: "Browse sessions", key: "Ctrl+S" },
      { action: "Interrupt agent", key: "Ctrl+C" },
      { action: "Exit", key: "Ctrl+C (×2)" },
    ],
  },
  {
    title: "Agent & Model",
    bindings: [
      { action: "Cycle agent", key: "Tab" },
      { action: "Pick agent", key: "Ctrl+A" },
      { action: "Pick model", key: "Ctrl+M" },
    ],
  },
  {
    title: "Navigation",
    bindings: [
      { action: "Command palette", key: "Ctrl+P" },
      { action: "Connect provider", key: "Ctrl+O" },
      { action: "Toggle sidebar", key: "Ctrl+T" },
    ],
  },
  {
    title: "System",
    bindings: [
      { action: "Keyboard shortcuts", key: "Ctrl+/" },
    ],
  },
]

export function DialogKeybinds() {
  const { theme } = useTheme()
  const dialog = useDialog()

  useInput((_ch, key) => {
    if (key.escape || key.return) dialog.clear()
  })

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Box justifyContent="space-between">
        <Text color={theme.text} bold>Keyboard Shortcuts</Text>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>

      {KEYBIND_GROUPS.map((group) => (
        <Box key={group.title} flexDirection="column" marginTop={1}>
          <Text color={theme.accent} bold>{group.title}</Text>
          {group.bindings.map((binding) => (
            <Box key={binding.action} justifyContent="space-between" paddingLeft={1}>
              <Text color={theme.textMuted}>{binding.action}</Text>
              <Text color={theme.text}>{binding.key}</Text>
            </Box>
          ))}
        </Box>
      ))}

      <Box marginTop={1}>
        <Text color={theme.textMuted}>enter/esc close</Text>
      </Box>
    </Box>
  )
}
