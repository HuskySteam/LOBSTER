import { Plugin } from "@lobster-ai/plugin"
import path from "path"

interface MemoryEntry {
  id: string
  category: string
  title: string
  tags: string[]
  created_at: string
  summary: string
}

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

const plugin: Plugin = async (input) => {
  return {
    "experimental.chat.system.transform": async (_inp, output) => {
      const indexPath = path.join(input.directory, ".lobster", "memory", "index.json")
      validatePluginPath(input.directory, indexPath)
      const indexFile = Bun.file(indexPath)
      const indexExists = await indexFile.exists()

      if (!indexExists) return

      const index: MemoryEntry[] = await indexFile.json().catch(() => [])

      if (index.length === 0) return

      const sorted = [...index].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      const recent = sorted.slice(0, 10)

      const grouped: Record<string, MemoryEntry[]> = {}
      for (const entry of recent) {
        if (!grouped[entry.category]) {
          grouped[entry.category] = []
        }
        grouped[entry.category].push(entry)
      }

      const sections: string[] = []
      for (const category of Object.keys(grouped)) {
        const entries = grouped[category]
        const items = entries
          .map(
            (e) =>
              `    <memory id="${escapeXml(e.id)}" title="${escapeXml(e.title)}" tags="${escapeXml(e.tags.join(", "))}" created="${escapeXml(e.created_at)}">\n      ${escapeXml(e.summary)}\n    </memory>`
          )
          .join("\n")
        sections.push(`  <category name="${escapeXml(category)}">\n${items}\n  </category>`)
      }

      const memoryBlock = [
        "<lobster-memory>",
        "The following memories were stored in previous sessions. Use them to maintain consistency and avoid repeating past mistakes.",
        "",
        sections.join("\n"),
        "",
        "Use the memory_search and memory_retrieve tools to get full details on any memory. Use memory_store to save new learnings.",
        "</lobster-memory>",
      ].join("\n")

      output.system.push(memoryBlock)

      // Inject pattern insights block
      const patternsPath = path.join(input.directory, ".lobster", "memory", "pattern-insights.json")
      validatePluginPath(input.directory, patternsPath)
      const patternsFile = Bun.file(patternsPath)
      const patternsExist = await patternsFile.exists()

      if (patternsExist) {
        const patterns: any[] = await patternsFile.json().catch(() => [])
        if (patterns.length > 0) {
          const antiPatterns = patterns.filter((p) => p.type === "recurring_antipattern")
          const degrading = patterns.filter((p) => p.type === "degrading_trend")

          if (antiPatterns.length > 0 || degrading.length > 0) {
            const lines: string[] = [
              "<lobster-patterns>",
              "WARNING: The following recurring issues have been detected in this project. Pay special attention to avoid repeating them.",
              "",
            ]

            for (const p of antiPatterns) {
              lines.push(`  <antipattern title="${escapeXml(String(p.title))}" frequency="${escapeXml(String(p.frequency))}" trend="${escapeXml(String(p.trend))}">`)
              lines.push(`    ${escapeXml(String(p.description))}`)
              if (p.related_files.length > 0) {
                lines.push(`    Files: ${p.related_files.join(", ")}`)
              }
              lines.push(`  </antipattern>`)
            }

            for (const p of degrading) {
              lines.push(`  <trend type="degrading" title="${escapeXml(String(p.title))}">`)
              lines.push(`    ${escapeXml(String(p.description))}`)
              lines.push(`  </trend>`)
            }

            lines.push("", "</lobster-patterns>")
            output.system.push(lines.join("\n"))
          }
        }
      }
    },
  }
}

export default plugin
