/** @jsxImportSource react */
import { Box, Text } from "ink"
import React, { useMemo } from "react"
import { useAppStore } from "../../store"
import { useLocal } from "../../context/local"
import { separator, useDesignTokens } from "../../ui/design"
import { StatusBadge } from "../../ui/chrome"

const EMPTY_TODO: never[] = []
const EMPTY_DIFF: never[] = []
const EMPTY_MESSAGES: never[] = []
const EMPTY_PARTS: never[] = []

function Section(props: { title: string; children: React.ReactNode }) {
  const tokens = useDesignTokens()
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={tokens.text.accent} bold>{props.title}</Text>
      {props.children}
    </Box>
  )
}

function Divider() {
  const tokens = useDesignTokens()
  return <Text color={tokens.text.muted}>{separator(34)}</Text>
}

export function Sidebar(props: { sessionID: string }) {
  const tokens = useDesignTokens()
  const local = useLocal()
  const agents = useAppStore((s) => s.agent.filter((x) => !x.hidden))
  const mcp = useAppStore((s) => s.mcp)
  const lsp = useAppStore((s) => s.lsp)
  const todo = useAppStore((s) => s.todo[props.sessionID] ?? EMPTY_TODO)
  const diff = useAppStore((s) => s.session_diff[props.sessionID] ?? EMPTY_DIFF)
  const messages = useAppStore((s) => s.message[props.sessionID] ?? EMPTY_MESSAGES)
  const parts = useAppStore((s) => s.part)
  const teams = useAppStore((s) => s.teams)
  const vcs = useAppStore((s) => s.vcs)

  const tokenInfo = useMemo(() => {
    let total = 0
    for (const msg of messages) {
      const msgParts = parts[msg.id] ?? EMPTY_PARTS
      for (const part of msgParts) {
        if (part.type === "text") {
          total += Math.ceil(((part as any).text?.length ?? 0) / 4)
        }
      }
    }
    return { tokens: total, display: total > 1000 ? `${(total / 1000).toFixed(1)}k` : `${total}` }
  }, [messages, parts])

  const mcpEntries = useMemo(() => Object.entries(mcp).sort(([a], [b]) => a.localeCompare(b)), [mcp])
  const connectedMcp = mcpEntries.filter(([, item]) => item.status === "connected").length
  const teamNames = Object.keys(teams)
  const activeTodos = todo.filter((t) => t.status !== "completed")

  return (
    <Box
      flexDirection="column"
      width={38}
      borderStyle="single"
      borderLeft
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      borderColor={tokens.panel.border}
      paddingLeft={1}
      paddingRight={1}
      paddingTop={1}
    >
      <Section title="CONTEXT">
        <Box gap={1}>
          <StatusBadge tone="accent" label={`${tokenInfo.display} tokens`} />
          <StatusBadge tone="muted" label={local.model.parsed().provider} />
        </Box>
        <Text color={tokens.text.muted}>{local.model.parsed().model}</Text>
      </Section>
      <Divider />

      {vcs ? (
        <>
          <Section title="GIT">
            <StatusBadge tone="success" label={(vcs as any).branch ?? "unknown"} />
          </Section>
          <Divider />
        </>
      ) : null}

      {agents.length > 0 ? (
        <>
          <Section title="AGENTS">
            {agents.map((agent) => {
              const active = agent.name === local.agent.current().name
              return (
                <Box key={agent.name} gap={1}>
                  <Text color={active ? tokens.text.accent : tokens.text.muted}>{active ? ">" : "-"}</Text>
                  <Text color={active ? tokens.text.primary : tokens.text.muted}>{agent.name}</Text>
                </Box>
              )
            })}
          </Section>
          <Divider />
        </>
      ) : null}

      {teamNames.length > 0 ? (
        <>
          <Section title={`TEAMS (${teamNames.length})`}>
            {teamNames.map((name) => (
              <Text key={name} color={tokens.text.primary}>{name}</Text>
            ))}
          </Section>
          <Divider />
        </>
      ) : null}

      {activeTodos.length > 0 ? (
        <>
          <Section title="TASKS">
            {activeTodos.slice(0, 8).map((item, index) => {
              const tone = item.status === "in_progress" ? "warning" : "muted"
              return (
                <Box key={`${item.content}:${index}`} gap={1}>
                  <StatusBadge tone={tone} label={item.status === "in_progress" ? "active" : "todo"} />
                  <Text color={tokens.text.primary}>{item.content.slice(0, 24)}</Text>
                </Box>
              )
            })}
            {activeTodos.length > 8 ? <Text color={tokens.text.muted}>+{activeTodos.length - 8} more</Text> : null}
          </Section>
          <Divider />
        </>
      ) : null}

      {diff.length > 0 ? (
        <>
          <Section title="MODIFIED FILES">
            {diff.slice(0, 8).map((item, i) => (
              <Box key={i} justifyContent="space-between">
                <Text color={tokens.text.primary}>{(item as any).file?.slice(0, 20)}</Text>
                <Box gap={1}>
                  {(item as any).additions > 0 ? <Text color={tokens.status.success}>+{(item as any).additions}</Text> : null}
                  {(item as any).deletions > 0 ? <Text color={tokens.status.error}>-{(item as any).deletions}</Text> : null}
                </Box>
              </Box>
            ))}
            {diff.length > 8 ? <Text color={tokens.text.muted}>+{diff.length - 8} more</Text> : null}
          </Section>
          <Divider />
        </>
      ) : null}

      {mcpEntries.length > 0 ? (
        <>
          <Section title="MCP">
            <Box gap={1}>
              <StatusBadge tone="success" label={`${connectedMcp} connected`} />
              <StatusBadge tone="muted" label={`${mcpEntries.length} total`} />
            </Box>
            {mcpEntries.slice(0, 6).map(([key, item]) => {
              const color = item.status === "connected" ? tokens.status.success : item.status === "failed" ? tokens.status.error : tokens.status.warning
              return (
                <Box key={key} gap={1}>
                  <Text color={color}>*</Text>
                  <Text color={tokens.text.muted}>{key.slice(0, 24)}</Text>
                </Box>
              )
            })}
          </Section>
          <Divider />
        </>
      ) : null}

      <Section title="LSP">
        {lsp.length === 0 ? (
          <Text color={tokens.text.muted}>Activates as files are read</Text>
        ) : (
          lsp.slice(0, 5).map((item) => (
            <Box key={item.id} gap={1}>
              <Text color={item.status === "connected" ? tokens.status.success : tokens.status.error}>*</Text>
              <Text color={tokens.text.muted}>{item.id}</Text>
            </Box>
          ))
        )}
      </Section>

      <Box flexGrow={1} />
      <Box>
        <StatusBadge tone="accent" label="LOBSTER" />
      </Box>
    </Box>
  )
}
