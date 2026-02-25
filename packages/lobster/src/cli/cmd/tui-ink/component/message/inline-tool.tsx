/** @jsxImportSource react */
import { Box, Text } from "ink"
import React from "react"
import { Spinner } from "../spinner"
import type { ReactNode } from "react"
import { useDesignTokens } from "../../ui/design"
import { StatusBadge } from "../../ui/chrome"

export function InlineTool(props: {
  icon: string
  iconColor?: string
  complete: any
  pending: string
  children: ReactNode
  status: string
  error?: string
}) {
  const tokens = useDesignTokens()

  const isDenied =
    props.error?.includes("rejected permission") ||
    props.error?.includes("specified a rule") ||
    props.error?.includes("user dismissed")

  const isRunning = props.status === "running" || props.status === "pending"

  const fg = isRunning ? tokens.text.primary : props.complete ? tokens.text.muted : tokens.text.primary

  if (isRunning && props.complete) {
    return (
      <Box paddingLeft={1} gap={1}>
        <Spinner>
          <Text color={tokens.text.primary}>{props.children}</Text>
        </Spinner>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Box>
        <Text color={props.complete ? tokens.text.accent : tokens.text.muted}>{props.complete ? props.icon : "○"}</Text>
        <Text color={fg} strikethrough={isDenied}>
          {" "}
          {props.complete ? props.children : props.pending}
        </Text>
      </Box>
      {props.error && !isDenied && <Text color={tokens.status.error}>{props.error}</Text>}
    </Box>
  )
}
