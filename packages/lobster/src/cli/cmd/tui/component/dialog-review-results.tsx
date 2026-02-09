import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "@tui/ui/dialog"
import { useLobster } from "@tui/context/lobster"
import type { ReviewFinding } from "@tui/context/lobster"
import { Show, For, createSignal, createMemo, createEffect } from "solid-js"
import { useKeyboard } from "@opentui/solid"

export function DialogReviewResults() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const lobster = useLobster()
  const [hover, setHover] = createSignal(false)
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [expandedIndex, setExpandedIndex] = createSignal<number | null>(null)

  const sortedFindings = createMemo(() => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    return [...lobster.findings()].sort((a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4))
  })

  // Clamp selectedIndex when findings change to prevent out-of-bounds access
  createEffect(() => {
    const max = sortedFindings().length - 1
    if (selectedIndex() > max) setSelectedIndex(Math.max(0, max))
  })

  const currentIteration = createMemo(() => {
    const f = lobster.findings()
    if (f.length === 0) return 0
    return Math.max(...f.map((x) => x.iteration))
  })

  const severityColor = (severity: ReviewFinding["severity"]) => {
    const map = {
      critical: theme.error,
      high: theme.warning,
      medium: theme.info,
      low: theme.textMuted,
    }
    return map[severity]
  }

  const severityLabel = (severity: ReviewFinding["severity"]) => {
    const map = {
      critical: "CRIT",
      high: "HIGH",
      medium: "MED",
      low: "LOW",
    }
    return map[severity]
  }

  useKeyboard((evt) => {
    const items = sortedFindings()
    if (items.length === 0) return

    if (evt.name === "up" || evt.name === "k") {
      evt.preventDefault()
      setSelectedIndex((i) => Math.max(0, i - 1))
    }
    if (evt.name === "down" || evt.name === "j") {
      evt.preventDefault()
      setSelectedIndex((i) => Math.min(items.length - 1, i + 1))
    }
    if (evt.name === "return") {
      evt.preventDefault()
      setExpandedIndex((prev) => (prev === selectedIndex() ? null : selectedIndex()))
    }
    if (evt.name === "a" && !evt.ctrl && !evt.meta) {
      evt.preventDefault()
      const finding = items[selectedIndex()]
      if (finding) lobster.updateFinding(finding.id, "accepted")
    }
    if (evt.name === "r" && !evt.ctrl && !evt.meta) {
      evt.preventDefault()
      const finding = items[selectedIndex()]
      if (finding) lobster.updateFinding(finding.id, "rejected")
    }
    if (evt.name === "s" && !evt.ctrl && !evt.meta) {
      evt.preventDefault()
      const finding = items[selectedIndex()]
      if (finding) lobster.updateFinding(finding.id, "skipped")
    }
  })

  const counts = createMemo(() => lobster.findingsBySeverity())

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Review Results{currentIteration() > 0 ? ` (Iteration ${currentIteration()})` : ""}
        </text>
        <box
          paddingLeft={1}
          paddingRight={1}
          backgroundColor={hover() ? theme.primary : undefined}
          onMouseOver={() => setHover(true)}
          onMouseOut={() => setHover(false)}
          onMouseUp={() => dialog.clear()}
        >
          <text fg={hover() ? theme.selectedListItemText : theme.textMuted}>esc</text>
        </box>
      </box>
      <Show when={sortedFindings().length > 0} fallback={<text fg={theme.textMuted}>No review findings yet</text>}>
        <box>
          <For each={sortedFindings()}>
            {(finding, index) => {
              const isSelected = () => selectedIndex() === index()
              const isExpanded = () => expandedIndex() === index()
              const indicator = () => (isSelected() ? "\u25b8" : " ")

              return (
                <box>
                  <box flexDirection="row" gap={1}>
                    <text fg={isSelected() ? theme.text : theme.textMuted}>{indicator()}</text>
                    <text fg={severityColor(finding.severity)}>[{severityLabel(finding.severity)}]</text>
                    <text fg={isSelected() ? theme.text : theme.textMuted}>
                      {finding.title}
                      {finding.file ? `:${finding.line ?? ""}` : ""}
                    </text>
                    <Show when={finding.status !== "open"}>
                      <text fg={theme.textMuted}>({finding.status})</text>
                    </Show>
                  </box>
                  <Show when={isExpanded()}>
                    <box paddingLeft={3}>
                      <text fg={theme.textMuted} wrapMode="word">
                        Details: {finding.description}
                      </text>
                      <Show when={finding.file}>
                        <text fg={theme.textMuted}>
                          File: {finding.file}
                          {finding.line ? `:${finding.line}` : ""}
                        </text>
                      </Show>
                      <text fg={theme.info}>
                        [a] Accept  [r] Reject  [s] Skip
                      </text>
                    </box>
                  </Show>
                </box>
              )
            }}
          </For>
        </box>
        <box flexDirection="row" gap={1}>
          <text fg={theme.error}>{counts().critical} Critical</text>
          <text fg={theme.textMuted}>|</text>
          <text fg={theme.warning}>{counts().high} High</text>
          <text fg={theme.textMuted}>|</text>
          <text fg={theme.info}>{counts().medium} Medium</text>
          <text fg={theme.textMuted}>|</text>
          <text fg={theme.textMuted}>{counts().low} Low</text>
        </box>
      </Show>
    </box>
  )
}
