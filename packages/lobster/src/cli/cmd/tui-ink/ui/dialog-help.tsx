/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React from "react"
import { useDialog } from "./dialog"
import { KeyHints, PanelHeader, StatusBadge } from "./chrome"
import { useDesignTokens } from "./design"

const shortcuts = [
  { key: "Tab", desc: "Cycle agent" },
  { key: "Ctrl+M", desc: "Select model" },
  { key: "Ctrl+A", desc: "Select agent" },
  { key: "Ctrl+S", desc: "Logbook list" },
  { key: "Ctrl+K", desc: "Command palette" },
  { key: "Ctrl+T", desc: "Cycle dock side" },
  { key: "Alt+1..4", desc: "Quick-switch panel tabs" },
  { key: "Alt+H/L", desc: "Vim tab navigation" },
  { key: "Alt+J/K", desc: "Vim panel navigation" },
  { key: "Ctrl+C", desc: "Interrupt / Exit" },
  { key: "Esc", desc: "Close dialog" },
  { key: "Enter", desc: "Submit / Select" },
] as const

export function DialogHelp() {
  const tokens = useDesignTokens()
  const dialog = useDialog()

  useInput((_ch, key) => {
    if (key.escape || key.return) dialog.clear()
  })

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <PanelHeader title="Keyboard Shortcuts" right="esc close" />
      <Box flexDirection="column" marginTop={1}>
        {shortcuts.map((s) => (
          <Box key={s.key} gap={2}>
            <Box width={12}>
              <Text color={tokens.text.accent} bold>{s.key}</Text>
            </Box>
            <Text color={tokens.text.muted}>{s.desc}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <StatusBadge tone="accent" label="enter/esc close" />
      </Box>
      <KeyHints items={["enter close", "esc close"]} />
    </Box>
  )
}
