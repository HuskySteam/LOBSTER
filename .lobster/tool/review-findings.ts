/// <reference path="../env.d.ts" />
import { tool } from "@lobster-ai/plugin"
import description from "./review-findings.txt"
import path from "path"
import { mkdir } from "node:fs/promises"

export default tool({
  description,
  args: {
    findings: tool.schema.array(
      tool.schema.object({
        severity: tool.schema.enum(["critical", "high", "medium", "low"]).describe("Severity level"),
        title: tool.schema.string().describe("Short title of the finding"),
        description: tool.schema.string().describe("Detailed description"),
        file: tool.schema.string().optional().describe("File path where issue was found"),
        line: tool.schema.number().optional().describe("Line number"),
      })
    ).describe("Array of review findings"),
    iteration: tool.schema.number().describe("Current review iteration number"),
    agent: tool.schema.string().default("reviewer").describe("Agent that produced these findings"),
  },
  async execute(args, context) {
    const memoryDir = path.join(context.directory, ".lobster", "memory")
    const findingsPath = path.join(memoryDir, "review-findings.json")

    const existing: any[] = await Bun.file(findingsPath).json().catch(() => [])

    const newFindings = args.findings.map((f, i) => ({
      id: `finding-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${i}`,
      severity: f.severity,
      title: f.title,
      description: f.description,
      file: f.file,
      line: f.line,
      status: "open",
      agent: args.agent,
      iteration: args.iteration,
    }))

    const all = [...existing, ...newFindings]
    await mkdir(memoryDir, { recursive: true })
    await Bun.write(findingsPath, JSON.stringify(all, null, 2))

    const summary = newFindings.reduce((acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return [
      `## ${newFindings.length} findings recorded (iteration ${args.iteration})`,
      "",
      ...Object.entries(summary).map(([sev, count]) => `- ${sev}: ${count}`),
      "",
      `Total findings in file: ${all.length}`,
    ].join("\n")
  },
})
