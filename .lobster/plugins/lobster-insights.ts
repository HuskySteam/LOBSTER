import { Plugin } from "@lobster-ai/plugin"
import path from "path"
import { mkdir } from "node:fs/promises"

interface InsightData {
  sessionCount: number
  toolFailures: Record<string, number>
  toolUsage: Record<string, number>
  lastGenerated: string
  insights: string[]
}

const plugin: Plugin = async (input) => {
  const memoryDir = path.join(input.directory, ".lobster", "memory")
  const insightsPath = path.join(memoryDir, "insights.json")

  async function loadInsights(): Promise<InsightData> {
    const file = Bun.file(insightsPath)
    if (await file.exists()) {
      return file.json().catch(() => ({
        sessionCount: 0,
        toolFailures: {},
        toolUsage: {},
        lastGenerated: "",
        insights: [],
      }))
    }
    return {
      sessionCount: 0,
      toolFailures: {},
      toolUsage: {},
      lastGenerated: "",
      insights: [],
    }
  }

  async function saveInsights(data: InsightData): Promise<void> {
    await mkdir(memoryDir, { recursive: true })
    await Bun.write(insightsPath, JSON.stringify(data, null, 2))
  }

  function generateInsights(data: InsightData): string[] {
    const insights: string[] = []

    // Most used tools
    const sorted = Object.entries(data.toolUsage).sort(([, a], [, b]) => b - a)
    if (sorted.length > 0) {
      insights.push(`Most used tools: ${sorted.slice(0, 3).map(([t, c]) => `${t} (${c}x)`).join(", ")}`)
    }

    // Most failed tools
    const failures = Object.entries(data.toolFailures).sort(([, a], [, b]) => b - a)
    if (failures.length > 0 && failures[0][1] > 2) {
      insights.push(`Frequent failures: ${failures.slice(0, 3).map(([t, c]) => `${t} (${c} failures)`).join(", ")}`)
    }

    // Session count
    insights.push(`Total sessions tracked: ${data.sessionCount}`)

    return insights.slice(0, 3)
  }

  return {
    "session.start": async (_inp) => {
      const data = await loadInsights()
      data.sessionCount++
      await saveInsights(data)
    },

    "tool.execute.after": async (inp, _output) => {
      const data = await loadInsights()
      data.toolUsage[inp.tool] = (data.toolUsage[inp.tool] || 0) + 1

      // Regenerate insights every 5 sessions
      if (data.sessionCount % 5 === 0 && data.lastGenerated !== new Date().toISOString().split("T")[0]) {
        data.insights = generateInsights(data)
        data.lastGenerated = new Date().toISOString().split("T")[0]
      }
      await saveInsights(data)
    },

    "experimental.chat.system.transform": async (_inp, output) => {
      const data = await loadInsights()
      if (data.insights.length > 0) {
        output.system.push(
          `<system-reminder>\nSession insights:\n${data.insights.map((i) => `- ${i}`).join("\n")}\n</system-reminder>`
        )
      }
    },
  }
}

export default plugin
