import { Instance } from "@/project/instance"
import { FileIgnore } from "@/file/ignore"
import { Log } from "@/util/log"
import { IndexCache } from "./cache"
import path from "path"

export namespace CodebaseIndex {
  const log = Log.create({ service: "index" })

  const SOURCE_GLOB = "**/*.{ts,tsx,js,jsx,py,go,rs,java}"
  const SUMMARY_MAX_CHARS = 2000

  const EXPORT_PATTERNS = [
    /export\s+(?:async\s+)?function\s+(\w+)/g,
    /export\s+class\s+(\w+)/g,
    /export\s+const\s+(\w+)/g,
    /export\s+namespace\s+(\w+)/g,
    /export\s+default\s+(?:class|function)\s+(\w+)/g,
  ]

  const TYPE_PATTERNS = [
    /export\s+type\s+(\w+)/g,
    /export\s+interface\s+(\w+)/g,
  ]

  const state = Instance.state(() => ({
    cache: IndexCache.empty(),
  }))

  function extractMatches(content: string, patterns: RegExp[]): string[] {
    const results: string[] = []
    for (const pattern of patterns) {
      pattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.exec(content)) !== null) {
        if (match[1]) results.push(match[1])
      }
    }
    return results
  }

  async function scanFile(filePath: string): Promise<IndexCache.FileEntry | undefined> {
    const file = Bun.file(filePath)
    const exists = await file.exists()
    if (!exists) return undefined
    const content = await file.text().catch(() => undefined)
    if (!content) return undefined
    const rel = path.relative(Instance.worktree, filePath).replaceAll("\\", "/")
    return {
      path: rel,
      hash: IndexCache.djb2(content),
      exports: extractMatches(content, EXPORT_PATTERNS),
      types: extractMatches(content, TYPE_PATTERNS),
    }
  }

  export async function build(): Promise<IndexCache.Cache> {
    log.info("building codebase index")
    const existing = await IndexCache.read()
    const existingMap = new Map<string, IndexCache.FileEntry>()
    if (existing) {
      for (const f of existing.files) {
        existingMap.set(f.path, f)
      }
    }

    const glob = new Bun.Glob(SOURCE_GLOB)
    const files: IndexCache.FileEntry[] = []

    for await (const rel of glob.scan({
      cwd: Instance.worktree,
      dot: false,
    })) {
      if (FileIgnore.match(rel)) continue

      const abs = path.join(Instance.worktree, rel)
      const entry = await scanFile(abs)
      if (entry) files.push(entry)
    }

    const cache: IndexCache.Cache = {
      version: 1,
      timestamp: Date.now(),
      files,
    }
    state().cache = cache
    await IndexCache.write(cache)
    log.info("codebase index built", { files: files.length })
    return cache
  }

  export async function update(changed: string[]): Promise<void> {
    const current = state().cache
    const fileMap = new Map<string, IndexCache.FileEntry>()
    for (const f of current.files) {
      fileMap.set(f.path, f)
    }

    for (const abs of changed) {
      const rel = path.relative(Instance.worktree, abs).replaceAll("\\", "/")
      if (FileIgnore.match(rel)) {
        fileMap.delete(rel)
        continue
      }
      const entry = await scanFile(abs)
      if (entry) {
        fileMap.set(rel, entry)
      } else {
        fileMap.delete(rel)
      }
    }

    const cache: IndexCache.Cache = {
      version: 1,
      timestamp: Date.now(),
      files: [...fileMap.values()],
    }
    state().cache = cache
    await IndexCache.write(cache)
  }

  export function summary(): string {
    const cache = state().cache
    if (cache.files.length === 0) return ""

    const groups = new Map<string, IndexCache.FileEntry[]>()
    for (const file of cache.files) {
      const dir = path.dirname(file.path) || "."
      const existing = groups.get(dir) ?? []
      existing.push(file)
      groups.set(dir, existing)
    }

    const lines: string[] = ["# Codebase Index"]
    const sortedDirs = [...groups.keys()].sort()
    let totalChars = lines[0].length

    for (const dir of sortedDirs) {
      const entries = groups.get(dir)!
      const dirLine = `\n## ${dir}/`
      if (totalChars + dirLine.length > SUMMARY_MAX_CHARS) break
      lines.push(dirLine)
      totalChars += dirLine.length

      for (const entry of entries) {
        const name = path.basename(entry.path)
        const symbols = [...entry.exports, ...entry.types.map((t) => `${t}(type)`)].join(", ")
        const fileLine = symbols ? `- ${name}: ${symbols}` : `- ${name}`
        if (totalChars + fileLine.length + 1 > SUMMARY_MAX_CHARS) break
        lines.push(fileLine)
        totalChars += fileLine.length + 1
      }
    }

    return lines.join("\n")
  }
}
