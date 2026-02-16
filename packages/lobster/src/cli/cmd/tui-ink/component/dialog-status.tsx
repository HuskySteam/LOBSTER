/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React from "react"
import { useTheme } from "../theme"
import { useAppStore } from "../store"
import { useDialog } from "../ui/dialog"

export function DialogStatus() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const providers = useAppStore((s) => s.provider)
  const mcp = useAppStore((s) => s.mcp)
  const lsp = useAppStore((s) => s.lsp)
  const formatter = useAppStore((s) => s.formatter)

  useInput((_ch, key) => {
    if (key.escape || key.return) dialog.clear()
  })

  const mcpEntries = Object.entries(mcp)

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Box justifyContent="space-between">
        <Text color={theme.text} bold>System Status</Text>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.accent} bold>Providers ({providers.length})</Text>
        {providers.length === 0 ? (
          <Text color={theme.textMuted}>  None connected</Text>
        ) : (
          providers.map((p) => (
            <Box key={p.id} paddingLeft={1}>
              <Text color={theme.success}>● </Text>
              <Text color={theme.text}>{p.name}</Text>
              <Text color={theme.textMuted} dimColor> {Object.keys(p.models).length} models</Text>
            </Box>
          ))
        )}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.accent} bold>MCP Servers ({mcpEntries.length})</Text>
        {mcpEntries.length === 0 ? (
          <Text color={theme.textMuted}>  None configured</Text>
        ) : (
          mcpEntries.map(([name, status]) => (
            <Box key={name} paddingLeft={1}>
              <Text color={status.status === "connected" ? theme.success : theme.error}>
                {status.status === "connected" ? "● " : "✖ "}
              </Text>
              <Text color={theme.textMuted}>{name}</Text>
            </Box>
          ))
        )}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.accent} bold>LSP ({lsp.length})</Text>
        {lsp.map((l) => (
          <Box key={l.name} paddingLeft={1}>
            <Text color={l.status === "connected" ? theme.success : theme.textMuted}>
              {l.status === "connected" ? "● " : "○ "}
            </Text>
            <Text color={theme.textMuted}>{l.name}</Text>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.accent} bold>Formatters ({formatter.length})</Text>
        {formatter.map((f) => (
          <Box key={f.name} paddingLeft={1}>
            <Text color={theme.success}>● </Text>
            <Text color={theme.textMuted}>{f.name}</Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>
    </Box>
  )
}
