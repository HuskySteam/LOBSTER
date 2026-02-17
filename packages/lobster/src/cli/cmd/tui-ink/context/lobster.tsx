/** @jsxImportSource react */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import path from "path"
import { mkdir } from "node:fs/promises"
import { useAppStore } from "../store"

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

type MemoryEntry = {
  id: string
  category: string
  title: string
  tags: string[]
  created_at: string
  summary: string
}

type PatternInsight = {
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

type ProjectQualityCategory = {
  score: number
  findings: string[]
  suggestions: string[]
}

type ProjectQuality = {
  overall_score: number
  summary: string
  categories: {
    code_structure: ProjectQualityCategory
    testing: ProjectQualityCategory
    documentation: ProjectQualityCategory
    dependencies: ProjectQualityCategory
    security: ProjectQualityCategory
  }
  analyzed_at: number
}

type LobsterContextValue = {
  reviewLoop: ReviewLoopState | null
  cost: CostTracking | null
  budget: CostBudget | null
  findings: ReviewFinding[]
  memoryIndex: MemoryEntry[]
  patterns: PatternInsight[]
  projectQuality: ProjectQuality | null
  analysisRunning: boolean
  setAnalysisRunning: (running: boolean) => void
  totalCost: number
  qualityScore: number
  totalIssuesFound: number
  phaseList: Array<{ name: string; status: "waiting" | "active" | "done" }>
  memoryStats: { total: number; byCategory: Record<string, number> }
  openFindings: ReviewFinding[]
  findingsBySeverity: { critical: number; high: number; medium: number; low: number }
  refresh: () => Promise<void>
  updateFinding: (id: string, status: ReviewFinding["status"]) => Promise<void>
}

const LobsterContext = createContext<LobsterContextValue | undefined>(undefined)

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return (await Bun.file(filePath).json()) as T
  } catch {
    return fallback
  }
}

