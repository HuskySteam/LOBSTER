/// <reference path="../env.d.ts" />
import { tool } from "@lobster-ai/plugin"
import DESCRIPTION from "./memory-retrieve.txt"
import path from "path"

interface MemoryEntry {
  id: string
  category: string
  title: string
  tags: string[]
  created_at: string
  summary: string
}

export default tool({
  description: DESCRIPTION,
  args: {
    category: tool.schema
      .enum(["architecture", "pattern", "decision", "mistake", "preference", "other"])
      .optional()
      .describe("Filter memories by category"),
    limit: tool.schema
      .number()
      .default(10)
      .describe("Maximum number of memories to return"),
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

    const filtered = args.category
      ? index.filter((entry) => entry.category === args.category)
      : index

    if (filtered.length === 0) {
      return `No memories found for category "${args.category}".`
    }

    const sorted = filtered.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    const limited = sorted.slice(0, args.limit)

    const results: string[] = []

    for (const entry of limited) {
      const filePath = path.join(memoryDir, `${entry.id}.md`)
      const file = Bun.file(filePath)
      const exists = await file.exists()

      if (!exists) {
        results.push(
          `## ${entry.title}\n- ID: ${entry.id}\n- Category: ${entry.category}\n- Created: ${entry.created_at}\n- Tags: ${entry.tags.join(", ") || "(none)"}\n- Content: (file missing)\n`
        )
        continue
      }

      const raw = await file.text()
      const contentMatch = raw.split("---")
      const content = contentMatch.length >= 3 ? contentMatch.slice(2).join("---").trim() : raw

      results.push(
        `## ${entry.title}\n- ID: ${entry.id}\n- Category: ${entry.category}\n- Created: ${entry.created_at}\n- Tags: ${entry.tags.join(", ") || "(none)"}\n\n${content}\n`
      )
    }

    const header = args.category
      ? `Found ${limited.length} memories in category "${args.category}":`
      : `Found ${limited.length} memories:`

    return `${header}\n\n${results.join("\n---\n\n")}`
  },
})
