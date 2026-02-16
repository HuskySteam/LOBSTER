/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React, { useState } from "react"
import { useTheme } from "../theme"
import { useDialog } from "./dialog"

interface DialogConfirmProps {
  title: string
  message?: string
  onConfirm: () => void
  onCancel?: () => void
}

export function DialogConfirm(props: DialogConfirmProps) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const [selected, setSelected] = useState(0)
  const options = ["Confirm", "Cancel"] as const

  useInput((ch, key) => {
    if (key.escape) {
      props.onCancel?.()
      dialog.clear()
      return
    }
    if (key.leftArrow) setSelected(0)
    if (key.rightArrow) setSelected(1)
    if (key.return) {
      if (selected === 0) {
        props.onConfirm()
      } else {
        props.onCancel?.()
      }
      dialog.clear()
    }
    if (ch === "y") {
      props.onConfirm()
      dialog.clear()
    }
    if (ch === "n") {
      props.onCancel?.()
      dialog.clear()
    }
  })

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Text color={theme.warning} bold>{props.title}</Text>
      {props.message && (
        <Box marginTop={1}>
          <Text color={theme.textMuted}>{props.message}</Text>
        </Box>
      )}
      <Box marginTop={1} gap={2}>
        {options.map((opt, i) => (
          <Text
            key={i}
            color={i === selected ? theme.text : theme.textMuted}
            bold={i === selected}
            inverse={i === selected}
          >
            {` ${opt} `}
          </Text>
        ))}
      </Box>
      <Box marginTop={1} gap={2}>
        <Text color={theme.textMuted}>y/n</Text>
        <Text color={theme.textMuted}>{"←→ select"}</Text>
        <Text color={theme.textMuted}>enter confirm</Text>
      </Box>
    </Box>
  )
}
