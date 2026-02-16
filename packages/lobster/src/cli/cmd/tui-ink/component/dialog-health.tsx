/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React from "react"
import { useTheme } from "../theme"
import { useAppStore } from "../store"
import { useDialog } from "../ui/dialog"

export function DialogHealth() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const providers = useAppStore((s) => s.provider)
  const mcp = useAppStore((s) => s.mcp)
  const sessions = useAppStore((s) => s.session)

  useInput((_ch, key) => {
    if (key.escape || key.return) dialog.clear()
  })

  const mcpConnected = Object.values(mcp).filter((s) => s.status === "connected").length
  const mcpTotal = Object.keys(mcp).length

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Box justifyContent="space-between">
        <Text color={theme.text} bold>Project Health</Text>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>

      <Box flexDirection="column" marginTop={1} gap={1}>
        <Box>
          <Text color={theme.accent} bold>Overview</Text>
        </Box>
        <Box paddingLeft={1} flexDirection="column">
          <Text color={theme.textMuted}>
            Providers: <Text color={theme.success}>{providers.length} connected</Text>
          </Text>
          <Text color={theme.textMuted}>
            MCP: <Text color={mcpConnected > 0 ? theme.success : theme.textMuted}>{mcpConnected}/{mcpTotal} connected</Text>
          </Text>
          <Text color={theme.textMuted}>
            Sessions: <Text color={theme.text}>{sessions.length}</Text>
          </Text>
        </Box>

        {sessions.length > 0 && (
          <>
            <Text color={theme.accent} bold>Recent Sessions</Text>
            <Box paddingLeft={1} flexDirection="column">
              {sessions.slice(-5).reverse().map((s) => (
                <Text key={s.id} color={theme.textMuted}>
                  {s.title || s.id.slice(0, 8)}
                </Text>
              ))}
            </Box>
          </>
        )}
      </Box>

      <Box marginTop={1}>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>
    </Box>
  )
}
