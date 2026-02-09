import { createSignal, createMemo, onCleanup, batch } from "solid-js"
import { createSimpleContext } from "./helper"

type ReviewLoopState = {
  task?: string
  phase?: string
  current_phase?: string
  iteration?: number
  max_iterations?: number
  history?: Array<{
    iteration: number
    verdict: string
    summary?: string
    issues?: string[]
  }>
}

type CostTracking = {
  sessions?: Record<
    string,
    {
      total_cost?: number
      models?: Record<
        string,
        {
          input_tokens?: number
          output_tokens?: number
          cost?: number
        }
      >
    }
  >
}

type CostBudget = {
  budget_usd?: number
  alert_threshold?: number
}

export type ReviewFinding = {
  id: string
  severity: "critical" | "high" | "medium" | "low"
  title: string
  description: string
  file?: string
  line?: number
  diff?: string
  status: "open" | "accepted" | "rejected" | "skipped"
  agent: string
  iteration: number
}

export type MemoryEntry = {
  id: string
  category: string
  title: string
  tags: string[]
  created_at: string
  summary: string
}

export type PatternInsight = {
  id: string
  type: "recurring_antipattern" | "improving_trend" | "degrading_trend" | "lesson_learned"
  title: string
  description: string
  frequency: number
  first_seen: string
  last_seen: string
  related_files: string[]
  trend: "improving" | "stable" | "degrading"
  confidence: number
}

export const { use: useLobster, provider: LobsterProvider } = createSimpleContext({
  name: "Lobster",
  init: () => {
    const [reviewLoop, setReviewLoop] = createSignal<ReviewLoopState | null>(null)
    const [cost, setCost] = createSignal<CostTracking | null>(null)
    const [budget, setBudget] = createSignal<CostBudget | null>(null)
    const [findings, setFindings] = createSignal<ReviewFinding[]>([])
    const [memoryIndex, setMemoryIndex] = createSignal<MemoryEntry[]>([])
    const [patterns, setPatterns] = createSignal<PatternInsight[]>([])

    // Write-lock: skip polling findings while a write is in-flight
    let findingsWritePending = false

    async function refresh() {
      const [rl, c, b, f, m, p] = await Promise.all([
        Bun.file(".lobster/memory/review-loop-state.json").json().catch(() => null),
        Bun.file(".lobster/memory/cost-tracking.json").json().catch(() => null),
        Bun.file(".lobster/memory/cost-budget.json").json().catch(() => null),
        Bun.file(".lobster/memory/review-findings.json").json().catch(() => null),
        Bun.file(".lobster/memory/index.json").json().catch(() => null),
        Bun.file(".lobster/memory/pattern-insights.json").json().catch(() => null),
      ])

      batch(() => {
        setReviewLoop(rl as ReviewLoopState | null)
        setCost(c as CostTracking | null)
        setBudget(b as CostBudget | null)
        // Skip findings update if a user-initiated write is pending
        if (!findingsWritePending) {
          setFindings(Array.isArray(f) ? (f as ReviewFinding[]) : [])
        }
        setMemoryIndex(Array.isArray(m) ? (m as MemoryEntry[]) : [])
        setPatterns(Array.isArray(p) ? (p as PatternInsight[]) : [])
      })
    }

    const interval = setInterval(refresh, 2000)
    refresh()
    onCleanup(() => clearInterval(interval))

    const totalCost = createMemo(() => {
      const c = cost()
      if (!c?.sessions) return 0
      return Object.values(c.sessions).reduce((sum: number, s) => sum + (s?.total_cost || 0), 0)
    })

    const qualityScore = createMemo(() => {
      const rl = reviewLoop()
      if (!rl?.history || rl.history.length === 0) return 0
      const passes = rl.history.filter((h) => h.verdict === "PASS").length
      return Math.round((passes / rl.history.length) * 100)
    })

    const totalIssuesFound = createMemo(() => {
      const rl = reviewLoop()
      if (!rl?.history) return 0
      return rl.history.reduce((sum, h) => sum + (h.issues?.length || 0), 0)
    })

    const phaseList = createMemo(() => {
      const rl = reviewLoop()
      const phase = rl?.current_phase || rl?.phase || ""
      const phases = [
        { name: "Coder", status: "waiting" as string },
        { name: "Reviewer", status: "waiting" as string },
        { name: "Tester", status: "waiting" as string },
      ]

      if (!rl || phase === "completed_pass" || phase === "completed_max_iterations") {
        return phases.map((p) => ({ ...p, status: "done" }))
      }

      if (phase === "coding" || phase === "fixing") {
        phases[0].status = "active"
      } else if (phase === "reviewing") {
        phases[0].status = "done"
        phases[1].status = "active"
      } else if (phase === "testing") {
        phases[0].status = "done"
        phases[1].status = "done"
        phases[2].status = "active"
      }

      return phases
    })

    const memoryStats = createMemo(() => {
      const idx = memoryIndex()
      const byCategory: Record<string, number> = {}
      for (const entry of idx) {
        byCategory[entry.category] = (byCategory[entry.category] || 0) + 1
      }
      return { total: idx.length, byCategory }
    })

    const openFindings = createMemo(() => findings().filter((f) => f.status === "open"))

    const findingsBySeverity = createMemo(() => {
      const f = findings()
      const counts = { critical: 0, high: 0, medium: 0, low: 0 }
      for (const item of f) {
        if (item.severity in counts) counts[item.severity]++
      }
      return counts
    })

    async function updateFinding(id: string, status: ReviewFinding["status"]) {
      findingsWritePending = true
      try {
        const updated = findings().map((f) => (f.id === id ? { ...f, status } : f))
        setFindings(updated)
        await Bun.write(".lobster/memory/review-findings.json", JSON.stringify(updated, null, 2))
      } finally {
        findingsWritePending = false
      }
    }

    return {
      reviewLoop,
      cost,
      budget,
      totalCost,
      refresh,
      findings,
      memoryIndex,
      patterns,
      qualityScore,
      totalIssuesFound,
      phaseList,
      memoryStats,
      openFindings,
      findingsBySeverity,
      updateFinding,
    }
  },
})
