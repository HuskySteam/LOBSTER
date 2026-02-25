/** @jsxImportSource react */
import { Box, Text } from "ink"
import React, { useMemo } from "react"
import { useAppStore } from "../../store"
import { useLocal } from "../../context/local"
import { useDesignTokens } from "../../ui/design"
import { SegmentedTabs, StatusBadge } from "../../ui/chrome"
import type { PanelTab } from "./layout-model"

const EMPTY_TODO: never[] = []
const EMPTY_DIFF: never[] = []
const EMPTY_MESSAGES: never[] = []
const EMPTY_PARTS: never[] = []

type ActivityEntry = {
  id: string
  title: string
  status: "running" | "completed" | "error" | "pending"
  detail: string[]
}

function clampIndex(value: number, max: number) {
  if (max <= 0) return 0
  if (value < 0) return 0
  if (value > max - 1) return max - 1
  return value
}

function buildInlinePreview(before: string, after: string) {
  const beforeLines = before.split("\n")
  const afterLines = after.split("\n")
  const total = Math.max(beforeLines.length, afterLines.length)
  const preview: string[] = []

  for (let index = 0; index < total && preview.length < 4; index++) {
    const left = beforeLines[index] ?? ""
    const right = afterLines[index] ?? ""
    if (left === right) continue
    if (left) preview.push(`-${left}`)
    if (right) preview.push(`+${right}`)
  }

  return preview.length > 0 ? preview : ["(no inline diff preview)"]
}

function summarizeInput(input: Record<string, any>) {
  const raw =
    input.filePath ??
    input.file_path ??
    input.command ??
    input.query ??
    input.pattern ??
    input.url ??
    input.subagent_type ??
    input.subagentType ??
    ""

  const value = String(raw).trim()
  if (!value) return ""
  return value.length > 34 ? `${value.slice(0, 31)}...` : value
}

