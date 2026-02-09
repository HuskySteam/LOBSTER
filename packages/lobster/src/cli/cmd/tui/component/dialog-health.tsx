import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "@tui/ui/dialog"
import { useLobster } from "@tui/context/lobster"
import { useSync } from "@tui/context/sync"
import { Show, For, createSignal, createMemo } from "solid-js"

function progressBar(value: number, width: number = 20): string {
  const clamped = Math.max(0, Math.min(100, value))
  const filled = Math.round((clamped / 100) * width)
  const empty = width - filled
  return "\u2588".repeat(filled) + "\u2591".repeat(empty)
}

function qualityLabel(score: number): { text: string; level: "great" | "good" | "fair" | "poor" } {
  if (score >= 80) return { text: "GREAT", level: "great" }
  if (score >= 60) return { text: "GOOD", level: "good" }
  if (score >= 40) return { text: "FAIR", level: "fair" }
  return { text: "POOR", level: "poor" }
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
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
  const sync = useSync()
  const [hover, setHover] = createSignal(false)

  const quality = createMemo(() => {
    const score = lobster.qualityScore()
    const label = qualityLabel(score)
    return { score, ...label }
  })

  const qualityColor = createMemo(() => {
    const level = quality().level
    if (level === "great") return theme.success
    if (level === "good") return theme.accent
    if (level === "fair") return theme.warning
    return theme.error
  })

  const openCount = createMemo(() => lobster.openFindings().length)
  const severities = createMemo(() => lobster.findingsBySeverity())

  const findingsSummary = createMemo(() => {
    const s = severities()
    const parts: string[] = []
    if (s.critical > 0) parts.push(`${s.critical} critical`)
    if (s.high > 0) parts.push(`${s.high} high`)
    if (s.medium > 0) parts.push(`${s.medium} medium`)
    if (s.low > 0) parts.push(`${s.low} low`)
    return parts.join(", ")
  })

  const memory = createMemo(() => lobster.memoryStats())

  const memoryCategorySummary = createMemo(() => {
    const stats = memory()
    const entries = Object.entries(stats.byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, count]) => `${count} ${cat}`)
    return entries.join(", ")
  })

  const sessionCost = createMemo(() => {
    const c = lobster.cost()
    if (!c?.sessions) return 0
    const entries = Object.values(c.sessions)
    if (entries.length === 0) return 0
    const last = entries[entries.length - 1]
    return last?.total_cost ?? 0
  })

  const budgetPercent = createMemo(() => {
    const b = lobster.budget()
    if (!b?.budget_usd || b.budget_usd === 0) return null
    return Math.min(100, (lobster.totalCost() / b.budget_usd) * 100)
  })

  const budgetColor = createMemo(() => {
    const pct = budgetPercent()
    if (pct === null) return theme.textMuted
    if (pct >= 90) return theme.error
    if (pct >= 70) return theme.warning
    return theme.accent
  })

  const reviewLoopInfo = createMemo(() => {
    const rl = lobster.reviewLoop()
    if (!rl) return null
    const history = rl.history ?? []
    const lastEntry = history.length > 0 ? history[history.length - 1] : null
    const lastVerdict = lastEntry?.verdict ?? "none"
    return {
      task: rl.task ?? "unnamed task",
      phase: rl.current_phase ?? rl.phase ?? "idle",
      iteration: rl.iteration ?? 0,
      maxIterations: rl.max_iterations ?? 0,
      lastVerdict,
      history,
    }
  })

  const recentSessions = createMemo(() => {
    return sync.data.session
      .slice()
      .sort((a, b) => b.time.updated - a.time.updated)
      .slice(0, 5)
      .map((s) => ({
        time: formatTimeAgo(s.time.updated),
        title: s.title || "Untitled session",
      }))
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      {/* Dialog header */}
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Project Health Dashboard
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

      {/* Quality Score */}
      <box>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Quality Score
        </text>
        <box flexDirection="row" gap={1}>
          <text fg={qualityColor()}>{progressBar(quality().score)}</text>
          <text fg={theme.text}>{quality().score}%</text>
          <text fg={qualityColor()} attributes={TextAttributes.BOLD}>
            {quality().text}
          </text>
        </box>
        <Show when={reviewLoopInfo()}>
          {(info) => (
            <text fg={theme.textMuted}>
              Task: <span style={{ fg: theme.accent }}>{info().task}</span>
              {" \u2500 "}
              {info().lastVerdict === "PASS" ? "passed" : info().lastVerdict.toLowerCase()}{" "}
              iteration {info().iteration}/{info().maxIterations}
            </text>
          )}
        </Show>
      </box>

      {/* Review Loop Phase */}
      <Show when={reviewLoopInfo()}>
        {(info) => (
          <box>
            <text fg={theme.text} attributes={TextAttributes.BOLD}>
              Review Loop
            </text>
            <box flexDirection="row">
              <For each={lobster.phaseList()}>
                {(phase, index) => (
                  <box flexDirection="row">
                    <Show when={index() > 0}>
                      <text fg={theme.textMuted}>{" \u2500\u25B6 "}</text>
                    </Show>
                    <text
                      fg={
                        phase.status === "active"
                          ? theme.accent
                          : phase.status === "done"
                            ? theme.success
                            : theme.textMuted
                      }
                      attributes={phase.status === "active" ? TextAttributes.BOLD : undefined}
                    >
                      [{phase.name}]
                    </text>
                  </box>
                )}
              </For>
            </box>
            <Show when={info().history.length > 0}>
              <box marginTop={1}>
                <text fg={theme.textMuted}>Verdict History:</text>
                <For each={info().history}>
                  {(entry) => (
                    <box flexDirection="row" gap={1}>
                      <text fg={theme.textMuted}>#{entry.iteration}:</text>
                      <text
                        fg={
                          entry.verdict === "PASS"
                            ? theme.success
                            : entry.verdict === "NEEDS_REVISION"
                              ? theme.warning
                              : theme.accent
                        }
                        attributes={TextAttributes.BOLD}
                      >
                        {entry.verdict}
                      </text>
                      <Show when={entry.issues && entry.issues.length > 0}>
                        <text fg={theme.textMuted}>
                          ({entry.issues!.length} {entry.issues!.length === 1 ? "issue" : "issues"})
                        </text>
                      </Show>
                    </box>
                  )}
                </For>
              </box>
            </Show>
          </box>
        )}
      </Show>

      {/* Findings */}
      <box>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Findings
        </text>
        <Show
          when={openCount() > 0}
          fallback={<text fg={theme.textMuted}>No open findings</text>}
        >
          <box flexDirection="row" gap={1}>
            <text fg={severities().critical > 0 ? theme.error : theme.text}>
              {openCount()} open
            </text>
            <Show when={findingsSummary()}>
              <text fg={theme.textMuted}>({findingsSummary()})</text>
            </Show>
          </box>
          <For each={lobster.openFindings().slice(0, 5)}>
            {(finding) => (
              <box flexDirection="row" gap={1}>
                <text
                  flexShrink={0}
                  fg={
                    finding.severity === "critical"
                      ? theme.error
                      : finding.severity === "high"
                        ? theme.warning
                        : theme.textMuted
                  }
                >
                  {"\u2022"}
                </text>
                <text fg={theme.text} wrapMode="word">
                  <span
                    style={{
                      fg:
                        finding.severity === "critical"
                          ? theme.error
                          : finding.severity === "high"
                            ? theme.warning
                            : theme.textMuted,
                    }}
                  >
                    [{finding.severity}]
                  </span>{" "}
                  {finding.title}
                  <Show when={finding.file}>
                    <span style={{ fg: theme.textMuted }}> ({finding.file})</span>
                  </Show>
                </text>
              </box>
            )}
          </For>
        </Show>
      </box>

      {/* Memory */}
      <box>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Memory
        </text>
        <text fg={theme.textMuted}>
          {memory().total} {memory().total === 1 ? "entry" : "entries"}
          <Show when={memoryCategorySummary()}>
            {" "}({memoryCategorySummary()})
          </Show>
        </text>
      </box>

      {/* Cost */}
      <box>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Cost
        </text>
        <text fg={theme.textMuted}>
          ${sessionCost().toFixed(2)} session / ${lobster.totalCost().toFixed(2)} total
        </text>
      </box>

      {/* Budget */}
      <Show when={budgetPercent() !== null}>
        <box>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            Budget
          </text>
          <box flexDirection="row" gap={1}>
            <text fg={budgetColor()}>{progressBar(budgetPercent()!)}</text>
            <text fg={theme.text}>{Math.round(budgetPercent()!)}%</text>
            <text fg={theme.textMuted}>
              (${lobster.totalCost().toFixed(2)} / ${lobster.budget()!.budget_usd!.toFixed(2)})
            </text>
          </box>
        </box>
      </Show>

      {/* Recent Sessions */}
      <Show when={recentSessions().length > 0}>
        <box>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            Recent Sessions
          </text>
          <For each={recentSessions()}>
            {(s) => (
              <box flexDirection="row" gap={1}>
                <text fg={theme.text} flexShrink={0}>
                  {s.time.padEnd(9)}
                </text>
                <text fg={theme.textMuted}>{s.title}</text>
              </box>
            )}
          </For>
        </box>
      </Show>
    </box>
  )
}
