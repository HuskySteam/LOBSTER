/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React, { useMemo } from "react"
import { useTheme } from "../theme"
import { useDialog } from "../ui/dialog"
import { useLobster } from "../context/lobster"

export function DialogPatterns() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const lobster = useLobster()

  useInput((_ch, key) => {
    if (key.escape || key.return) dialog.clear()
  })

  const antipatterns = useMemo(
    () => lobster.patterns.filter((x) => x.type === "recurring_antipattern"),
    [lobster.patterns],
  )
  const trends = useMemo(
    () => lobster.patterns.filter((x) => x.type === "improving_trend" || x.type === "degrading_trend"),
    [lobster.patterns],
  )
  const lessons = useMemo(
    () => lobster.patterns.filter((x) => x.type === "lesson_learned"),
    [lobster.patterns],
  )

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Box justifyContent="space-between">
        <Text color={theme.text} bold>Pattern Insights</Text>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>

      {lobster.patterns.length === 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.textMuted}>No pattern insights yet</Text>
          <Text color={theme.textMuted}>
            Run <Text color={theme.text}>/patterns</Text> or finish a review loop to generate insights
          </Text>
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column" gap={1}>
          {antipatterns.length > 0 && (
            <Box flexDirection="column">
              <Text color={theme.text} bold>Recurring Anti-Patterns</Text>
              {antipatterns.map((item) => (
                <Box key={item.id} flexDirection="column">
                  <Box gap={1}>
                    <Text
                      color={
                        item.trend === "degrading"
                          ? theme.error
                          : item.trend === "improving"
                            ? theme.success
                            : theme.warning
                      }
                    >
                      ^
                    </Text>
                    <Text color={theme.text}>{item.title}</Text>
                    <Text color={theme.textMuted}>({item.frequency}x, {item.trend})</Text>
                  </Box>
                  {item.related_files.length > 0 && (
                    <Text color={theme.textMuted}>  {item.related_files.join(", ")}</Text>
                  )}
                </Box>
              ))}
            </Box>
          )}

          {trends.length > 0 && (
            <Box flexDirection="column">
              <Text color={theme.text} bold>Trends</Text>
              {trends.map((item) => (
                <Box key={item.id} gap={1}>
                  <Text color={item.trend === "improving" ? theme.success : theme.error}>
                    {item.trend === "improving" ? "up" : "down"}
                  </Text>
                  <Text color={item.trend === "improving" ? theme.success : theme.error}>
                    {item.title}
                  </Text>
                  <Text color={theme.textMuted}>{item.description}</Text>
                </Box>
              ))}
            </Box>
          )}

          {lessons.length > 0 && (
            <Box flexDirection="column">
              <Text color={theme.text} bold>Lessons Learned</Text>
              {lessons.map((item) => (
                <Box key={item.id} flexDirection="column">
                  <Box gap={1}>
                    <Text color={theme.text}>*</Text>
                    <Text color={theme.text}>{item.title}</Text>
                  </Box>
                  {item.description && (
                    <Text color={theme.textMuted}>  {item.description}</Text>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}
