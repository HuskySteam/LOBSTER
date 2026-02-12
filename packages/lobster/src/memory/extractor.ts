import { Log } from "../util/log"
import { MemoryManager } from "./manager"
import { Memory } from "./memory"
import type { MessageV2 } from "../session/message-v2"

export namespace MemoryExtractor {
  const log = Log.create({ service: "memory.extractor" })

  function jaccard(a: string, b: string): number {
    const setA = new Set(a.toLowerCase().split(/\s+/))
    const setB = new Set(b.toLowerCase().split(/\s+/))
    const intersection = new Set([...setA].filter((x) => setB.has(x)))
    const union = new Set([...setA, ...setB])
    return union.size === 0 ? 0 : intersection.size / union.size
  }

  export async function extract(input: {
    sessionID: string
    messages: MessageV2.WithParts[]
  }): Promise<void> {
    try {
      // Count tool calls
      let toolCallCount = 0
      for (const msg of input.messages) {
        for (const part of msg.parts) {
          if (part.type === "tool") toolCallCount++
        }
      }

      if (toolCallCount < 3) {
        log.info("skipping extraction, too few tool calls", { toolCallCount })
        return
      }

      // Condense last 20 messages
      const recent = input.messages.slice(-20)
      let condensed = ""
      for (const msg of recent) {
        const role = msg.info.role
        for (const part of msg.parts) {
          if (part.type === "text" && !part.synthetic) {
            condensed += `[${role}] ${(part as any).text}\n`
          }
          if (part.type === "tool" && part.state.status === "completed") {
            condensed += `[tool:${part.tool}] ${JSON.stringify(part.state.input).slice(0, 200)}\n`
          }
        }
      }
      condensed = condensed.slice(0, 8000)

      if (condensed.length < 100) {
        log.info("skipping extraction, not enough content")
        return
      }

      // Extract conventions using simple heuristics (no LLM call for reliability)
      const conventions: { content: string; category: Memory.Category; confidence: number }[] = []

      // Look for file patterns
      const filePatterns = condensed.match(/(?:created?|modified?|edited?|wrote)\s+[\w/.]+\.\w+/gi)
      if (filePatterns && filePatterns.length >= 3) {
        const extensions = new Set(filePatterns.map((p) => p.match(/\.(\w+)$/)?.[1]).filter(Boolean))
        if (extensions.size > 0) {
          conventions.push({
            content: `Project uses file types: ${[...extensions].join(", ")}`,
            category: "project",
            confidence: 0.6,
          })
        }
      }

      // Look for repeated tool patterns
      const toolUses: Record<string, number> = {}
      for (const msg of input.messages) {
        for (const part of msg.parts) {
          if (part.type === "tool") {
            toolUses[part.tool] = (toolUses[part.tool] ?? 0) + 1
          }
        }
      }
      const frequentTools = Object.entries(toolUses)
        .filter(([, count]) => count >= 3)
        .map(([tool]) => tool)
      if (frequentTools.length > 0) {
        conventions.push({
          content: `Frequently used tools in this project: ${frequentTools.join(", ")}`,
          category: "pattern",
          confidence: 0.6,
        })
      }

      // Deduplicate against existing memories
      const existing = await MemoryManager.list()
      for (const conv of conventions) {
        let isDuplicate = false
        for (const mem of existing) {
          if (jaccard(conv.content, mem.content) > 0.7) {
            await MemoryManager.touch(mem.id)
            isDuplicate = true
            break
          }
        }
        if (!isDuplicate) {
          await MemoryManager.save({
            content: conv.content,
            tags: ["auto-extracted"],
            category: conv.category,
            sessionID: input.sessionID,
            confidence: conv.confidence,
            source: "auto",
          })
        }
      }

      log.info("extraction completed", { conventions: conventions.length })
    } catch (e: any) {
      log.warn("memory extraction failed", { error: e.message })
    }
  }
}
