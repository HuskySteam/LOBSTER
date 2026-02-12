import path from "path"
import fs from "fs/promises"
import { Instance } from "../project/instance"
import { Ripgrep } from "../file/ripgrep"
import { Log } from "../util/log"

export namespace SmartContext {
  const log = Log.create({ service: "context.smart" })

  export interface SmartResult {
    path: string
    reason: string
  }

  const STOP_WORDS = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "must", "ought",
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her",
    "us", "them", "my", "your", "his", "its", "our", "their", "mine",
    "yours", "hers", "ours", "theirs", "this", "that", "these", "those",
    "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
    "all", "each", "every", "both", "few", "more", "most", "other", "some",
    "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too",
    "very", "just", "because", "as", "until", "while", "of", "at", "by",
    "for", "with", "about", "against", "between", "through", "during",
    "before", "after", "above", "below", "to", "from", "up", "down", "in",
    "out", "on", "off", "over", "under", "again", "further", "then", "once",
    "here", "there", "and", "but", "or", "if", "then", "else", "when",
    "also", "into", "let", "make", "like", "get", "set", "use", "new",
    "add", "fix", "change", "update", "create", "delete", "remove", "file",
    "code", "function", "class", "method", "want", "please", "help", "look",
    "find", "show", "tell", "know", "think", "see", "try", "take",
  ])

  function extractKeywords(query: string): string[] {
    const words: string[] = []
    const camelSplit = query.replace(/([a-z])([A-Z])/g, "$1 $2")
    const snakeSplit = camelSplit.replace(/_/g, " ")
    const tokens = snakeSplit.split(/[^a-zA-Z0-9.]+/)

    for (const token of tokens) {
      const lower = token.toLowerCase()
      if (lower.length < 2) continue
      if (STOP_WORDS.has(lower)) continue
      if (/^\d+$/.test(lower)) continue
      words.push(lower)
    }

    return [...new Set(words)]
  }

  export function extractReferences(query: string): { paths: string[]; classNames: string[]; functionNames: string[] } {
    const paths: string[] = []
    const classNames: string[] = []
    const functionNames: string[] = []

    // File paths: src/foo/bar.ts pattern
    const pathRegex = /(?:^|\s)((?:[\w.-]+\/)+[\w.-]+\.\w+)/g
    let match
    while ((match = pathRegex.exec(query)) !== null) {
      paths.push(match[1])
    }

    // PascalCase class names: SessionPrompt, ToolCache
    const classRegex = /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g
    while ((match = classRegex.exec(query)) !== null) {
      classNames.push(match[1])
    }

    // Function calls: findRelevant(), detectCommand()
    const funcRegex = /\b([a-z][a-zA-Z]*)\(\)/g
    while ((match = funcRegex.exec(query)) !== null) {
      functionNames.push(match[1])
    }

    return { paths, classNames, functionNames }
  }

  async function searchContents(keywords: string[], root: string): Promise<Map<string, number>> {
    const hitMap = new Map<string, number>()
    const searchKeywords = keywords.slice(0, 5)

    for (const keyword of searchKeywords) {
      const results = await Ripgrep.search({
        cwd: root,
        pattern: keyword,
        limit: 20,
        glob: ["!node_modules/**", "!.git/**", "!dist/**", "!build/**"],
      }).catch(() => [])

      for (const result of results) {
        const filePath = result.path.text
        const absPath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath)
        const count = hitMap.get(absPath) ?? 0
        hitMap.set(absPath, count + 1)
      }
    }

    return hitMap
  }

  async function resolveExplicitPaths(paths: string[], root: string): Promise<Set<string>> {
    const resolved = new Set<string>()
    for (const p of paths) {
      const abs = path.isAbsolute(p) ? p : path.resolve(root, p)
      const exists = await fs.access(abs).then(() => true).catch(() => false)
      if (exists) resolved.add(abs)
    }
    return resolved
  }

  function buildGlobPatterns(keywords: string[]): string[] {
    const patterns: string[] = []
    for (const kw of keywords) {
      if (kw.startsWith(".")) {
        patterns.push(`**/*${kw}`)
        continue
      }
      if (kw.includes(".")) {
        patterns.push(`**/${kw}`)
        patterns.push(`**/*${kw}*`)
        continue
      }
      patterns.push(`**/*${kw}*`)
    }
    return [...new Set(patterns)]
  }

  export async function findRelevant(query: string, limit = 10): Promise<SmartResult[]> {
    const keywords = extractKeywords(query)
    if (keywords.length === 0) return []

    log.info("smart context keywords", { keywords })

    const root = Instance.worktree
    const refs = extractReferences(query)
    const explicitPaths = await resolveExplicitPaths(refs.paths, root)
    const contentHits = await searchContents(
      [...keywords, ...refs.classNames, ...refs.functionNames].slice(0, 5),
      root,
    )

    // Glob-based candidates
    const patterns = buildGlobPatterns(keywords)
    const candidates = new Set<string>()
    for (const pattern of patterns.slice(0, 10)) {
      const glob = new Bun.Glob(pattern)
      for await (const match of glob.scan({
        cwd: root,
        onlyFiles: true,
        absolute: true,
      })) {
        const lower = match.toLowerCase()
        if (lower.includes("node_modules") || lower.includes(".git")) continue
        candidates.add(match)
        if (candidates.size > 200) break
      }
      if (candidates.size > 200) break
    }

    // Add content hit files as candidates
    for (const file of contentHits.keys()) {
      candidates.add(file)
    }

    // Add explicit paths
    for (const p of explicitPaths) {
      candidates.add(p)
    }

    if (candidates.size === 0) return []

    const now = Date.now()
    const ONE_HOUR = 60 * 60 * 1000
    const ONE_DAY = 24 * 60 * 60 * 1000

    // Filter out excluded directories first (cheap string check)
    const filtered: string[] = []
    for (const file of candidates) {
      const normalized = path.normalize(file).toLowerCase()
      if (normalized.includes("node_modules") || normalized.includes(`${path.sep}dist${path.sep}`) || normalized.includes(`${path.sep}build${path.sep}`)) {
        continue
      }
      filtered.push(file)
    }

    // Batch recency stats with bounded concurrency (skip if too many candidates)
    const RECENCY_THRESHOLD = 100
    const STAT_CONCURRENCY = 16
    const mtimeMap = new Map<string, number>()
    if (filtered.length <= RECENCY_THRESHOLD) {
      for (let i = 0; i < filtered.length; i += STAT_CONCURRENCY) {
        const batch = filtered.slice(i, i + STAT_CONCURRENCY)
        const stats = await Promise.all(
          batch.map((file) => fs.stat(file).then((s) => ({ file, mtime: s.mtimeMs })).catch(() => null)),
        )
        for (const s of stats) {
          if (s) mtimeMap.set(s.file, s.mtime)
        }
      }
    }

    const scored: { file: string; score: number; reasons: string[] }[] = []
    for (const file of filtered) {
      const basename = path.basename(file).toLowerCase()
      const relative = file.toLowerCase()

      let score = 0
      const reasons: string[] = []

      // Explicit reference
      if (explicitPaths.has(file)) {
        score += 10
        reasons.push("explicit reference")
      }

      // Filename match
      for (const kw of keywords) {
        if (basename.includes(kw)) {
          score += 3
          reasons.push(`name match: ${kw}`)
          break
        } else if (relative.includes(kw)) {
          score += 1
          reasons.push(`path match: ${kw}`)
          break
        }
      }

      // Content match
      const hits = contentHits.get(file) ?? 0
      if (hits > 0) {
        const contentScore = Math.min(hits * 2, 6)
        score += contentScore
        reasons.push(`content: ${hits} hits`)
      }

      // Recency (only when stats were collected)
      const mtime = mtimeMap.get(file)
      if (mtime !== undefined) {
        const age = now - mtime
        if (age < ONE_HOUR) {
          score += 3
          reasons.push("modified <1h")
        } else if (age < ONE_DAY) {
          score += 1
          reasons.push("modified <1d")
        }
      }

      // Source file bonus
      if (/\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|h|hpp)$/.test(basename)) {
        score += 1
      }

      // Test file penalty
      if (basename.includes("test") || basename.includes("spec")) {
        score -= 1
      }

      if (score > 0) scored.push({ file, score, reasons })
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit).map((s) => ({
      path: path.relative(root, s.file).replace(/\\/g, "/"),
      reason: s.reasons.join(", "),
    }))
  }
}
