/** @jsxImportSource react */
import { Box, Text } from "ink"
import React, { useMemo } from "react"
import { useTheme } from "../theme"
import { useAppStore, type TeamInfo, type TeamTaskSummary } from "../store"

interface TeamStatusProps {
  teamName: string
}

export function TeamStatus(props: TeamStatusProps) {
  const { theme } = useTheme()
  const team = useAppStore((s) => s.teams[props.teamName]) as TeamInfo | undefined
  const tasks = useAppStore((s) => s.team_tasks[props.teamName] ?? []) as TeamTaskSummary[]

  const summary = useMemo(() => {
    const total = tasks.length
    const done = tasks.filter((t) => t.status === "completed").length
    const active = tasks.filter((t) => t.status === "in_progress").length
    const blocked = tasks.filter((t) => t.blockedBy.length > 0).length
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    return { total, done, active, blocked, pct }
  }, [tasks])

  if (!team) return null

  const barWidth = 20
  const filled = Math.round((summary.pct / 100) * barWidth)
  const bar = "█".repeat(filled) + "░".repeat(barWidth - filled)

  return (
    <Box flexDirection="column">
      <Text color={theme.text} bold>
        Team {team.name} ({team.members.length} members)
      </Text>

      {team.members.map((m) => {
        const color = m.status === "active" || m.status === "working" ? theme.success
          : m.status === "idle" || m.status === "waiting" ? theme.warning
          : theme.error
        return (
          <Box key={m.name}>
            <Text color={color}>● </Text>
            <Text color={theme.textMuted}>{m.name}</Text>
            <Text color={theme.textMuted} dimColor> {m.status}</Text>
          </Box>
        )
      })}

      <Box marginTop={1} gap={1}>
        <Text color={theme.accent}>{bar}</Text>
        <Text color={theme.textMuted}>{summary.pct}%</Text>
      </Box>
      <Text color={theme.textMuted}>
        {summary.total} total, {summary.active} active, {summary.done} done, {summary.blocked} blocked
      </Text>
    </Box>
  )
}
