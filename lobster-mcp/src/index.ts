import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { resolve, normalize } from "node:path"
import { indexDirectory } from "./indexer.js"
import { findRelevant } from "./relevance.js"
import { estimateTokens } from "./context-budget.js"
import type { FileInfo } from "./indexer.js"

const BLOCKED_PREFIXES = ["/etc", "/var", "/usr", "/sys", "/proc", "/dev", "/boot", "/sbin", "/bin", "/root"]

function validateDirectory(dir: string): string {
  const resolved = resolve(dir)
  const normalized = normalize(resolved)
  if (normalized.includes("..")) {
    throw new Error("Directory path must not contain '..' segments")
  }
  for (const prefix of BLOCKED_PREFIXES) {
    if (normalized === prefix || normalized.startsWith(prefix + "/")) {
      throw new Error(`Access to system directory '${prefix}' is not allowed`)
    }
  }
  return normalized
}

const server = new McpServer({
  name: "lobster-context",
  version: "1.0.0",
})

let indexedFiles: FileInfo[] = []
let indexedDirectory = ""

server.tool(
  "index_project",
  "Index the project structure for intelligent file discovery. Run this before using find_relevant.",
  {
    directory: z.string().default(".").describe("Directory to index"),
  },
  async (args) => {
    const dir = validateDirectory(args.directory || ".")
    indexedFiles = await indexDirectory(dir)
    indexedDirectory = dir

    const extCounts: Record<string, number> = {}
    for (const file of indexedFiles) {
      const ext = file.extension || "(no ext)"
      extCounts[ext] = (extCounts[ext] || 0) + 1
    }

    const extSummary = Object.entries(extCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([ext, count]) => `  ${ext}: ${count}`)
      .join("\n")

    const totalSize = indexedFiles.reduce((sum, f) => sum + f.size, 0)

    const summary = [
      `Indexed ${indexedFiles.length} files from "${dir}"`,
      `Total size: ${(totalSize / 1024).toFixed(1)} KB`,
      "",
      "File types:",
      extSummary,
    ].join("\n")

    return {
      content: [{ type: "text" as const, text: summary }],
    }
  }
)

server.tool(
  "find_relevant",
  "Given a task description, return the most relevant files from the indexed project. Run index_project first if you haven't already.",
  {
    query: z.string().describe("Natural language description of the task or topic"),
    max_results: z.number().default(10).describe("Maximum number of results to return"),
    directory: z.string().default(".").describe("Directory to search (will auto-index if needed)"),
  },
  async (args) => {
    const dir = validateDirectory(args.directory || ".")
    if (indexedFiles.length === 0 || indexedDirectory !== dir) {
      indexedFiles = await indexDirectory(dir)
      indexedDirectory = dir
    }

    const results = findRelevant(args.query, indexedFiles, args.max_results)

    if (results.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `No files matched the query "${args.query}". Try different keywords or run index_project first.`,
        }],
      }
    }

    const lines = [
      `## Relevant files for: "${args.query}"`,
      "",
    ]

    for (const result of results) {
      const sizeKB = (result.size / 1024).toFixed(1)
      lines.push(`- **${result.path}** (score: ${result.score.toFixed(4)}, ${sizeKB} KB)`)
    }

    lines.push("")
    lines.push(`Found ${results.length} relevant file(s) out of ${indexedFiles.length} indexed.`)

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    }
  }
)

server.tool(
  "estimate_tokens",
  "Estimate the token count for a list of files. Useful for planning context window usage.",
  {
    files: z.array(z.string()).describe("List of file paths to estimate tokens for"),
  },
  async (args) => {
    const fileInfos: Array<{ path: string, size: number }> = []

    for (const filePath of args.files) {
      const found = indexedFiles.find((f) => f.relativePath === filePath || f.path === filePath)
      if (found) {
        fileInfos.push({ path: found.relativePath, size: found.size })
        continue
      }

      const fs = await import("node:fs/promises")
      const stat = await fs.stat(filePath).catch(() => null)
      if (stat) {
        fileInfos.push({ path: filePath, size: stat.size })
      }
    }

    const estimate = estimateTokens(fileInfos)

    const lines = [
      "## Token Estimates",
      "",
    ]

    for (const file of estimate.files) {
      lines.push(`- **${file.path}**: ~${file.tokens.toLocaleString()} tokens (${(file.size / 1024).toFixed(1)} KB)`)
    }

    lines.push("")
    lines.push(`**Total: ~${estimate.total.toLocaleString()} tokens**`)

    const missingFiles = args.files.filter(
      (f) => !fileInfos.some((fi) => fi.path === f)
    )
    if (missingFiles.length > 0) {
      lines.push("")
      lines.push("Files not found:")
      for (const f of missingFiles) {
        lines.push(`  - ${f}`)
      }
    }

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    }
  }
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error("Failed to start LOBSTER MCP server:", err)
  process.exit(1)
})
