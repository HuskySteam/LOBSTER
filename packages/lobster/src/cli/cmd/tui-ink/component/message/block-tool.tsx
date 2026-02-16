/** @jsxImportSource react */
import { Box, Text } from "ink"
import React from "react"
import { useTheme } from "../../theme"
import { Spinner } from "../spinner"
import type { ReactNode } from "react"

export function BlockTool(props: {
  title: string
  children: ReactNode
  error?: string
  spinner?: boolean
}) {
  const { theme } = useTheme()
  const title = props.title.replace(/^# /, "")

  return (
    <Box flexDirection="column" paddingLeft={2} marginTop={1} gap={0}>
      {props.spinner ? (
        <Spinner><Text bold>{title}</Text></Spinner>
      ) : (
        <Text color={theme.text} bold>{title}</Text>
      )}
      {props.children}
      {props.error && (
        <Text color={theme.error}>{props.error}</Text>
      )}
    </Box>
  )
}
