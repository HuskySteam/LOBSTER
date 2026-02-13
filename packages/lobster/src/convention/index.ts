import { Instance } from "../project/instance"
import { ConventionDetector } from "./detector"
import { Log } from "../util/log"

export namespace Convention {
  const log = Log.create({ service: "convention" })

  const CACHE_FILE = ".lobster/conventions.json"
  const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

  interface CacheData {
    timestamp: number
    conventions: ConventionDetector.Conventions
  }

  function cachePath(): string {
    return `${Instance.worktree}/${CACHE_FILE}`
  }

  async function readCache(): Promise<CacheData | null> {
    const file = cachePath()
    return Bun.file(file).json().catch(() => null) as Promise<CacheData | null>
  }

  async function writeCache(conventions: ConventionDetector.Conventions): Promise<void> {
    const file = cachePath()
    await Bun.write(file, JSON.stringify({ timestamp: Date.now(), conventions } satisfies CacheData, null, 2))
  }

  export async function get(): Promise<ConventionDetector.Conventions> {
    const cached = await readCache()
    if (cached && Date.now() - cached.timestamp < CACHE_MAX_AGE_MS) {
      return cached.conventions
    }
    log.info("detecting conventions")
    const conventions = await ConventionDetector.detect()
    await writeCache(conventions).catch((err) => log.warn("failed to write convention cache", { err }))
    return conventions
  }

  export function toPrompt(conventions: ConventionDetector.Conventions): string {
    const lines = ["# Project Conventions"]
    lines.push(`- Indentation: ${conventions.indentation === "tabs" ? "tabs" : conventions.indentation.replace("spaces-", "") + " spaces"}`)
    lines.push(`- ${conventions.semicolons ? "Semicolons" : "No semicolons"}, ${conventions.quotes} quotes`)
    lines.push(`- ${conventions.naming} naming`)
    if (conventions.testFramework) lines.push(`- Test: ${conventions.testFramework}`)
    if (conventions.packageManager) lines.push(`- Package manager: ${conventions.packageManager}`)
    lines.push(`- Line endings: ${conventions.lineEnding}`)
    return lines.join("\n")
  }
}
