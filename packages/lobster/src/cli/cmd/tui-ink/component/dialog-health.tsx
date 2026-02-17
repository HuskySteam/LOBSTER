/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React, { useMemo } from "react"
import { useTheme } from "../theme"
import { useAppStore } from "../store"
import { useDialog } from "../ui/dialog"
import { useLobster } from "../context/lobster"

function progressBar(value: number, width = 20): string {
  const clamped = Math.max(0, Math.min(100, value))
  const filled = Math.round((clamped / 100) * width)
  return "#".repeat(filled) + "-".repeat(width - filled)
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (seconds < 60) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export function DialogHealth() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const lobster = useLobster()
  const sessions = useAppStore((s) => s.session)

  useInput((_ch, key) => {
    if (key.escape || key.return) dialog.clear()
  })

  const severities = lobster.findingsBySeverity
  const findingsSummary = useMemo(() => {
    const parts: string[] = []
    if (severities.critical > 0) parts.push(`${severities.critical} critical`)
    if (severities.high > 0) parts.push(`${severities.high} high`)
    if (severities.medium > 0) parts.push(`${severities.medium} medium`)
    if (severities.low > 0) parts.push(`${severities.low} low`)
    return parts.join(", ")
  }, [severities])

  const qualityColor =
    lobster.qualityScore >= 80
      ? theme.success
      : lobster.qualityScore >= 60
        ? theme.accent
        : lobster.qualityScore >= 40
          ? theme.warning
          : theme.error

  const budgetPercent = lobster.budget?.budget_usd
    ? Math.min(100, (lobster.totalCost / lobster.budget.budget_usd) * 100)
    : null
  const budgetColor = budgetPercent === null
    ? theme.textMuted
    : budgetPercent >= 90
      ? theme.error
      : budgetPercent >= 70
        ? theme.warning
        : theme.accent

  const recentSessions = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => b.time.updated - a.time.updated)
        .slice(0, 5)
        .map((s) => ({
          title: s.title || "Untitled session",
          time: formatTimeAgo(s.time.updated),
        })),
    [sessions],
  )

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Box justifyContent="space-between">
        <Text color={theme.text} bold>Project Health Dashboard</Text>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>

      <Box marginTop={1} flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text color={theme.text} bold>Quality Score</Text>
          <Box gap={1}>
            <Text color={qualityColor}>{progressBar(lobster.qualityScore)}</Text>
            <Text color={theme.text}>{lobster.qualityScore}%</Text>
          </Box>
          {lobster.projectQuality && (
            <Text color={theme.textMuted}>
              Analyzed {formatTimeAgo(lobster.projectQuality.analyzed_at)}
            </Text>
          )}
          {!lobster.projectQuality && !lobster.analysisRunning && (
            <Text color={theme.textMuted}>Run /health to trigger AI analysis</Text>
          )}
          {lobster.analysisRunning && (
            <Text color={theme.accent}>Analyzing project quality...</Text>
          )}
        </Box>

        <Box flexDirection="column">
          <Text color={theme.text} bold>Review Loop</Text>
          {lobster.reviewLoop ? (
            <>
              <Text color={theme.text}>
                {lobster.reviewLoop.task ?? "unnamed task"} - iteration {lobster.reviewLoop.iteration ?? 0}/
                {lobster.reviewLoop.max_iterations ?? "?"}
              </Text>
              <Box gap={1}>
                {lobster.phaseList.map((phase, index) => (
                  <React.Fragment key={phase.name}>
                    {index > 0 && <Text color={theme.textMuted}>{"->"}</Text>}
                    <Text
                      color={
                        phase.status === "active"
                          ? theme.accent
                          : phase.status === "done"
                            ? theme.success
                            : theme.textMuted
                      }
                    >
                      {phase.name}
                    </Text>
                  </React.Fragment>
                ))}
              </Box>
            </>
          ) : (
            <Text color={theme.textMuted}>No active review loop</Text>
          )}
        </Box>

        <Box flexDirection="column">
          <Text color={theme.text} bold>Findings</Text>
          {lobster.openFindings.length === 0 ? (
            <Text color={theme.textMuted}>No open findings</Text>
          ) : (
            <>
              <Text color={theme.text}>{lobster.openFindings.length} open</Text>
              {findingsSummary && <Text color={theme.textMuted}>({findingsSummary})</Text>}
            </>
          )}
        </Box>

        <Box flexDirection="column">
          <Text color={theme.text} bold>Memory</Text>
          <Text color={theme.textMuted}>{lobster.memoryStats.total} entries</Text>
        </Box>

        <Box flexDirection="column">
          <Text color={theme.text} bold>Cost</Text>
          <Text color={theme.textMuted}>${lobster.totalCost.toFixed(2)} total</Text>
        </Box>

        {budgetPercent !== null && lobster.budget?.budget_usd && (
          <Box flexDirection="column">
            <Text color={theme.text} bold>Budget</Text>
            <Box gap={1}>
              <Text color={budgetColor}>{progressBar(budgetPercent)}</Text>
              <Text color={theme.text}>{Math.round(budgetPercent)}%</Text>
              <Text color={theme.textMuted}>
                (${lobster.totalCost.toFixed(2)} / ${lobster.budget.budget_usd.toFixed(2)})
              </Text>
            </Box>
          </Box>
        )}

        {recentSessions.length > 0 && (
          <Box flexDirection="column">
            <Text color={theme.text} bold>Recent Sessions</Text>
            {recentSessions.map((item, index) => (
              <Box key={`${item.title}-${index}`} gap={1}>
                <Text color={theme.text}>{item.time}</Text>
                <Text color={theme.textMuted}>{item.title}</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}
