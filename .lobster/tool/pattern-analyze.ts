/// <reference path="../env.d.ts" />
import { tool } from "@lobster-ai/plugin"
import description from "./pattern-analyze.txt"
import path from "path"
import { mkdir } from "node:fs/promises"

export default tool({
  description,
  args: {},
  async execute(_args, context) {
    const memoryDir = path.join(context.directory, ".lobster", "memory")
    const indexPath = path.join(memoryDir, "index.json")
    const findingsPath = path.join(memoryDir, "review-findings.json")
    const outputPath = path.join(memoryDir, "pattern-insights.json")

    const index: any[] = await Bun.file(indexPath).json().catch(() => [])
    const findings: any[] = await Bun.file(findingsPath).json().catch(() => [])

    if (findings.length === 0 && index.length === 0) {
      return "No data available for pattern analysis. Run some review loops first."
    }

    const insights: any[] = []
    let idCounter = 0

    // Group findings by title similarity (simple word overlap)
    const groups: Record<string, any[]> = {}
    for (const f of findings) {
      const key = f.title.toLowerCase().split(/\s+/).slice(0, 3).join(" ")
      if (!groups[key]) groups[key] = []
      groups[key].push(f)
    }

    // Detect recurring anti-patterns (issues that appear 2+ times)
    for (const [key, group] of Object.entries(groups)) {
      if (group.length < 2) continue
      const sorted = [...group].sort((a: any, b: any) =>
        (a.iteration || 0) - (b.iteration || 0)
      )
      // Compare frequency across iteration halves using the global midpoint
      const allIterations = [...new Set(findings.map((f: any) => f.iteration))].sort((a: number, b: number) => a - b)
      const globalMid = allIterations.length > 1 ? allIterations[Math.floor(allIterations.length / 2)] : 0
      const earlyCount = sorted.filter((f: any) => (f.iteration || 0) <= globalMid).length
      const lateCount = sorted.filter((f: any) => (f.iteration || 0) > globalMid).length
      const trend = lateCount > earlyCount ? "degrading" : lateCount < earlyCount ? "improving" : "stable"

      const relatedFiles = [...new Set(group.filter((f: any) => f.file).map((f: any) => f.file))]

      insights.push({
        id: `pattern-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${idCounter++}`,
        type: "recurring_antipattern",
        title: group[0].title,
        description: `Found ${group.length} occurrences across iterations. ${trend === "degrading" ? "Getting worse over time." : trend === "improving" ? "Improving over time." : "Stable frequency."}`,
        frequency: group.length,
        first_seen: sorted[0].iteration ? `iteration ${sorted[0].iteration}` : "unknown",
        last_seen: sorted[sorted.length - 1].iteration ? `iteration ${sorted[sorted.length - 1].iteration}` : "unknown",
        related_files: relatedFiles,
        trend,
        confidence: Math.min(0.5 + group.length * 0.1, 1.0),
      })
    }

    // Detect trends by severity over iterations
    const iterations = [...new Set(findings.map((f: any) => f.iteration))].sort()
    if (iterations.length >= 2) {
      const midIter = iterations[Math.floor(iterations.length / 2)]
      const earlyFindings = findings.filter((f: any) => f.iteration <= midIter)
      const lateFindings = findings.filter((f: any) => f.iteration > midIter)

      if (earlyFindings.length > lateFindings.length) {
        insights.push({
          id: `pattern-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${idCounter++}`,
          type: "improving_trend",
          title: "Overall code quality improving",
          description: `Issues decreased from ${earlyFindings.length} to ${lateFindings.length} across iterations.`,
          frequency: 1,
          first_seen: `iteration ${iterations[0]}`,
          last_seen: `iteration ${iterations[iterations.length - 1]}`,
          related_files: [],
          trend: "improving",
          confidence: 0.7,
        })
      } else if (lateFindings.length > earlyFindings.length) {
        insights.push({
          id: `pattern-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${idCounter++}`,
          type: "degrading_trend",
          title: "Code quality needs attention",
          description: `Issues increased from ${earlyFindings.length} to ${lateFindings.length} across iterations.`,
          frequency: 1,
          first_seen: `iteration ${iterations[0]}`,
          last_seen: `iteration ${iterations[iterations.length - 1]}`,
          related_files: [],
          trend: "degrading",
          confidence: 0.7,
        })
      }
    }

    // Extract lessons from memories
    const lessonMemories = index.filter((m: any) =>
      m.category === "lesson" || m.category === "mistake" || m.tags?.some((t: string) => t === "lesson" || t === "best-practice")
    )
    for (const mem of lessonMemories) {
      insights.push({
        id: `pattern-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${idCounter++}`,
        type: "lesson_learned",
        title: mem.title,
        description: mem.summary,
        frequency: 1,
        first_seen: mem.created_at,
        last_seen: mem.created_at,
        related_files: [],
        trend: "stable",
        confidence: 0.8,
      })
    }

    await mkdir(memoryDir, { recursive: true })
    await Bun.write(outputPath, JSON.stringify(insights, null, 2))

    return [
      `## Pattern Analysis Complete`,
      "",
      `Found ${insights.length} insights:`,
      `- ${insights.filter((i: any) => i.type === "recurring_antipattern").length} recurring anti-patterns`,
      `- ${insights.filter((i: any) => i.type === "improving_trend" || i.type === "degrading_trend").length} trends`,
      `- ${insights.filter((i: any) => i.type === "lesson_learned").length} lessons learned`,
      "",
      `Results written to .lobster/memory/pattern-insights.json`,
    ].join("\n")
  },
})
