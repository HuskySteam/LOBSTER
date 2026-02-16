/** @jsxImportSource react */
import { Box, Text } from "ink"
import React from "react"
import { useTheme } from "../theme"
import { useAppStore } from "../store"

export function HealthDashboard() {
  const { theme } = useTheme()
  const providers = useAppStore((s) => s.provider)
  const mcp = useAppStore((s) => s.mcp)
  const sessions = useAppStore((s) => s.session)

  const mcpConnected = Object.values(mcp).filter((s) => s.status === "connected").length

  return (
    <Box flexDirection="column">
      <Text color={theme.accent} bold>Health</Text>
      <Text color={theme.textMuted}>
        {providers.length} providers · {mcpConnected} MCP · {sessions.length} sessions
      </Text>
    </Box>
  )
}
