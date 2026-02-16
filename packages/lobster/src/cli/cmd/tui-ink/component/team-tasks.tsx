/** @jsxImportSource react */
import { Box, Text } from "ink"
import React from "react"
import { useTheme } from "../theme"
import { useAppStore, type TeamTaskSummary } from "../store"

interface TeamTasksProps {
  teamName: string
}

export function TeamTasks(props: TeamTasksProps) {
  const { theme } = useTheme()
  const tasks = useAppStore((s) => s.team_tasks[props.teamName] ?? []) as TeamTaskSummary[]

  if (tasks.length === 0) return null

  return (
    <Box flexDirection="column">
      {tasks.map((task) => {
        const isBlocked = task.blockedBy.length > 0
        const color = isBlocked ? theme.error
          : task.status === "in_progress" ? theme.warning
          : task.status === "completed" ? theme.success
          : theme.textMuted
        const subject = task.subject.length > 28 ? task.subject.slice(0, 28) + "…" : task.subject
        return (
          <Box key={task.id}>
            <Text color={color}>• </Text>
            <Text color={theme.textMuted}>#{task.id} </Text>
            <Text color={theme.text}>{subject}</Text>
            {task.owner && <Text color={theme.textMuted} dimColor> @{task.owner}</Text>}
          </Box>
        )
      })}
    </Box>
  )
}
