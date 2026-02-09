/// <reference path="../env.d.ts" />
import { tool } from "@lobster-ai/plugin"
import DESCRIPTION from "./plan.txt"
import path from "path"
import { mkdir } from "node:fs/promises"

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "coverage",
  ".lobster", ".cache", ".turbo", "__pycache__", ".venv",
])

const SKIP_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".woff", ".woff2",
  ".ttf", ".eot", ".mp3", ".mp4", ".zip", ".tar", ".gz", ".lock",
  ".map", ".min.js", ".min.css",
])

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "this", "that", "are", "was",
  "be", "has", "had", "not", "no", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "can", "if", "then", "else", "when",
  "up", "out", "so", "as", "all", "each", "every", "both", "few", "more",
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\W_]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

interface FileEntry {
  relativePath: string
  terms: string[]
}

let fileCache: { files: FileEntry[], docFreq: Record<string, number>, timestamp: number } | null = null
const CACHE_TTL_MS = 30_000

interface FileAnalysis {
  path: string
  lineCount: number
  functionCount: number
  importCount: number
  exportCount: number
  complexity: "trivial" | "simple" | "moderate" | "complex"
}

interface PlanStep {
  id: number
  title: string
  description: string
  files: { path: string, action: "create" | "modify" | "delete", description: string }[]
  depends_on: number[]
  complexity: "trivial" | "simple" | "moderate" | "complex"
  status: "pending" | "in_progress" | "completed" | "skipped"
}

interface PlanRisk {
  title: string
  severity: "low" | "medium" | "high"
  description: string
  mitigation: string
}

interface ImplementationPlan {
  id: string
  task: string
  created_at: string
  updated_at: string
  status: "draft" | "in_progress" | "completed" | "abandoned"
  summary: string
  steps: PlanStep[]
  risks: PlanRisk[]
  estimated_complexity: "low" | "medium" | "high"
  total_files_affected: number
}

function analyzeFile(relativePath: string, content: string): FileAnalysis {
  const lines = content.split("\n")
  const lineCount = lines.length
  const functionCount = (content.match(/(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>|(?:async\s+)?(?:get|set|static\s+)?\w+\s*\([^)]*\)\s*\{)/g) || []).length
  const importCount = (content.match(/^import\s/gm) || []).length
  const exportCount = (content.match(/^export\s/gm) || []).length

  let complexity: FileAnalysis["complexity"] = "trivial"
  if (lineCount > 300 || functionCount > 15) complexity = "complex"
  else if (lineCount > 150 || functionCount > 8) complexity = "moderate"
  else if (lineCount > 50 || functionCount > 3) complexity = "simple"

  return { path: relativePath, lineCount, functionCount, importCount, exportCount, complexity }
}

function categorizeFile(relativePath: string): string {
  if (relativePath.match(/\.d\.ts$/)) return "types"
  if (relativePath.match(/types?\./i) || relativePath.match(/interfaces?\./i)) return "types"
  if (relativePath.match(/\.test\.|\.spec\.|__test__|__spec__/)) return "test"
  if (relativePath.match(/config|\.config\.|\.env/)) return "config"
  return "implementation"
}

function estimateOverallComplexity(analyses: FileAnalysis[], fileCount?: number): "low" | "medium" | "high" {
  if (analyses.length === 0) {
    // Fallback when no deep analysis available
    if (!fileCount) return "low"
    if (fileCount > 10) return "high"
    if (fileCount > 5) return "medium"
    return "low"
  }
  const complexCount = analyses.filter((a) => a.complexity === "complex").length
  const moderateCount = analyses.filter((a) => a.complexity === "moderate").length
  if (complexCount >= 2 || analyses.length > 10) return "high"
  if (complexCount >= 1 || moderateCount >= 3 || analyses.length > 5) return "medium"
  return "low"
}

