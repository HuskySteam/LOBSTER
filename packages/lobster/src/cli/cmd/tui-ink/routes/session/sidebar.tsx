/** @jsxImportSource react */
import { Box, Text } from "ink"
import React, { useMemo } from "react"
import { useTheme } from "../../theme"
import { useAppStore } from "../../store"
import { useLocal } from "../../context/local"

const EMPTY_TODO: never[] = []
const EMPTY_DIFF: never[] = []

function Divider() {
  const { theme } = useTheme()
  return <Text color={theme.textMuted}>{"─".repeat(34)}</Text>
}

export function Sidebar(props: { sessionID: string }) {
  const { theme } = useTheme()
  const local = useLocal()
  const agents = useAppStore((s) => s.agent.filter((x) => !x.hidden))
  const mcp = useAppStore((s) => s.mcp)
  const lsp = useAppStore((s) => s.lsp)
  const todo = useAppStore((s) => s.todo[props.sessionID] ?? EMPTY_TODO)
  const diff = useAppStore((s) => s.session_diff[props.sessionID] ?? EMPTY_DIFF)
  const sessionTextTokens = useAppStore((s) => s.session_text_tokens[props.sessionID] ?? 0)
  const teams = useAppStore((s) => s.teams)
  const vcs = useAppStore((s) => s.vcs)
  const path = useAppStore((s) => s.path)

  const tokenInfo = useMemo(() => {
    return {
      tokens: sessionTextTokens,
      display: sessionTextTokens > 1000 ? `${(sessionTextTokens / 1000).toFixed(1)}k` : `${sessionTextTokens}`,
    }
  }, [sessionTextTokens])

  const mcpEntries = useMemo(() =>
    Object.entries(mcp).sort(([a], [b]) => a.localeCompare(b)),
  [mcp])

  const connectedMcp = mcpEntries.filter(([, item]) => item.status === "connected").length
  const teamNames = Object.keys(teams)
  const activeTodos = todo.filter((t) => t.status !== "completed")

  return (
    <Box
      flexDirection="column"
      width={36}
      borderStyle="single"
      borderLeft
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      borderColor={theme.textMuted}
      paddingLeft={1}
      paddingRight={1}
      paddingTop={1}
    >
      {/* Context */}
      <Box flexDirection="column">
        <Text color={theme.textMuted} bold>CONTEXT</Text>
        <Text color={theme.text}>{tokenInfo.display} tokens</Text>
        <Text color={theme.textMuted}>{local.model.parsed().provider}/{local.model.parsed().model}</Text>
      </Box>
      <Divider />

      {/* Git */}
      {vcs && (
        <>
          <Box flexDirection="column">
            <Text color={theme.textMuted} bold>GIT</Text>
            <Text color={theme.text}>{(vcs as any).branch ?? "unknown"}</Text>
          </Box>
          <Divider />
        </>
      )}

      {/* Agents */}
      {agents.length > 0 && (
        <>
          <Box flexDirection="column">
            <Text color={theme.textMuted} bold>AGENTS</Text>
            {agents.map((agent) => (
              <Box key={agent.name} gap={1}>
                <Text color={agent.name === local.agent.current().name ? theme.accent : theme.textMuted}>
                  {agent.name === local.agent.current().name ? ">" : " "}
                </Text>
                <Text color={theme.text}>{agent.name}</Text>
                {agent.name === local.agent.current().name && (
                  <Text color={theme.textMuted}>(active)</Text>
                )}
              </Box>
            ))}
          </Box>
          <Divider />
        </>
      )}

      {/* Teams */}
      {teamNames.length > 0 && (
        <>
          <Box flexDirection="column">
            <Text color={theme.textMuted} bold>TEAMS ({teamNames.length})</Text>
            {teamNames.map((name) => (
              <Text key={name} color={theme.text}>{name}</Text>
            ))}
          </Box>
          <Divider />
        </>
      )}

      {/* Todo */}
      {activeTodos.length > 0 && (
        <>
          <Box flexDirection="column">
            <Text color={theme.textMuted} bold>TODO</Text>
            {activeTodos.slice(0, 8).map((t, i) => {
              const icon = t.status === "in_progress" ? "[~]" : "[ ]"
              const color = t.status === "in_progress" ? theme.warning : theme.text
              return <Text key={i} color={color}>{icon} {t.content.slice(0, 30)}</Text>
            })}
            {activeTodos.length > 8 && (
              <Text color={theme.textMuted}>+{activeTodos.length - 8} more...</Text>
            )}
          </Box>
          <Divider />
        </>
      )}

      {/* Modified Files */}
      {diff.length > 0 && (
        <>
          <Box flexDirection="column">
            <Text color={theme.textMuted} bold>MODIFIED FILES</Text>
            {diff.slice(0, 8).map((item, i) => (
              <Box key={i} justifyContent="space-between">
                <Text color={theme.text}>{(item as any).file?.slice(0, 20)}</Text>
                <Box gap={1}>
                  {(item as any).additions > 0 && (
                    <Text color={theme.success}>+{(item as any).additions}</Text>
                  )}
                  {(item as any).deletions > 0 && (
                    <Text color={theme.error}>-{(item as any).deletions}</Text>
                  )}
                </Box>
              </Box>
            ))}
            {diff.length > 8 && (
              <Text color={theme.textMuted}>+{diff.length - 8} more...</Text>
            )}
          </Box>
          <Divider />
        </>
      )}

      {/* MCP */}
      {mcpEntries.length > 0 && (
        <>
          <Box flexDirection="column">
            <Text color={theme.textMuted} bold>MCP ({connectedMcp} active)</Text>
            {mcpEntries.slice(0, 6).map(([key, item]) => {
              const color = item.status === "connected" ? theme.success
                : item.status === "failed" ? theme.error
                : theme.textMuted
              return (
                <Box key={key} gap={1}>
                  <Text color={color}>*</Text>
                  <Text color={theme.text}>{key.slice(0, 20)}</Text>
                </Box>
              )
            })}
          </Box>
          <Divider />
        </>
      )}

      {/* LSP */}
      <Box flexDirection="column">
        <Text color={theme.textMuted} bold>LSP</Text>
        {lsp.length === 0 ? (
          <Text color={theme.textMuted}>Activates as files are read</Text>
        ) : (
          lsp.slice(0, 5).map((item) => (
            <Box key={item.id} gap={1}>
              <Text color={item.status === "connected" ? theme.success : theme.error}>*</Text>
              <Text color={theme.textMuted}>{item.id}</Text>
            </Box>
          ))
        )}
      </Box>

      {/* Spacer + Version */}
      <Box flexGrow={1} />
      <Box>
        <Text color={theme.textMuted}>
          <Text color={theme.accent}>*</Text> LOBSTER
        </Text>
      </Box>
    </Box>
  )
}
