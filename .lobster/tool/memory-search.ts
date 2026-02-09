/// <reference path="../env.d.ts" />
import { tool } from "@lobster-ai/plugin"
import DESCRIPTION from "./memory-search.txt"
import path from "path"

interface MemoryEntry {
  id: string
  category: string
  title: string
  tags: string[]
  created_at: string
  summary: string
}

interface ScoredEntry {
  entry: MemoryEntry
  score: number
}

function scoreEntry(entry: MemoryEntry, queryWords: string[]): number {
  const titleLower = entry.title.toLowerCase()
  const categoryLower = entry.category.toLowerCase()
  const tagsLower = entry.tags.map((t) => t.toLowerCase())
  const summaryLower = entry.summary.toLowerCase()

  const score = queryWords.reduce((total, word) => {
    const wordLower = word.toLowerCase()
    const titleMatch = titleLower.includes(wordLower) ? 3 : 0
    const tagMatch = tagsLower.some((t) => t.includes(wordLower)) ? 2 : 0
    const categoryMatch = categoryLower.includes(wordLower) ? 1 : 0
    const summaryMatch = summaryLower.includes(wordLower) ? 1 : 0
    return total + titleMatch + tagMatch + categoryMatch + summaryMatch
  }, 0)

  return score
}

export default tool({
  description: DESCRIPTION,
  args: {
    query: tool.schema.string().describe("Search query for finding relevant memories"),
    limit: tool.schema
      .number()
      .default(5)
      .describe("Maximum number of results to return"),
  },
  async execute(args, context) {
    const memoryDir = path.join(context.directory, ".lobster", "memory")
    const indexPath = path.join(memoryDir, "index.json")
    const indexFile = Bun.file(indexPath)
    const indexExists = await indexFile.exists()

    if (!indexExists) {
      return "No memories stored yet. Use the memory_store tool to save your first memory."
    }

    const index: MemoryEntry[] = await indexFile.json()

    if (index.length === 0) {
      return "No memories stored yet. Use the memory_store tool to save your first memory."
    }

    const queryWords = args.query.split(/\s+/).filter((w) => w.length > 0)

    if (queryWords.length === 0) {
      return "Please provide a search query with at least one word."
    }

    const scored: ScoredEntry[] = index
      .map((entry) => ({ entry, score: scoreEntry(entry, queryWords) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, args.limit)

    if (scored.length === 0) {
      return `No memories found matching "${args.query}". Try different keywords or use memory_retrieve to browse by category.`
    }

    const results: string[] = []

    for (const item of scored) {
      const filePath = path.join(memoryDir, `${item.entry.id}.md`)
      const file = Bun.file(filePath)
      const exists = await file.exists()

      if (!exists) {
        results.push(
          `## ${item.entry.title} (relevance: ${item.score})\n- ID: ${item.entry.id}\n- Category: ${item.entry.category}\n- Tags: ${item.entry.tags.join(", ") || "(none)"}\n- Content: (file missing)\n`
        )
        continue
      }

      const raw = await file.text()
      const contentMatch = raw.split("---")
      const content = contentMatch.length >= 3 ? contentMatch.slice(2).join("---").trim() : raw

      results.push(
        `## ${item.entry.title} (relevance: ${item.score})\n- ID: ${item.entry.id}\n- Category: ${item.entry.category}\n- Created: ${item.entry.created_at}\n- Tags: ${item.entry.tags.join(", ") || "(none)"}\n\n${content}\n`
      )
    }

    return `Found ${scored.length} memories matching "${args.query}":\n\n${results.join("\n---\n\n")}`
  },
})
