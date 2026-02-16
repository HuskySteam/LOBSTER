/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React from "react"
import { useTheme } from "../theme"
import { useDialog } from "../ui/dialog"

export function DialogReviewDashboard() {
  const { theme } = useTheme()
  const dialog = useDialog()

  useInput((_ch, key) => {
    if (key.escape || key.return) dialog.clear()
  })

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Box justifyContent="space-between">
        <Text color={theme.text} bold>Review Dashboard</Text>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.textMuted}>
          No active review loop. Run <Text color={theme.text}>/review</Text> to start a review cycle.
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>
    </Box>
  )
}
