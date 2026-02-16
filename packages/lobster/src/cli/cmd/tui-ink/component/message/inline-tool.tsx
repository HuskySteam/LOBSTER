/** @jsxImportSource react */
import { Box, Text } from "ink"
import React from "react"
import { useTheme } from "../../theme"
import { Spinner } from "../spinner"
import type { ReactNode } from "react"

export function InlineTool(props: {
  icon: string
  iconColor?: string
  complete: any
  pending: string
  children: ReactNode
  status: string
  error?: string
}) {
  const { theme } = useTheme()

  const isDenied =
    props.error?.includes("rejected permission") ||
    props.error?.includes("specified a rule") ||
    props.error?.includes("user dismissed")

  const isRunning = props.status === "running" || props.status === "pending"

  const fg = isRunning ? theme.text
    : props.complete ? theme.textMuted
    : theme.text

  if (isRunning && props.complete) {
    return (
      <Box paddingLeft={2}>
        <Spinner>
          <Text color={theme.text}>{props.children}</Text>
        </Spinner>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Text
        color={fg}
        strikethrough={isDenied}
      >
        {props.complete
          ? <><Text color={props.iconColor ?? theme.accent} bold>{props.icon}</Text> {props.children}</>
          : <>~ {props.pending}</>
        }
      </Text>
      {props.error && !isDenied && (
        <Text color={theme.error}>{props.error}</Text>
      )}
    </Box>
  )
}
