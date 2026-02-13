import { Instance } from "@/project/instance"
import { Log } from "@/util/log"
import path from "path"

export namespace IndexCache {
  const log = Log.create({ service: "index.cache" })

  const CACHE_VERSION = 1

  export interface FileEntry {
    path: string
    hash: number
    exports: string[]
    types: string[]
  }

  export interface Cache {
    version: number
    timestamp: number
    files: FileEntry[]
  }

  function cachePath(): string {
    return path.join(Instance.worktree, ".lobster", "index-cache.json")
  }

  export function djb2(str: string): number {
    let hash = 5381
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
    }
    return hash
  }

  export async function read(): Promise<Cache | undefined> {
    const file = Bun.file(cachePath())
    const exists = await file.exists()
    if (!exists) return undefined
    return file
      .json()
      .then((data: Cache) => {
        if (data.version !== CACHE_VERSION) return undefined
        return data
      })
      .catch((err) => {
        log.warn("failed to read index cache", { error: String(err) })
        return undefined
      })
  }

  export async function write(cache: Cache): Promise<void> {
    const p = cachePath()
    const dir = path.dirname(p)
    const { mkdir } = await import("fs/promises")
    await mkdir(dir, { recursive: true })
    await Bun.write(p, JSON.stringify(cache, null, 2)).catch((err) => {
      log.error("failed to write index cache", { error: String(err) })
    })
  }

  export function empty(): Cache {
    return {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      files: [],
    }
  }
}
