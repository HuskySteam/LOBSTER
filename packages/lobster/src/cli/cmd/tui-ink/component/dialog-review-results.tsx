/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React, { useEffect, useMemo, useState } from "react"
import { useTheme } from "../theme"
import { useDialog } from "../ui/dialog"
import { useLobster, type ReviewFinding } from "../context/lobster"

function severityWeight(severity: ReviewFinding["severity"]): number {
  if (severity === "critical") return 0
  if (severity === "high") return 1
  if (severity === "medium") return 2
  return 3
}

export function DialogReviewResults() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const lobster = useLobster()
  const [selected, setSelected] = useState(0)
  const [expanded, setExpanded] = useState<number | null>(null)

  const findings = useMemo(
    () => [...lobster.findings].sort((a, b) => severityWeight(a.severity) - severityWeight(b.severity)),
    [lobster.findings],
  )

  useEffect(() => {
    if (selected >= findings.length) {
      setSelected(Math.max(0, findings.length - 1))
    }
  }, [findings.length, selected])

  const iteration = useMemo(() => {
    if (findings.length === 0) return 0
    return Math.max(...findings.map((x) => x.iteration))
  }, [findings])

  const counts = lobster.findingsBySeverity

  useInput((ch, key) => {
    if (key.escape) {
      dialog.clear()
      return
    }
    if (findings.length === 0) return

    if (key.upArrow || ch === "k") {
      setSelected((value) => Math.max(0, value - 1))
      return
    }
    if (key.downArrow || ch === "j") {
      setSelected((value) => Math.min(findings.length - 1, value + 1))
      return
    }
    if (key.return) {
      setExpanded((prev) => (prev === selected ? null : selected))
      return
    }

    if (expanded === selected) {
      const item = findings[selected]
      if (!item) return
      if (ch === "a") {
        void lobster.updateFinding(item.id, "accepted")
        return
      }
      if (ch === "r") {
        void lobster.updateFinding(item.id, "rejected")
        return
      }
      if (ch === "s") {
        void lobster.updateFinding(item.id, "skipped")
      }
    }
  })

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Box justifyContent="space-between">
        <Text color={theme.text} bold>
          Review Results{iteration > 0 ? ` (Iteration ${iteration})` : ""}
        </Text>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>

      {findings.length === 0 ? (
        <Box marginTop={1}>
          <Text color={theme.textMuted}>No review findings yet</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {findings.map((item, index) => {
            const isSelected = selected === index
            const isExpanded = expanded === index
            const color =
              item.severity === "critical"
                ? theme.error
                : item.severity === "high"
                  ? theme.warning
                  : item.severity === "medium"
                    ? theme.info
                    : theme.textMuted

            return (
              <Box key={item.id} flexDirection="column">
                <Box gap={1}>
                  <Text color={isSelected ? theme.text : theme.textMuted}>{isSelected ? ">" : " "}</Text>
                  <Text color={color}>
                    [{item.severity === "critical" ? "CRIT" : item.severity.toUpperCase()}]
                  </Text>
                  <Text color={isSelected ? theme.text : theme.textMuted}>
                    {item.title}
                    {item.file ? ` (${item.file}${item.line ? `:${item.line}` : ""})` : ""}
                  </Text>
                  {item.status !== "open" && (
                    <Text color={theme.textMuted}>({item.status})</Text>
                  )}
                </Box>

                {isExpanded && (
                  <Box paddingLeft={3} flexDirection="column">
                    <Text color={theme.textMuted} wrap="wrap">
                      {item.description}
                    </Text>
                    <Text color={theme.info}>[a] accept  [r] reject  [s] skip</Text>
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>
      )}

      <Box marginTop={1} gap={1}>
        <Text color={theme.error}>{counts.critical} Critical</Text>
        <Text color={theme.textMuted}>|</Text>
        <Text color={theme.warning}>{counts.high} High</Text>
        <Text color={theme.textMuted}>|</Text>
        <Text color={theme.info}>{counts.medium} Medium</Text>
        <Text color={theme.textMuted}>|</Text>
        <Text color={theme.textMuted}>{counts.low} Low</Text>
      </Box>
    </Box>
  )
}
