/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React from "react"
import { useTheme } from "../theme"
import { useDialog } from "./dialog"

interface DialogAlertProps {
  title: string
  message: string
  onConfirm?: () => void
}

export function DialogAlert(props: DialogAlertProps) {
  const { theme } = useTheme()
  const dialog = useDialog()

  useInput((_ch, key) => {
    if (key.return || key.escape) {
      props.onConfirm?.()
      dialog.clear()
    }
  })

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Text color={theme.text} bold>{props.title}</Text>
      <Box marginTop={1}>
        <Text color={theme.textMuted}>{props.message}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.textMuted}>enter ok</Text>
      </Box>
    </Box>
  )
}
