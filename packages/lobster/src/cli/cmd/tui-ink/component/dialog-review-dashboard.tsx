/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React from "react"
import { useTheme } from "../theme"
import { useDialog } from "../ui/dialog"
import { useLobster } from "../context/lobster"

function progressBar(percent: number, width = 20): string {
  const clamped = Math.max(0, Math.min(100, percent))
  const filled = Math.round((clamped / 100) * width)
  return "#".repeat(filled) + "-".repeat(width - filled)
}

export function DialogReviewDashboard() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const lobster = useLobster()

  useInput((_ch, key) => {
    if (key.escape || key.return) dialog.clear()
  })

  const loop = lobster.reviewLoop

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Box justifyContent="space-between">
        <Text color={theme.text} bold>Review Loop Dashboard</Text>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>

      {!loop ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.textMuted}>No active review loop</Text>
          <Text color={theme.textMuted}>
            Use <Text color={theme.text}>/review</Text> to start a review cycle
          </Text>
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column" gap={1}>
          <Text color={theme.text}>
            Task: <Text color={theme.accent}>{loop.task ?? "unnamed task"}</Text>
          </Text>
          <Text color={theme.text}>
            Iteration: <Text color={theme.accent}>{loop.iteration ?? 0}</Text>
            <Text color={theme.textMuted}> / {loop.max_iterations ?? "?"}</Text>
          </Text>

          <Box flexDirection="column">
            <Text color={theme.text} bold>Phase</Text>
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
                    bold={phase.status === "active"}
                  >
                    [{phase.name}]
                  </Text>
                </React.Fragment>
              ))}
            </Box>
          </Box>

          <Box flexDirection="column">
            <Text color={theme.text} bold>Quality Score</Text>
            <Box gap={1}>
              <Text
                color={
                  lobster.qualityScore >= 70
                    ? theme.success
                    : lobster.qualityScore >= 40
                      ? theme.warning
                      : theme.error
                }
              >
                {progressBar(lobster.qualityScore)}
              </Text>
              <Text color={theme.text}>{lobster.qualityScore}%</Text>
            </Box>
          </Box>

          {(loop.history ?? []).length > 0 && (
            <Box flexDirection="column">
              <Text color={theme.text} bold>Verdict History</Text>
              {(loop.history ?? []).map((entry) => (
                <Box key={entry.iteration} gap={1}>
                  <Text color={theme.textMuted}>#{entry.iteration}:</Text>
                  <Text
                    color={
                      entry.verdict === "PASS"
                        ? theme.success
                        : entry.verdict === "NEEDS_REVISION"
                          ? theme.warning
                          : theme.accent
                    }
                    bold
                  >
                    {entry.verdict}
                  </Text>
                  {(entry.issues?.length ?? 0) > 0 && (
                    <Text color={theme.textMuted}>({entry.issues?.length} issues)</Text>
                  )}
                </Box>
              ))}
            </Box>
          )}

          {lobster.totalIssuesFound > 0 && (
            <Text color={theme.textMuted}>Total issues found: {lobster.totalIssuesFound}</Text>
          )}
        </Box>
      )}
    </Box>
  )
}
