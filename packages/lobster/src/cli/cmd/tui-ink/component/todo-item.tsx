/** @jsxImportSource react */
import { Box, Text } from "ink"
import React from "react"
import { useTheme } from "../theme"

interface TodoItemProps {
  status: string
  content: string
}

export function TodoItem(props: TodoItemProps) {
  const { theme } = useTheme()
  const icon = props.status === "completed" ? "[✓]"
    : props.status === "in_progress" ? "[●]"
    : "[ ]"
  const color = props.status === "in_progress" ? theme.warning : theme.textMuted

  return (
    <Box>
      <Text color={color}>{icon} </Text>
      <Text color={color}>{props.content}</Text>
    </Box>
  )
}
