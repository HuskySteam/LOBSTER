/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React, { useState, useMemo, useCallback } from "react"
import { useTheme } from "../theme"
import { useAppStore } from "../store"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"

export function DialogMcp() {
  const { theme } = useTheme()
  const { sync } = useSDK()
  const dialog = useDialog()
  const mcp = useAppStore((s) => s.mcp)
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState<string | null>(null)

  const entries = useMemo(() => Object.entries(mcp), [mcp])

  useInput((_ch, key) => {
    if (key.escape) { dialog.clear(); return }
    if (key.upArrow) setSelected((s) => Math.max(0, s - 1))
    if (key.downArrow) setSelected((s) => Math.min(entries.length - 1, s + 1))
    if (key.return || _ch === " ") {
      const entry = entries[selected]
      if (entry) toggleMcp(entry[0])
    }
  })

  const toggleMcp = useCallback(
    async (name: string) => {
      setLoading(name)
      const currentConfig = useAppStore.getState().config as any
      const mcpConfig = { ...(currentConfig?.mcp ?? {}) }
      if (mcpConfig[name]?.disabled) {
        delete mcpConfig[name].disabled
      } else {
        mcpConfig[name] = { ...(mcpConfig[name] ?? {}), disabled: true }
      }
      await sync.client.global.config.update({ config: { mcp: mcpConfig } })
      await sync.client.instance.dispose()
      await sync.bootstrap()
      setLoading(null)
    },
    [sync],
  )

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Box justifyContent="space-between">
        <Text color={theme.text} bold>MCP Servers</Text>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>

      {entries.length === 0 ? (
        <Box marginTop={1}>
          <Text color={theme.textMuted}>No MCP servers configured.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {entries.map(([name, status], i) => {
            const isSelected = i === selected
            const isLoading = loading === name
            const isConnected = status.status === "connected"
            const isFailed = status.status === "failed"
            const color = isConnected ? theme.success : isFailed ? theme.error : theme.textMuted
            const icon = isLoading ? "◌" : isConnected ? "●" : isFailed ? "✖" : "○"
            return (
              <Box key={name}>
                <Text color={isSelected ? theme.secondary : theme.textMuted}>
                  {isSelected ? "> " : "  "}
                </Text>
                <Text color={color}>{icon} </Text>
                <Text color={isSelected ? theme.text : theme.textMuted}>{name}</Text>
                <Text color={theme.textMuted} dimColor> {status.status}</Text>
              </Box>
            )
          })}
        </Box>
      )}

      <Box marginTop={1} gap={2}>
        <Text color={theme.textMuted}>{"↑↓ navigate"}</Text>
        <Text color={theme.textMuted}>space toggle</Text>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>
    </Box>
  )
}