export default tool({
  description: DESCRIPTION,
  args: {
    task: tool.schema.string().describe("Description of the task to plan"),
    analyze_depth: tool.schema
      .enum(["shallow", "deep"])
      .default("deep")
      .describe("How deeply to analyze files (shallow=names only, deep=read contents)"),
  },
  async execute(args, context) {
    const queryTerms = tokenize(args.task)
    if (queryTerms.length === 0) {
      return "Task description is too vague. Please provide more specific details."
    }

    // Scan project files (cached)
    const now = Date.now()
    if (!fileCache || (now - fileCache.timestamp) > CACHE_TTL_MS) {
      const scanned: FileEntry[] = []
      const glob = new Bun.Glob("**/*")

      for await (const entry of glob.scan({ cwd: context.directory, onlyFiles: true })) {
        const parts = entry.split("/")
        if (parts.some((p) => SKIP_DIRS.has(p))) continue

        const ext = path.extname(entry).toLowerCase()
        if (SKIP_EXTENSIONS.has(ext)) continue

        const fullPath = path.join(context.directory, entry)
        const file = Bun.file(fullPath)
        if (file.size > 500_000) continue

        const content = await file.text().catch(() => "")
        if (!content) continue

        const snippet = content.substring(0, 2000)
        scanned.push({ relativePath: entry, terms: tokenize(snippet) })
      }

      const freq: Record<string, number> = {}
      for (const f of scanned) {
        const unique = new Set(f.terms)
        for (const t of unique) {
          freq[t] = (freq[t] || 0) + 1
        }
      }

      fileCache = { files: scanned, docFreq: freq, timestamp: now }
    }

    const files = fileCache.files
    const docFreq = fileCache.docFreq

    if (files.length === 0) {
      return "No indexable files found in the project."
    }

    // TF-IDF scoring
    const docCount = files.length

    const scored: Array<{ relativePath: string, score: number }> = []
    for (const f of files) {
      let score = 0
      const termCounts: Record<string, number> = {}
      for (const t of f.terms) {
        termCounts[t] = (termCounts[t] || 0) + 1
      }
      for (const qt of queryTerms) {
        const tf = (termCounts[qt] || 0) / (f.terms.length || 1)
        const df = docFreq[qt] || 0
        if (df === 0) continue
        const idf = Math.log(docCount / df)
        score += tf * idf
      }
      if (score > 0) {
        scored.push({ relativePath: f.relativePath, score })
      }
    }

    scored.sort((a, b) => b.score - a.score)
    const topFiles = scored.slice(0, 15)

    // Only read full content for top files (for deep analysis)
    const topFilesWithContent: Array<{ relativePath: string, score: number, content: string }> = []
    for (const f of topFiles) {
      const fullPath = path.join(context.directory, f.relativePath)
      const content = await Bun.file(fullPath).text().catch(() => "")
      topFilesWithContent.push({ ...f, content })
    }

    // Deep analysis if enabled
    const analyses: FileAnalysis[] = []
    if (args.analyze_depth === "deep") {
      for (const f of topFilesWithContent) {
        analyses.push(analyzeFile(f.relativePath, f.content))
      }
    }

    // Build import graph for dependency detection
    const importGraph: Record<string, string[]> = {}
    const importedBy: Record<string, string[]> = {}
    for (const f of topFilesWithContent) {
      const imports: string[] = []
      const importMatches = f.content.matchAll(/import\s+.*?from\s+["']([^"']+)["']|import\s+["']([^"']+)["']/g)
      for (const match of importMatches) {
        const importPath = match[1] || match[2]
        // Resolve relative imports
        if (importPath.startsWith(".")) {
          const resolved = path.normalize(path.join(path.dirname(f.relativePath), importPath))
            .replace(/\\/g, "/")
            .replace(/\.(ts|js|tsx|jsx)$/, "")
          imports.push(resolved)
        }
      }
      importGraph[f.relativePath] = imports

      for (const imp of imports) {
        // Find which top file this import refers to
        for (const other of topFiles) {
          const otherBase = other.relativePath.replace(/\.(ts|js|tsx|jsx)$/, "")
          if (imp === otherBase || imp.endsWith("/" + path.basename(otherBase))) {
            if (!importedBy[other.relativePath]) importedBy[other.relativePath] = []
            importedBy[other.relativePath].push(f.relativePath)
          }
        }
      }
    }

    // Group files by category and generate steps
    const categories: Record<string, typeof topFiles> = {}
    for (const f of topFiles) {
      const cat = categorizeFile(f.relativePath)
      if (!categories[cat]) categories[cat] = []
      categories[cat].push(f)
    }

    const steps: PlanStep[] = []
    let stepId = 1
    const categoryStepIds: Record<string, number> = {}

    // Order: types -> config -> implementation -> test
    const categoryOrder = ["types", "config", "implementation", "test"]

    for (const cat of categoryOrder) {
      const catFiles = categories[cat]
      if (!catFiles || catFiles.length === 0) continue

      const analysis = analyses.find((a) => catFiles.some((f) => f.relativePath === a.path))
      const complexity = analysis?.complexity || "simple"

      const stepFiles = catFiles.map((f) => ({
        path: f.relativePath,
        action: "modify" as const,
        description: `${cat === "types" ? "Update type definitions" : cat === "test" ? "Update tests" : cat === "config" ? "Update configuration" : "Implement changes"} in ${path.basename(f.relativePath)}`,
      }))

      const dependsOn: number[] = []
      if (cat === "implementation" && categoryStepIds["types"]) {
        dependsOn.push(categoryStepIds["types"])
      }
      if (cat === "test" && categoryStepIds["implementation"]) {
        dependsOn.push(categoryStepIds["implementation"])
      }

      steps.push({
        id: stepId++,
        title: `${cat === "types" ? "Update type definitions" : cat === "config" ? "Update configuration" : cat === "test" ? "Write/update tests" : "Implement core changes"}`,
        description: `Work on ${catFiles.length} ${cat} file(s): ${catFiles.map((f) => f.relativePath).join(", ")}`,
        files: stepFiles,
        depends_on: dependsOn,
        complexity,
        status: "pending",
      })
      categoryStepIds[cat] = steps[steps.length - 1].id
    }

    // Detect risks
    const risks: PlanRisk[] = []

    // Risk: complex files being modified
    const complexFiles = analyses.filter((a) => a.complexity === "complex")
    if (complexFiles.length > 0) {
      risks.push({
        title: "High-complexity files",
        severity: "high",
        description: `${complexFiles.length} file(s) with high complexity: ${complexFiles.map((f) => f.path).join(", ")}`,
        mitigation: "Break changes into smaller commits. Add extra test coverage for these files.",
      })
    }

    // Risk: high fan-in files
    for (const [filePath, importers] of Object.entries(importedBy)) {
      if (importers.length >= 3) {
        risks.push({
          title: `High fan-in: ${path.basename(filePath)}`,
          severity: "medium",
          description: `${filePath} is imported by ${importers.length} files. Changes may have wide impact.`,
          mitigation: "Ensure backward compatibility. Consider adding an abstraction layer.",
        })
      }
    }

    // Risk: missing tests
    const implFiles = categories["implementation"] || []
    const testFiles = categories["test"] || []
    if (implFiles.length > 0 && testFiles.length === 0) {
      risks.push({
        title: "No test files found",
        severity: "medium",
        description: "No test files were found among relevant files. Changes may lack test coverage.",
        mitigation: "Add test files for the modified modules before or alongside implementation.",
      })
    }

    // Generate plan
    const timestamp = Date.now()
    const suffix = Math.random().toString(36).substring(2, 5)
    const planId = `plan-${timestamp}-${suffix}`
    const nowISO = new Date().toISOString()

    const plan: ImplementationPlan = {
      id: planId,
      task: args.task,
      created_at: nowISO,
      updated_at: nowISO,
      status: "draft",
      summary: `Plan for: ${args.task}. ${steps.length} steps, ${topFiles.length} files affected. Complexity: ${estimateOverallComplexity(analyses, topFiles.length)}.`,
      steps,
      risks,
      estimated_complexity: estimateOverallComplexity(analyses, topFiles.length),
      total_files_affected: topFiles.length,
    }

    // Save plan
    const plansDir = path.join(context.directory, ".lobster", "memory", "plans")
    await mkdir(plansDir, { recursive: true })

    const planPath = path.join(plansDir, `${planId}.json`)
    await Bun.write(planPath, JSON.stringify(plan, null, 2))

    const latestPath = path.join(plansDir, "latest.json")
    await Bun.write(latestPath, JSON.stringify({ id: planId, path: planPath }, null, 2))

    // Format output
    const lines: string[] = [
      `## Implementation Plan: ${planId}`,
      "",
      `**Task:** ${args.task}`,
      `**Complexity:** ${plan.estimated_complexity}`,
      `**Files affected:** ${plan.total_files_affected}`,
      `**Steps:** ${plan.steps.length}`,
      "",
      "### Steps",
      "",
    ]

    for (const step of steps) {
      const depsStr = step.depends_on.length > 0 ? ` (depends on: ${step.depends_on.join(", ")})` : ""
      lines.push(`${step.id}. **${step.title}** [${step.complexity}]${depsStr}`)
      lines.push(`   ${step.description}`)
      for (const f of step.files) {
        lines.push(`   - \`${f.path}\` (${f.action}): ${f.description}`)
      }
      lines.push("")
    }

    if (risks.length > 0) {
      lines.push("### Risks")
      lines.push("")
      for (const risk of risks) {
        lines.push(`- **${risk.title}** [${risk.severity}]: ${risk.description}`)
        lines.push(`  *Mitigation:* ${risk.mitigation}`)
      }
      lines.push("")
    }

    lines.push(`Plan saved to \`.lobster/memory/plans/${planId}.json\``)
    lines.push("Use `plan_status` to track progress.")

    return lines.join("\n")
  },
})
