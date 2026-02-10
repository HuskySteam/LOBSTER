import { tool } from "@lobster-ai/plugin"
import path from "path"
import { writeFile, rename, mkdir } from "node:fs/promises"

const categorySchema = tool.schema.object({
  score: tool.schema.number().min(0).max(100).describe("Score from 0-100"),
  findings: tool.schema.array(tool.schema.string()).describe("Key findings for this category"),
  suggestions: tool.schema.array(tool.schema.string()).describe("Improvement suggestions"),
})

export default tool({
  description:
    "Save a project quality assessment. Call this after analyzing the project's code structure, testing, documentation, dependencies, and security. " +
    "Scores should be calibrated: 60-80% for well-maintained projects, 90%+ only for exceptional ones.",
  args: {
    overall_score: tool.schema.number().min(0).max(100).describe("Overall quality score from 0-100"),
    summary: tool.schema.string().describe("Brief summary of the project's quality"),
    categories: tool.schema.object({
      code_structure: categorySchema.describe("Code organization, patterns, and architecture"),
      testing: categorySchema.describe("Test coverage, test quality, and testing practices"),
      documentation: categorySchema.describe("README, inline docs, API docs, and comments"),
      dependencies: categorySchema.describe("Dependency health, updates, and security advisories"),
      security: categorySchema.describe("Security practices, vulnerability exposure, and hardening"),
    }).describe("Per-category quality breakdown"),
  },
  async execute(args, context) {
    const memoryDir = path.join(context.directory, ".lobster", "memory")
    await mkdir(memoryDir, { recursive: true }).catch(() => {})

    const data = {
      overall_score: args.overall_score,
      summary: args.summary,
      categories: args.categories,
      analyzed_at: Date.now(),
    }

    const filePath = path.join(memoryDir, "project-quality.json")
    const tmpPath = filePath + ".tmp." + Date.now()
    await writeFile(tmpPath, JSON.stringify(data, null, 2))
    await rename(tmpPath, filePath)

    return JSON.stringify({ saved: true, overall_score: args.overall_score, path: filePath })
  },
})
