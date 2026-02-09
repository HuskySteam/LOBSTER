import { Plugin } from "@lobster-ai/plugin"
import path from "path"

function validatePluginPath(basePath: string, filePath: string): void {
  const resolved = path.resolve(filePath)
  const allowed = path.resolve(basePath, ".lobster")
  if (!resolved.startsWith(allowed + path.sep) && resolved !== allowed) {
    throw new Error(`Plugin path validation failed: ${filePath} is outside .lobster directory`)
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

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

const TASK_KEYWORDS: Record<string, string[]> = {
  bug_fix: ["bug", "fix", "error", "crash", "broken", "issue", "wrong", "fail", "debug", "patch"],
  new_feature: ["add", "create", "implement", "build", "new", "feature", "introduce"],
  refactor: ["refactor", "clean", "reorganize", "restructure", "simplify", "improve", "optimize"],
  test: ["test", "spec", "coverage", "assert", "expect", "mock", "jest", "vitest"],
  docs: ["doc", "readme", "comment", "document", "explain", "guide", "tutorial"],
  config: ["config", "setup", "install", "deploy", "ci", "pipeline", "env", "setting"],
}

function classifyTask(text: string): string | null {
  const words = tokenize(text)
  let bestType: string | null = null
  let bestScore = 0

  for (const [taskType, keywords] of Object.entries(TASK_KEYWORDS)) {
    let score = 0
    for (const word of words) {
      if (keywords.includes(word)) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestType = taskType
    }
  }

  return bestScore > 0 ? bestType : null
}

function detectTechStack(pkgJson: any): string[] {
  const stack: string[] = []
  const allDeps = {
    ...(pkgJson.dependencies || {}),
    ...(pkgJson.devDependencies || {}),
  }

  if (pkgJson.packageManager?.startsWith("bun")) stack.push("Bun")
  if (allDeps.typescript || pkgJson.dependencies?.typescript) stack.push("TypeScript")
  if (allDeps.react || allDeps["react-dom"]) stack.push("React")
  if (allDeps["solid-js"]) stack.push("SolidJS")
  if (allDeps.next) stack.push("Next.js")
  if (allDeps.vue) stack.push("Vue")
  if (allDeps.svelte) stack.push("Svelte")
  if (allDeps.express) stack.push("Express")
  if (allDeps.hono) stack.push("Hono")
  if (allDeps.tailwindcss) stack.push("Tailwind")
  if (allDeps.prisma || allDeps["@prisma/client"]) stack.push("Prisma")
  if (allDeps.drizzle || allDeps["drizzle-orm"]) stack.push("Drizzle")

  return stack.length > 0 ? stack : ["JavaScript"]
}

function detectStructure(files: FileEntry[]): string[] {
  const topDirs = new Set<string>()
  for (const f of files) {
    const first = f.relativePath.split("/")[0]
    if (first && first !== f.relativePath) {
      topDirs.add(first + "/")
    }
  }
  return Array.from(topDirs).sort().slice(0, 10)
}

let fileCache: { files: FileEntry[], docFreq: Record<string, number>, timestamp: number } | null = null
const CACHE_TTL_MS = 30_000 // 30 seconds

const MAX_CHARS = 8000

const plugin: Plugin = async (input) => {
  return {
    "experimental.chat.system.transform": async (inp, output) => {
      const messages = (inp as any).messages
      if (!messages || messages.length === 0) return

      const lastMsg = messages[messages.length - 1]
      const userText = typeof lastMsg === "string"
        ? lastMsg
        : lastMsg?.content || lastMsg?.text || ""

      if (!userText || typeof userText !== "string" || userText.trim().length < 5) return

      const taskType = classifyTask(userText)
      if (!taskType) return

      const queryTerms = tokenize(userText)
      if (queryTerms.length === 0) return

      // Scan project files for TF-IDF (cached)
      let files: FileEntry[]
      let docFreq: Record<string, number>

      const now = Date.now()
      if (fileCache && (now - fileCache.timestamp) < CACHE_TTL_MS) {
        files = fileCache.files
        docFreq = fileCache.docFreq
      } else {
        files = []
        const glob = new Bun.Glob("**/*")

        for await (const entry of glob.scan({ cwd: input.directory, onlyFiles: true })) {
          const parts = entry.split("/")
          if (parts.some((p) => SKIP_DIRS.has(p))) continue

          const ext = path.extname(entry).toLowerCase()
          if (SKIP_EXTENSIONS.has(ext)) continue

          const fullPath = path.join(input.directory, entry)
          const file = Bun.file(fullPath)
          if (file.size > 500_000) continue

          const content = await file.text().catch(() => "")
          if (!content) continue

          const snippet = content.substring(0, 2000)
          files.push({ relativePath: entry, terms: tokenize(snippet) })
        }

        docFreq = {}
        for (const f of files) {
          const unique = new Set(f.terms)
          for (const t of unique) {
            docFreq[t] = (docFreq[t] || 0) + 1
          }
        }

        fileCache = { files, docFreq, timestamp: now }
      }

      if (files.length === 0) return

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
      const topFiles = scored.slice(0, 8)

      if (topFiles.length === 0) return

      // Read package.json for tech stack and deps
      const pkgPath = path.join(input.directory, "package.json")
      const pkgJson = await Bun.file(pkgPath).json().catch(() => null)

      const techStack = pkgJson ? detectTechStack(pkgJson) : []
      const structure = detectStructure(files)

      // Find relevant dependencies
      const relevantDeps: string[] = []
      if (pkgJson) {
        const allDeps = { ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) }
        for (const dep of Object.keys(allDeps || {})) {
          const depTerms = tokenize(dep)
          if (depTerms.some((dt) => queryTerms.includes(dt))) {
            relevantDeps.push(dep)
          }
        }
      }

      // Git recent changes for relevant files
      const gitChanges: Array<{ hash: string, message: string }> = []
      try {
        const relevantPaths = topFiles.slice(0, 3).map((f) => f.relativePath)
        const proc = Bun.spawn(
          ["git", "log", "--oneline", "-5", "--", ...relevantPaths],
          { cwd: input.directory, stdout: "pipe", stderr: "pipe" }
        )
        const gitOutput = await new Response(proc.stdout).text()
        await proc.exited

        for (const line of gitOutput.trim().split("\n")) {
          if (!line.trim()) continue
          const spaceIdx = line.indexOf(" ")
          if (spaceIdx > 0) {
            gitChanges.push({
              hash: line.substring(0, spaceIdx),
              message: line.substring(spaceIdx + 1),
            })
          }
        }
      } catch {
        // No git repo or git not available -- skip
      }

      // Assemble XML block with progressive truncation
      const block: string[] = ["<lobster-auto-context>"]
      block.push(`  <task-type>${escapeXml(taskType)}</task-type>`)

      if (techStack.length > 0) {
        block.push(`  <tech-stack>${escapeXml(techStack.join(", "))}</tech-stack>`)
      }

      if (structure.length > 0) {
        block.push(`  <structure>${escapeXml(structure.join(", "))}</structure>`)
      }

      block.push("  <relevant-files>")
      for (const f of topFiles) {
        const desc = f.relativePath.split("/").pop() || ""
        block.push(`    <file path="${escapeXml(f.relativePath)}" score="${f.score.toFixed(3)}">${escapeXml(desc)}</file>`)
      }
      block.push("  </relevant-files>")

      if (relevantDeps.length > 0) {
        block.push(`  <relevant-deps>${escapeXml(relevantDeps.slice(0, 10).join(", "))}</relevant-deps>`)
      }

      if (gitChanges.length > 0) {
        block.push("  <recent-changes>")
        for (const c of gitChanges) {
          block.push(`    <commit hash="${escapeXml(c.hash)}">${escapeXml(c.message)}</commit>`)
        }
        block.push("  </recent-changes>")
      }

      block.push("</lobster-auto-context>")

      // Progressive truncation to stay within budget
      let result = block.join("\n")
      if (result.length > MAX_CHARS) {
        // Drop git changes first
        const noGitBlock = block.filter((l) =>
          !l.includes("<recent-changes>") &&
          !l.includes("</recent-changes>") &&
          !l.includes("<commit ")
        )
        result = noGitBlock.join("\n")
      }

      if (result.length > MAX_CHARS) {
        // Reduce file count
        const reducedBlock: string[] = ["<lobster-auto-context>"]
        reducedBlock.push(`  <task-type>${escapeXml(taskType)}</task-type>`)
        if (techStack.length > 0) {
          reducedBlock.push(`  <tech-stack>${escapeXml(techStack.join(", "))}</tech-stack>`)
        }
        reducedBlock.push("  <relevant-files>")
        for (const f of topFiles.slice(0, 3)) {
          reducedBlock.push(`    <file path="${escapeXml(f.relativePath)}" score="${f.score.toFixed(3)}"/>`)
        }
        reducedBlock.push("  </relevant-files>")
        reducedBlock.push("</lobster-auto-context>")
        result = reducedBlock.join("\n")
      }

      output.system.push(result)
    },
  }
}

export default plugin
