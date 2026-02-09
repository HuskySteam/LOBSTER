/// <reference path="../env.d.ts" />
import { tool } from "@lobster-ai/plugin"
import DESCRIPTION from "./memory.txt"
import path from "path"
import { mkdir } from "node:fs/promises"

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
      .describe("Category of the memory"),
    title: tool.schema.string().describe("Short title for the memory"),
    content: tool.schema.string().describe("Detailed content of the memory"),
    tags: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Searchable tags for the memory"),
  },
  async execute(args, context) {
    const memoryDir = path.join(context.directory, ".lobster", "memory")
    await mkdir(memoryDir, { recursive: true })

    const timestamp = Date.now()
    const suffix = Math.random().toString(36).substring(2, 5)
    const id = `${timestamp}-${suffix}`
    const now = new Date().toISOString()
    const tagsArray = args.tags ?? []

    const frontmatter = [
      "---",
      `id: ${id}`,
      `category: ${args.category}`,
      `title: ${args.title}`,
      `tags: [${tagsArray.join(", ")}]`,
      `created_at: ${now}`,
      "---",
    ].join("\n")

    const fileContent = `${frontmatter}\n\n${args.content}\n`
    const filePath = path.join(memoryDir, `${id}.md`)
    await Bun.write(filePath, fileContent)

    const summary = args.content.substring(0, 100)
    const entry: MemoryEntry = {
      id,
      category: args.category,
      title: args.title,
      tags: tagsArray,
      created_at: now,
      summary,
    }

    const indexPath = path.join(memoryDir, "index.json")
    const indexFile = Bun.file(indexPath)
    const indexExists = await indexFile.exists()
    const index: MemoryEntry[] = indexExists ? await indexFile.json() : []
    index.push(entry)
    await Bun.write(indexPath, JSON.stringify(index, null, 2))

    return `Memory stored successfully.\nID: ${id}\nCategory: ${args.category}\nTitle: ${args.title}\nTags: ${tagsArray.join(", ") || "(none)"}`
  },
})
