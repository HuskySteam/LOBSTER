/** @jsxImportSource react */
import { Box, Text } from "ink"
import React from "react"
import { Spinner } from "../spinner"
import type { ReactNode } from "react"
import { useDesignTokens } from "../../ui/design"
import { StatusBadge } from "../../ui/chrome"

export function BlockTool(props: { title: string; children: ReactNode; error?: string; spinner?: boolean }) {
  const tokens = useDesignTokens()
  const title = props.title.replace(/^# /, "")

  return (
    <Box
      flexDirection="column"
      paddingLeft={1}
      marginTop={1}
      borderStyle="single"
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      borderLeft={true}
      borderColor={tokens.panel.border}
    >
      <Box gap={1} marginBottom={1}>
        {props.spinner ? (
          <Spinner>
            <Text color={tokens.text.primary}>{title}</Text>
          </Spinner>
        ) : (
          <Text color={tokens.text.primary}>{title}</Text>
        )}
      </Box>
      {props.children}
      {props.error && <Text color={tokens.status.error}>{props.error}</Text>}
    </Box>
  )
}
