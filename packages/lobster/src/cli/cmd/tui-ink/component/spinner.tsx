/** @jsxImportSource react */
import { Box, Text } from "ink"
import InkSpinner from "ink-spinner"
import React, { type ReactNode } from "react"
import { useTheme } from "../theme"

export function Spinner(props: { children?: ReactNode; color?: string }) {
  const { theme } = useTheme()
  const color = props.color ?? theme.textMuted

  return (
    <Box flexDirection="row" gap={1}>
      <Text color={color}>
        <InkSpinner type="dots" />
      </Text>
      {props.children && <Text color={color}>{props.children}</Text>}
    </Box>
  )
}
