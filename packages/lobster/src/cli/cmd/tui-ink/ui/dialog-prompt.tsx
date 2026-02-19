/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import TextInput from "ink-text-input"
import React, { useMemo, useState, type ReactNode } from "react"
import { useTheme } from "../theme"
import { useDialog } from "./dialog"
import { useHotkeyInputGuard } from "./hotkey-input-guard"

interface DialogPromptProps {
  title: string
  description?: ReactNode
  placeholder?: string
  value?: string
  onConfirm: (value: string) => void
}

export function DialogPrompt(props: DialogPromptProps) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const { markHotkeyConsumed, wrapOnChange } = useHotkeyInputGuard()
  const [value, setValue] = useState(props.value ?? "")
  const guardedValueChange = useMemo(
    () => wrapOnChange(setValue),
    [wrapOnChange],
  )

  useInput((_ch, key) => {
    if (!key.escape) return
    markHotkeyConsumed()
    dialog.clear()
  })

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Box justifyContent="space-between">
        <Text color={theme.text} bold>{props.title}</Text>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>

      {props.description && (
        <Box marginTop={1}>{props.description}</Box>
      )}

      <Box marginTop={1}>
        <Text color={theme.textMuted}>{"> "}</Text>
        <TextInput
          value={value}
          onChange={guardedValueChange}
          onSubmit={(v) => props.onConfirm(v)}
          placeholder={props.placeholder ?? ""}
        />
      </Box>

      <Box marginTop={1} gap={2}>
        <Text color={theme.textMuted}>enter submit</Text>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>
    </Box>
  )
}
