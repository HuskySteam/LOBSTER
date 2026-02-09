/// <reference path="../env.d.ts" />
import { tool } from "@lobster-ai/plugin"
import DESCRIPTION from "./context.txt"
import path from "path"

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

export default tool({
  description: DESCRIPTION,
  args: {
    query: tool.schema.string().describe("Natural language description of what you are looking for"),
    max_results: tool.schema.number().default(10).describe("Maximum number of results to return"),
  },
  async execute(args, context) {
    const queryTerms = tokenize(args.query)
    if (queryTerms.length === 0) {
      return "Query is too vague. Please provide more specific keywords."
    }

    const now = Date.now()
    if (!fileCache || (now - fileCache.timestamp) > CACHE_TTL_MS) {
      const scanned: FileEntry[] = []
      const glob = new Bun.Glob("**/*")

      for await (const entry of glob.scan({ cwd: context.directory, onlyFiles: true })) {
        const parts = entry.split("/")
        const shouldSkip = parts.some((p) => SKIP_DIRS.has(p))
        if (shouldSkip) {
          continue
        }

        const ext = path.extname(entry).toLowerCase()
        if (SKIP_EXTENSIONS.has(ext)) {
          continue
        }

        const fullPath = path.join(context.directory, entry)
        const file = Bun.file(fullPath)
        const size = file.size

        if (size > 500_000) {
          continue
        }

        const content = await file.text().catch(() => "")
        if (!content) {
          continue
        }

        const snippet = content.substring(0, 2000)
        const terms = tokenize(snippet)
        scanned.push({ relativePath: entry, terms })
      }

      const freq: Record<string, number> = {}
      for (const f of scanned) {
        const uniqueTerms = new Set(f.terms)
        for (const t of uniqueTerms) {
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
        if (df === 0) {
          continue
        }
        const idf = Math.log(docCount / df)
        score += tf * idf
      }

      if (score > 0) {
        scored.push({ relativePath: f.relativePath, score })
      }
    }

    scored.sort((a, b) => b.score - a.score)
    const top = scored.slice(0, args.max_results)

    if (top.length === 0) {
      return `No files matched the query "${args.query}". Try different keywords.`
    }

    const lines: string[] = [
      `## Relevant Files for: "${args.query}"`,
      "",
    ]

    for (const item of top) {
      lines.push(`- **${item.relativePath}** (score: ${item.score.toFixed(4)})`)
    }

    lines.push("")
    lines.push(`Found ${top.length} relevant file(s) out of ${files.length} indexed.`)

    return lines.join("\n")
  },
})
