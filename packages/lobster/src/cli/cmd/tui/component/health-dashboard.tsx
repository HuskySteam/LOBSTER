import { useTheme } from "../context/theme"
import { useLobster } from "@tui/context/lobster"
import { useSync } from "@tui/context/sync"
import { Show, For, createMemo } from "solid-js"
import { TextAttributes } from "@opentui/core"

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

export function HealthDashboard() {
  const { theme } = useTheme()
  const lobster = useLobster()
  const sync = useSync()

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
    // Return the most recent session's cost (last entry)
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
    const timeSinceStr = "recent"
    return {
      iteration: rl.iteration ?? 0,
      maxIterations: rl.max_iterations ?? 0,
      lastVerdict,
      timeSinceStr,
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
    <box flexGrow={1} flexBasis={0}>
      <text fg={theme.accent} attributes={TextAttributes.BOLD}>
        LOBSTER Project Health
      </text>

      {/* Quality Score */}
      <box marginTop={1}>
        <box flexDirection="row" gap={1}>
          <text fg={theme.text}>Quality</text>
          <text fg={qualityColor()}>{progressBar(quality().score)}</text>
          <text fg={theme.text}>{quality().score}%</text>
          <text fg={qualityColor()} attributes={TextAttributes.BOLD}>
            {quality().text}
          </text>
        </box>
        <Show when={reviewLoopInfo()}>
          {(info) => (
            <text fg={theme.textMuted}>
              Last review: {info().timeSinceStr}, {info().lastVerdict === "PASS" ? "passed" : info().lastVerdict.toLowerCase()}{" "}
              iteration {info().iteration}/{info().maxIterations}
            </text>
          )}
        </Show>
      </box>

      {/* Findings */}
      <box marginTop={1}>
        <box flexDirection="row" gap={1}>
          <text fg={theme.text}>Findings</text>
          <Show
            when={openCount() > 0}
            fallback={<text fg={theme.textMuted}>No open findings</text>}
          >
            <text fg={severities().critical > 0 ? theme.error : theme.text}>
              {openCount()} open
            </text>
            <Show when={findingsSummary()}>
              <text fg={theme.textMuted}>({findingsSummary()})</text>
            </Show>
          </Show>
        </box>
      </box>

      {/* Memory */}
      <box flexDirection="row" gap={1}>
        <text fg={theme.text}>Memory</text>
        <text fg={theme.textMuted}>
          {memory().total} {memory().total === 1 ? "entry" : "entries"}
          <Show when={memoryCategorySummary()}>
            {" "}({memoryCategorySummary()})
          </Show>
        </text>
      </box>

      {/* Cost */}
      <box flexDirection="row" gap={1}>
        <text fg={theme.text}>Cost</text>
        <text fg={theme.textMuted}>
          ${sessionCost().toFixed(2)} session / ${lobster.totalCost().toFixed(2)} total
        </text>
      </box>

      {/* Budget */}
      <Show when={budgetPercent() !== null}>
        <box flexDirection="row" gap={1}>
          <text fg={theme.text}>Budget</text>
          <text fg={budgetColor()}>{progressBar(budgetPercent()!)}</text>
          <text fg={theme.text}>{Math.round(budgetPercent()!)}%</text>
        </box>
      </Show>

      {/* Recent Sessions */}
      <Show when={recentSessions().length > 0}>
        <box marginTop={1}>
          <text fg={theme.accent} attributes={TextAttributes.BOLD}>
            Recent Sessions:
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
