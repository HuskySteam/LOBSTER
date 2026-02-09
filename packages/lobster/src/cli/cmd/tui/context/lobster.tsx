import { createSignal, createMemo, onCleanup, batch } from "solid-js"
import { watch, type FSWatcher } from "node:fs"
import { rename, writeFile } from "node:fs/promises"
import path from "path"
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

    // Write queue for atomic findings writes
    const writeQueue: Array<ReviewFinding[]> = []
    let writing = false

    async function processWriteQueue() {
      if (writing) return
      writing = true
      try {
        while (writeQueue.length > 0) {
          const data = writeQueue[writeQueue.length - 1]!
          // Drain all queued writes, only the latest matters
          writeQueue.length = 0
          const findingsPath = ".lobster/memory/review-findings.json"
          const tmpPath = findingsPath + ".tmp." + Date.now()
          await writeFile(tmpPath, JSON.stringify(data, null, 2))
          await rename(tmpPath, findingsPath)
        }
      } finally {
        writing = false
      }
    }

    const memoryDir = ".lobster/memory"
    const fileSignals: Record<string, () => void> = {
      "review-loop-state.json": () =>
        Bun.file(path.join(memoryDir, "review-loop-state.json")).json().catch(() => null)
          .then((rl) => setReviewLoop(rl as ReviewLoopState | null)),
      "cost-tracking.json": () =>
        Bun.file(path.join(memoryDir, "cost-tracking.json")).json().catch(() => null)
          .then((c) => setCost(c as CostTracking | null)),
      "cost-budget.json": () =>
        Bun.file(path.join(memoryDir, "cost-budget.json")).json().catch(() => null)
          .then((b) => setBudget(b as CostBudget | null)),
      "review-findings.json": () => {
        if (writing || writeQueue.length > 0) return
        Bun.file(path.join(memoryDir, "review-findings.json")).json().catch(() => null)
          .then((f) => setFindings(Array.isArray(f) ? (f as ReviewFinding[]) : []))
      },
      "index.json": () =>
        Bun.file(path.join(memoryDir, "index.json")).json().catch(() => null)
          .then((m) => setMemoryIndex(Array.isArray(m) ? (m as MemoryEntry[]) : [])),
      "pattern-insights.json": () =>
        Bun.file(path.join(memoryDir, "pattern-insights.json")).json().catch(() => null)
          .then((p) => setPatterns(Array.isArray(p) ? (p as PatternInsight[]) : [])),
    }

    async function refresh() {
      await Promise.all([
        Bun.file(path.join(memoryDir, "review-loop-state.json")).json().catch(() => null),
        Bun.file(path.join(memoryDir, "cost-tracking.json")).json().catch(() => null),
        Bun.file(path.join(memoryDir, "cost-budget.json")).json().catch(() => null),
        Bun.file(path.join(memoryDir, "review-findings.json")).json().catch(() => null),
        Bun.file(path.join(memoryDir, "index.json")).json().catch(() => null),
        Bun.file(path.join(memoryDir, "pattern-insights.json")).json().catch(() => null),
      ]).then(([rl, c, b, f, m, p]) => {
        batch(() => {
          setReviewLoop(rl as ReviewLoopState | null)
          setCost(c as CostTracking | null)
          setBudget(b as CostBudget | null)
          if (!writing && writeQueue.length === 0) {
            setFindings(Array.isArray(f) ? (f as ReviewFinding[]) : [])
          }
          setMemoryIndex(Array.isArray(m) ? (m as MemoryEntry[]) : [])
          setPatterns(Array.isArray(p) ? (p as PatternInsight[]) : [])
        })
      })
    }

    // Use fs.watch on the memory directory, fallback to polling at 10s
    let watcher: FSWatcher | undefined
    let debounceTimer: Timer | undefined
    try {
      watcher = watch(memoryDir, (_eventType, filename) => {
        if (!filename) return
        // Debounce rapid changes (e.g. atomic write = create tmp + rename)
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          const handler = fileSignals[filename]
          if (handler) handler()
        }, 100)
      })
    } catch {
      // Directory may not exist yet; fall back to polling
    }

    // Fallback polling at 10s in case fs.watch is unavailable or misses events
    const interval = setInterval(refresh, 10_000)
    refresh()

    onCleanup(() => {
      clearInterval(interval)
      if (debounceTimer) clearTimeout(debounceTimer)
      watcher?.close()
    })

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
      const updated = findings().map((f) => (f.id === id ? { ...f, status } : f))
      setFindings(updated)
      writeQueue.push(updated)
      await processWriteQueue()
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