export function LobsterProvider(props: { children: ReactNode }) {
  const projectDir = useAppStore((s) => s.path.directory)
  const allMessages = useAppStore((s) => s.message)

  const [reviewLoop, setReviewLoop] = useState<ReviewLoopState | null>(null)
  const [cost, setCost] = useState<CostTracking | null>(null)
  const [budget, setBudget] = useState<CostBudget | null>(null)
  const [findings, setFindings] = useState<ReviewFinding[]>([])
  const [memoryIndex, setMemoryIndex] = useState<MemoryEntry[]>([])
  const [patterns, setPatterns] = useState<PatternInsight[]>([])
  const [projectQuality, setProjectQuality] = useState<ProjectQuality | null>(null)
  const [analysisRunning, setAnalysisRunning] = useState(false)

  const memoryDir = useMemo(() => {
    if (!projectDir) return ""
    return path.join(projectDir, ".lobster", "memory")
  }, [projectDir])

  const refresh = useCallback(async () => {
    if (!memoryDir) {
      setReviewLoop(null)
      setCost(null)
      setBudget(null)
      setFindings([])
      setMemoryIndex([])
      setPatterns([])
      setProjectQuality(null)
      return
    }

    const [rl, c, b, f, m, p, q] = await Promise.all([
      readJson<ReviewLoopState | null>(path.join(memoryDir, "review-loop-state.json"), null),
      readJson<CostTracking | null>(path.join(memoryDir, "cost-tracking.json"), null),
      readJson<CostBudget | null>(path.join(memoryDir, "cost-budget.json"), null),
      readJson<ReviewFinding[]>(path.join(memoryDir, "review-findings.json"), []),
      readJson<MemoryEntry[]>(path.join(memoryDir, "index.json"), []),
      readJson<PatternInsight[]>(path.join(memoryDir, "pattern-insights.json"), []),
      readJson<ProjectQuality | null>(path.join(memoryDir, "project-quality.json"), null),
    ])

    setReviewLoop(rl)
    setCost(c)
    setBudget(b)
    setFindings(Array.isArray(f) ? f : [])
    setMemoryIndex(Array.isArray(m) ? m : [])
    setPatterns(Array.isArray(p) ? p : [])
    setProjectQuality(q)
  }, [memoryDir])

  useEffect(() => {
    void refresh()
    if (!memoryDir) return
    const timer = setInterval(() => {
      void refresh()
    }, 10_000)
    return () => clearInterval(timer)
  }, [memoryDir, refresh])

  const totalCost = useMemo(() => {
    if (cost?.sessions) {
      const sum = Object.values(cost.sessions).reduce((acc, value) => acc + (value?.total_cost || 0), 0)
      if (sum > 0) return sum
    }

    let sum = 0
    for (const list of Object.values(allMessages)) {
      for (const msg of list) {
        if (msg.role === "assistant") sum += msg.cost
      }
    }
    return sum
  }, [cost, allMessages])

  const qualityScore = useMemo(() => {
    if (projectQuality) return projectQuality.overall_score
    if (!reviewLoop?.history || reviewLoop.history.length === 0) return 0
    const passes = reviewLoop.history.filter((x) => x.verdict === "PASS").length
    return Math.round((passes / reviewLoop.history.length) * 100)
  }, [projectQuality, reviewLoop])

  const totalIssuesFound = useMemo(() => {
    if (!reviewLoop?.history) return 0
    return reviewLoop.history.reduce((sum, item) => sum + (item.issues?.length || 0), 0)
  }, [reviewLoop])

  const phaseList = useMemo(() => {
    const phases: Array<{ name: string; status: "waiting" | "active" | "done" }> = [
      { name: "Coder", status: "waiting" },
      { name: "Reviewer", status: "waiting" },
      { name: "Tester", status: "waiting" },
    ]

    const phase = reviewLoop?.current_phase || reviewLoop?.phase || ""
    if (!reviewLoop || phase === "completed_pass" || phase === "completed_max_iterations") {
      return phases.map((x) => ({ ...x, status: "done" as const }))
    }
    if (phase === "coding" || phase === "fixing") {
      phases[0].status = "active"
      return phases
    }
    if (phase === "reviewing") {
      phases[0].status = "done"
      phases[1].status = "active"
      return phases
    }
    if (phase === "testing") {
      phases[0].status = "done"
      phases[1].status = "done"
      phases[2].status = "active"
      return phases
    }
    return phases
  }, [reviewLoop])

  const memoryStats = useMemo(() => {
    const byCategory: Record<string, number> = {}
    for (const item of memoryIndex) {
      byCategory[item.category] = (byCategory[item.category] || 0) + 1
    }
    return { total: memoryIndex.length, byCategory }
  }, [memoryIndex])

  const openFindings = useMemo(
    () => findings.filter((x) => x.status === "open"),
    [findings],
  )

  const findingsBySeverity = useMemo(() => {
    const result = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const finding of findings) {
      if (finding.severity in result) {
        result[finding.severity] += 1
      }
    }
    return result
  }, [findings])

  const updateFinding = useCallback(
    async (id: string, status: ReviewFinding["status"]) => {
      const next = findings.map((item) => (item.id === id ? { ...item, status } : item))
      setFindings(next)
      if (!memoryDir) return
      await mkdir(memoryDir, { recursive: true }).catch(() => {})
      await Bun.write(path.join(memoryDir, "review-findings.json"), JSON.stringify(next, null, 2))
    },
    [findings, memoryDir],
  )

  const value = useMemo<LobsterContextValue>(
    () => ({
      reviewLoop,
      cost,
      budget,
      findings,
      memoryIndex,
      patterns,
      projectQuality,
      analysisRunning,
      setAnalysisRunning,
      totalCost,
      qualityScore,
      totalIssuesFound,
      phaseList,
      memoryStats,
      openFindings,
      findingsBySeverity,
      refresh,
      updateFinding,
    }),
    [
      reviewLoop,
      cost,
      budget,
      findings,
      memoryIndex,
      patterns,
      projectQuality,
      analysisRunning,
      totalCost,
      qualityScore,
      totalIssuesFound,
      phaseList,
      memoryStats,
      openFindings,
      findingsBySeverity,
      refresh,
      updateFinding,
    ],
  )

  return <LobsterContext.Provider value={value}>{props.children}</LobsterContext.Provider>
}

export function useLobster(): LobsterContextValue {
  const ctx = useContext(LobsterContext)
  if (!ctx) throw new Error("useLobster must be used within LobsterProvider")
  return ctx
}
