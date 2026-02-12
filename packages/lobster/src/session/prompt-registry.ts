import { Log } from "../util/log"

export namespace PromptRegistry {
  const log = Log.create({ service: "prompt.registry" })

  interface Section {
    id: string
    content: string
    hash: number
  }

  // djb2 hash for fast comparison
  function djb2(str: string): number {
    let hash = 5381
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
    }
    return hash
  }

  const sections: Section[] = []
  let assembled: string | undefined
  let assembledHash: number | undefined

  export function register(id: string, content: string) {
    const existing = sections.findIndex((s) => s.id === id)
    const section: Section = { id, content, hash: djb2(content) }
    if (existing >= 0) {
      sections[existing] = section
    } else {
      sections.push(section)
    }
    assembled = undefined // invalidate cache
  }

  export function replace(id: string, content: string) {
    const idx = sections.findIndex((s) => s.id === id)
    if (idx < 0) {
      log.warn("section not found for replace", { id })
      return
    }
    sections[idx] = { id, content, hash: djb2(content) }
    assembled = undefined
  }

  export function insertAfter(afterId: string, newId: string, content: string) {
    const idx = sections.findIndex((s) => s.id === afterId)
    if (idx < 0) {
      log.warn("section not found for insertAfter", { afterId })
      sections.push({ id: newId, content, hash: djb2(content) })
      return
    }
    sections.splice(idx + 1, 0, { id: newId, content, hash: djb2(content) })
    assembled = undefined
  }

  export function remove(id: string) {
    const idx = sections.findIndex((s) => s.id === id)
    if (idx >= 0) {
      sections.splice(idx, 1)
      assembled = undefined
    }
  }

  export function cacheKey(): number {
    let hash = 5381
    for (const section of sections) {
      hash = ((hash << 5) + hash + section.hash) | 0
    }
    return hash
  }

  export function assemble(): string {
    const key = cacheKey()
    if (assembled !== undefined && assembledHash === key) {
      return assembled
    }
    assembled = sections.map((s) => s.content).join("\n\n")
    assembledHash = key
    log.info("assembled prompt", { sections: sections.length, hash: key })
    return assembled
  }

  export function list(): Array<{ id: string; hash: number }> {
    return sections.map((s) => ({ id: s.id, hash: s.hash }))
  }

  export function clear() {
    sections.length = 0
    assembled = undefined
    assembledHash = undefined
  }
}
