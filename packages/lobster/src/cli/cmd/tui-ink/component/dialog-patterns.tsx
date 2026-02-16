/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React from "react"
import { useTheme } from "../theme"
import { useDialog } from "../ui/dialog"

export function DialogPatterns() {
  const { theme } = useTheme()
  const dialog = useDialog()

  useInput((_ch, key) => {
    if (key.escape || key.return) dialog.clear()
  })

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Box justifyContent="space-between">
        <Text color={theme.text} bold>Pattern Insights</Text>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.textMuted}>
          No pattern insights yet. Run <Text color={theme.text}>/patterns</Text> to analyze your codebase.
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>
    </Box>
  )
}