export function Sidebar(props: {
  sessionID: string
  activeTab: PanelTab
  onSelectTab: (tab: PanelTab) => void
  dockSide: "left" | "right"
  diffCursor: number
  activityCursor: number
  expandedActivity: boolean
}) {
  const tokens = useDesignTokens()
  const local = useLocal()
  const agents = useAppStore((s) => s.agent.filter((x) => !x.hidden))
  const mcp = useAppStore((s) => s.mcp)
  const lsp = useAppStore((s) => s.lsp)
  const todo = useAppStore((s) => s.todo[props.sessionID] ?? EMPTY_TODO)
  const diff = useAppStore((s) => s.session_diff[props.sessionID] ?? EMPTY_DIFF)
  const sessions = useAppStore((s) => s.session)
  const messages = useAppStore((s) => s.message[props.sessionID] ?? EMPTY_MESSAGES)
  const parts = useAppStore((s) => s.part)
  const teams = useAppStore((s) => s.teams)
  const vcs = useAppStore((s) => s.vcs)
  const sessionStatus = useAppStore((s) => s.session_status[props.sessionID])

  const tokenInfo = useMemo(() => {
    let total = 0
    for (const msg of messages) {
      const msgParts = parts[msg.id] ?? EMPTY_PARTS
      for (const part of msgParts) {
        if (part.type === "text") total += Math.ceil(((part as any).text?.length ?? 0) / 4)
      }
    }
    return {
      tokens: total,
      display: total > 1000 ? `${(total / 1000).toFixed(1)}k` : `${total}`,
    }
  }, [messages, parts])

  const mcpEntries = useMemo(() => Object.entries(mcp).sort(([a], [b]) => a.localeCompare(b)), [mcp])
  const connectedMcp = mcpEntries.filter(([, item]) => item.status === "connected").length
  const teamNames = Object.keys(teams)
  const activeTodos = todo.filter((t) => t.status !== "completed")

  const recentSessions = useMemo(
    () => [...sessions].sort((left, right) => right.time.updated - left.time.updated).slice(0, 8),
    [sessions],
  )

  const activityEntries = useMemo(() => {
    const entries: ActivityEntry[] = []
    for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex--) {
      const message = messages[messageIndex]
      const messageParts = parts[message.id] ?? EMPTY_PARTS
      for (let partIndex = messageParts.length - 1; partIndex >= 0; partIndex--) {
        const part = messageParts[partIndex] as any
        if (part.type !== "tool") continue
        const state = part.state ?? {}
        const status = (state.status ?? "pending") as ActivityEntry["status"]
        const detail = summarizeInput(state.input ?? {})
        const created = message.time?.created ? new Date(message.time.created).toLocaleTimeString() : "recently"
        const meta = state.status === "pending" ? {} : (state.metadata ?? {})
        const extra = Object.keys(meta).slice(0, 2)
        entries.push({
          id: part.id,
          title: `${part.tool}${detail ? ` | ${detail}` : ""}`,
          status,
          detail: [created, ...extra.map((item) => `meta:${item}`)],
        })
      }
      if (entries.length >= 20) break
    }
    return entries.slice(0, 12)
  }, [messages, parts])

  const selectedDiff = diff[clampIndex(props.diffCursor, diff.length)] as any
  const selectedActivity = activityEntries[clampIndex(props.activityCursor, activityEntries.length)]

  const tabs = [
    { id: "context", label: "CTX" },
    { id: "logbook", label: "LOG" },
    { id: "diff", label: "DIFF", count: diff.length },
    { id: "activity", label: "ACT", count: activityEntries.length },
  ] as const

  return (
    <Box
      flexDirection="column"
      width={38}
      paddingLeft={1}
      paddingRight={1}
      marginLeft={props.dockSide === "right" ? 1 : 0}
      marginRight={props.dockSide === "left" ? 1 : 0}
    >
      <Box marginTop={1} marginBottom={1}>
        <SegmentedTabs
          active={props.activeTab}
          tabs={tabs.map((tab) => ({ ...tab }))}
          onSelect={(tab) => props.onSelectTab(tab)}
        />
      </Box>

      {props.activeTab === "context" && (
        <Box flexDirection="column" gap={1}>
          <Text color={tokens.text.accent}>Context</Text>
          <Box gap={1}>
            <StatusBadge tone="accent" label={`${tokenInfo.display} tokens`} />
            <StatusBadge
              tone={sessionStatus?.type === "busy" ? "warning" : "success"}
              label={sessionStatus?.type ?? "idle"}
            />
          </Box>
          <Text color={tokens.text.muted}>engine {local.model.parsed().provider}</Text>
          <Text color={tokens.text.primary}>{local.model.parsed().model}</Text>

          {vcs ? (
            <Box flexDirection="column">
              <Text color={tokens.text.accent}>workspace</Text>
              <Text color={tokens.text.primary}>{(vcs as any).branch ?? "unknown"}</Text>
            </Box>
          ) : null}

          <Box flexDirection="column">
            <Text color={tokens.text.accent}>agents</Text>
            {agents.map((agent) => {
              const active = agent.name === local.agent.current().name
              return (
                <Text key={agent.name} color={active ? tokens.text.primary : tokens.text.muted}>
                  {active ? ">" : " "} {agent.name}
                </Text>
              )
            })}
          </Box>

          {activeTodos.length > 0 && (
            <Box flexDirection="column">
              <Text color={tokens.text.accent}>tasks</Text>
              {activeTodos.slice(0, 6).map((item) => {
                const key = (item as any).id ?? `${item.status}:${item.content}`
                const marker = item.status === "in_progress" ? "~" : "."
                return (
                  <Text key={key} color={tokens.text.muted}>
                    {marker} {item.content.slice(0, 28)}
                  </Text>
                )
              })}
            </Box>
          )}

          <Text color={tokens.text.muted}>
            MCP {connectedMcp}/{mcpEntries.length} · LSP {lsp.length} · Teams {teamNames.length}
          </Text>
        </Box>
      )}

      {props.activeTab === "logbook" && (
        <Box flexDirection="column" gap={1}>
          <Text color={tokens.text.accent}>Logbook</Text>
          <Text color={tokens.text.muted}>Recent sessions across this workspace</Text>
          {recentSessions.length === 0 ? (
            <Text color={tokens.text.muted}>No logbook entries yet.</Text>
          ) : (
            recentSessions.map((session) => {
              const active = session.id === props.sessionID
              const label = (session.title || "Untitled").slice(0, 24)
              const updated = new Date(session.time.updated).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })
              return (
                <Box key={session.id} justifyContent="space-between">
                  <Text color={active ? tokens.text.primary : tokens.text.muted}>
                    {active ? ">" : " "} {label}
                  </Text>
                  <Text color={tokens.text.muted}>{updated}</Text>
                </Box>
              )
            })
          )}
        </Box>
      )}

      {props.activeTab === "diff" && (
        <Box flexDirection="column" gap={1}>
          <Text color={tokens.text.accent}>Diff</Text>
          <Text color={tokens.text.muted}>Alt+1..4 quick tabs | Alt+J/K move</Text>
          {diff.length === 0 ? (
            <Text color={tokens.text.muted}>No changed files in this session.</Text>
          ) : (
            <>
              {diff.slice(0, 8).map((item: any, index) => {
                const selected = index === clampIndex(props.diffCursor, diff.length)
                return (
                  <Box key={String(item.file)} justifyContent="space-between">
                    <Text color={selected ? tokens.text.primary : tokens.text.muted}>
                      {selected ? ">" : " "} {String(item.file).slice(0, 22)}
                    </Text>
                    <Text color={tokens.text.muted}>
                      <Text color={tokens.status.success}>+{item.additions ?? 0}</Text>{" "}
                      <Text color={tokens.status.error}>-{item.deletions ?? 0}</Text>
                    </Text>
                  </Box>
                )
              })}
              {selectedDiff ? (
                <Box flexDirection="column" marginTop={1}>
                  {buildInlinePreview(String(selectedDiff.before ?? ""), String(selectedDiff.after ?? "")).map(
                    (line) => (
                      <Text
                        key={`${selectedDiff.file}:${line}`}
                        color={
                          line.startsWith("+")
                            ? tokens.status.success
                            : line.startsWith("-")
                              ? tokens.status.error
                              : tokens.text.muted
                        }
                      >
                        {line.slice(0, 34)}
                      </Text>
                    ),
                  )}
                </Box>
              ) : null}
            </>
          )}
        </Box>
      )}

      {props.activeTab === "activity" && (
        <Box flexDirection="column" gap={1}>
          <Text color={tokens.text.accent}>Activity</Text>
          <Text color={tokens.text.muted}>Alt+J/K navigate | Alt+E expand section</Text>
          {activityEntries.length === 0 ? (
            <Text color={tokens.text.muted}>No activity yet.</Text>
          ) : (
            activityEntries.map((entry, index) => {
              const selected = index === clampIndex(props.activityCursor, activityEntries.length)
              const tone =
                entry.status === "error"
                  ? tokens.status.error
                  : entry.status === "running"
                    ? tokens.status.warning
                    : entry.status === "completed"
                      ? tokens.status.success
                      : tokens.text.muted

              return (
                <Box key={entry.id} flexDirection="column">
                  <Text color={selected ? tokens.text.primary : tokens.text.muted}>
                    {selected ? ">" : " "} <Text color={tone}>*</Text> {entry.title.slice(0, 29)}
                  </Text>
                  {selected && props.expandedActivity
                    ? entry.detail.map((line) => (
                        <Text key={`${entry.id}:${line}`} color={tokens.text.muted}>
                          | {line}
                        </Text>
                      ))
                    : null}
                </Box>
              )
            })
          )}
          {selectedActivity && !props.expandedActivity ? (
            <Text color={tokens.text.muted}>expand to inspect {selectedActivity.detail.length} detail lines</Text>
          ) : null}
        </Box>
      )}

      <Box flexGrow={1} />
    </Box>
  )
}
