import z from "zod"
import { Tool } from "./tool"
import { Memory } from "../memory/memory"
import { MemoryManager } from "../memory/manager"

export const MemorySaveTool = Tool.define("memorysave", {
  description:
    "Save a memory entry for future reference across sessions. " +
    "Use this to remember patterns, preferences, conventions, errors, or notes " +
    "that should persist and be available in future sessions.",
  parameters: z.object({
    content: z
      .string()
      .describe("The content to remember"),
    tags: z
      .array(z.string())
      .describe("Tags to categorize and help find this memory later")
      .default([]),
    category: Memory.Category.describe(
      "Category of memory: pattern, preference, convention, error, or note",
    ).default("note"),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "memorysave",
      patterns: [params.category],
      always: ["*"],
      metadata: {
        category: params.category,
        tags: params.tags,
      },
    })

    const entry = await MemoryManager.save({
      content: params.content,
      tags: params.tags,
      category: params.category,
      sessionID: ctx.sessionID,
      source: "manual",
      confidence: 0.8,
    })

    return {
      title: `Saved memory (${entry.category})`,
      output: JSON.stringify(entry, null, 2),
      metadata: { entry } as Record<string, any>,
    }
  },
})
