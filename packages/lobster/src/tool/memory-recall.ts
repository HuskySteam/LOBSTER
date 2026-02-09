import z from "zod"
import { Tool } from "./tool"
import { Memory } from "../memory/memory"
import { MemoryManager } from "../memory/manager"

export const MemoryRecallTool = Tool.define("memoryrecall", {
  description:
    "Search and recall saved memories from previous sessions. " +
    "Use this to find patterns, preferences, conventions, errors, or notes " +
    "that were previously saved.",
  parameters: z.object({
    query: z
      .string()
      .describe("Search query to find relevant memories")
      .default(""),
    tags: z
      .array(z.string())
      .describe("Filter by tags")
      .default([]),
    category: Memory.Category.describe(
      "Filter by category: pattern, preference, convention, error, or note",
    ).optional(),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "memoryrecall",
      patterns: [params.query || "*"],
      always: ["*"],
      metadata: {
        query: params.query,
        tags: params.tags,
        category: params.category,
      },
    })

    let results: Memory.Entry[]

    if (params.query) {
      results = await MemoryManager.search(params.query, params.tags.length ? params.tags : undefined)
    } else {
      results = await MemoryManager.list(params.category)
    }

    if (params.category && params.query) {
      results = results.filter((e) => e.category === params.category)
    }

    if (!results.length) {
      return {
        title: "No memories found",
        output: "No matching memories found.",
        metadata: { count: 0 } as Record<string, any>,
      }
    }

    const formatted = results
      .map(
        (entry) =>
          `[${entry.category}] (${entry.id})\n` +
          `  ${entry.content}\n` +
          (entry.tags.length ? `  Tags: ${entry.tags.join(", ")}\n` : "") +
          `  Created: ${new Date(entry.time.created).toISOString()}`,
      )
      .join("\n\n")

    return {
      title: `Found ${results.length} memor${results.length === 1 ? "y" : "ies"}`,
      output: formatted,
      metadata: { count: results.length, entries: results } as Record<string, any>,
    }
  },
})
