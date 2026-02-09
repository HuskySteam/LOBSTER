import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"

export interface FileInfo {
  path: string
  relativePath: string
  size: number
  extension: string
  content: string
  terms: string[]
}

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "coverage",
  ".opencode", ".cache", ".turbo", "__pycache__", ".venv",
])

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".woff", ".woff2",
  ".ttf", ".eot", ".mp3", ".mp4", ".zip", ".tar", ".gz", ".lock",
  ".map", ".min.js", ".min.css", ".exe", ".dll", ".so", ".dylib",
  ".pdf", ".bin", ".dat", ".db", ".sqlite",
])

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "this", "that", "are", "was",
  "be", "has", "had", "not", "no", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "can", "if", "then", "else", "when",
  "up", "out", "so", "as", "all", "each", "every", "both", "few", "more",
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\W_]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

function parseGitignore(dir: string): string[] {
  const gitignorePath = path.join(dir, ".gitignore")
  if (!fs.existsSync(gitignorePath)) {
    return []
  }
  const content = fs.readFileSync(gitignorePath, "utf-8")
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
}

function matchesGitignorePattern(relativePath: string, pattern: string): boolean {
  const normalized = pattern.replace(/\/$/, "")
  const parts = relativePath.split("/")

  for (const part of parts) {
    if (part === normalized) {
      return true
    }
  }

  if (normalized.includes("*")) {
    const regex = new RegExp(
      "^" + normalized.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$"
    )
    if (regex.test(relativePath)) {
      return true
    }
    for (const part of parts) {
      if (regex.test(part)) {
        return true
      }
    }
  }

  return false
}

async function walkDirectory(
  dir: string,
  baseDir: string,
  gitignorePatterns: string[],
  results: FileInfo[]
): Promise<void> {
  const entries = await fsp.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/")

    if (SKIP_DIRS.has(entry.name)) {
      continue
    }

    const isIgnored = gitignorePatterns.some((pattern) =>
      matchesGitignorePattern(relativePath, pattern)
    )
    if (isIgnored) {
      continue
    }

    if (entry.isDirectory()) {
      await walkDirectory(fullPath, baseDir, gitignorePatterns, results)
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const ext = path.extname(entry.name).toLowerCase()
    if (BINARY_EXTENSIONS.has(ext)) {
      continue
    }

    const stat = await fsp.stat(fullPath).catch(() => null)
    if (!stat) {
      continue
    }

    if (stat.size > 500_000) {
      continue
    }

    const content = await fsp.readFile(fullPath, "utf-8").catch(() => "")
    if (!content) {
      continue
    }

    const snippet = content.substring(0, 1000)
    const terms = tokenize(snippet)

    results.push({
      path: fullPath,
      relativePath,
      size: stat.size,
      extension: ext,
      content: snippet,
      terms,
    })
  }
}

export async function indexDirectory(dir: string): Promise<FileInfo[]> {
  const resolvedDir = path.resolve(dir)
  const gitignorePatterns = parseGitignore(resolvedDir)
  const results: FileInfo[] = []
  await walkDirectory(resolvedDir, resolvedDir, gitignorePatterns, results)
  return results
}
