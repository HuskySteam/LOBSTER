/** @jsxImportSource react */
import { Box, Text } from "ink"
import React from "react"
import { Spinner } from "../spinner"
import type { ReactNode } from "react"
import { useDesignTokens } from "../../ui/design"

export function BlockTool(props: { title: string; children: ReactNode; error?: string; spinner?: boolean }) {
  const tokens = useDesignTokens()
  const title = props.title.replace(/^# /, "")

  return (
    <Box flexDirection="column" paddingLeft={2} marginTop={1}>
      <Box gap={1}>
        {props.spinner ? (
          <Spinner>
            <Text color={tokens.text.muted}>{title}</Text>
          </Spinner>
        ) : (
          <Text color={tokens.text.muted}>{title}</Text>
        )}
      </Box>
      <Box paddingLeft={2}>{props.children}</Box>
      {props.error && <Text color={tokens.status.error}>{props.error}</Text>}
    </Box>
  )
}
