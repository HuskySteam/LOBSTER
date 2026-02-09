import path from "path"
import { Instance } from "../project/instance"
import { Log } from "../util/log"

export namespace SmartContext {
  const log = Log.create({ service: "context.smart" })

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

    // Split camelCase and PascalCase
    const camelSplit = query.replace(/([a-z])([A-Z])/g, "$1 $2")
    // Split snake_case
    const snakeSplit = camelSplit.replace(/_/g, " ")
    // Split on non-alphanumeric
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

  function scoreFile(filepath: string, keywords: string[]): number {
    const basename = path.basename(filepath).toLowerCase()
    const relative = filepath.toLowerCase()

    let score = 0

    for (const kw of keywords) {
      if (basename.includes(kw)) score += 3
      else if (relative.includes(kw)) score += 1
    }

    if (/\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|h|hpp)$/.test(basename)) {
      score += 1
    }

    if (basename.includes("test") || basename.includes("spec")) {
      score -= 1
    }

    if (relative.includes("node_modules") || relative.includes("/dist/") || relative.includes("/build/")) {
      return 0
    }

    return Math.max(0, score)
  }

  export async function findRelevant(query: string, limit = 5): Promise<string[]> {
    const keywords = extractKeywords(query)
    if (keywords.length === 0) return []

    log.info("smart context keywords", { keywords })

    const patterns = buildGlobPatterns(keywords)
    const root = Instance.worktree

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

    if (candidates.size === 0) return []

    const scored: { file: string; score: number }[] = []
    for (const file of candidates) {
      const s = scoreFile(file, keywords)
      if (s > 0) scored.push({ file, score: s })
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit).map((s) => path.relative(root, s.file).replace(/\\/g, "/"))
  }
}
