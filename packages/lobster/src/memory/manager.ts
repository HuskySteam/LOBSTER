import { Storage } from "../storage/storage"
import { Bus } from "../bus"
import { Memory } from "./memory"
import { Log } from "../util/log"
import { ulid } from "ulid"

export namespace MemoryManager {
  const log = Log.create({ service: "memory.manager" })

  export async function save(input: {
    content: string
    tags: string[]
    category: Memory.Category
    sessionID: string
  }): Promise<Memory.Entry> {
    const id = ulid()
    const entry: Memory.Entry = {
      id,
      content: input.content,
      tags: input.tags,
      sourceSessionID: input.sessionID,
      category: input.category,
      time: {
        created: Date.now(),
        updated: Date.now(),
      },
    }
    await Storage.write(["memory", id], entry)
    Bus.publish(Memory.Event.Created, { entry })
    log.info("memory saved", { id, category: input.category })
    return entry
  }

  export async function search(query: string, tags?: string[]): Promise<Memory.Entry[]> {
    const all = await listAll()
    const lower = query.toLowerCase()
    return all.filter((entry) => {
      const matchesQuery = entry.content.toLowerCase().includes(lower)
      const matchesTags = !tags?.length || tags.some((t) => entry.tags.includes(t))
      return matchesQuery && matchesTags
    })
  }

  export async function list(category?: Memory.Category): Promise<Memory.Entry[]> {
    const all = await listAll()
    if (!category) return all
    return all.filter((entry) => entry.category === category)
  }

  export async function forget(id: string): Promise<void> {
    await Storage.remove(["memory", id])
    Bus.publish(Memory.Event.Deleted, { id })
    log.info("memory deleted", { id })
  }

  // NOTE: This is an O(n*m) linear scan where n=entries and m=keywords.
  // For large memory stores, consider adding a TF-IDF or keyword index.
  export async function relevant(context: string): Promise<Memory.Entry[]> {
    const all = await listAll()
    if (!all.length) return []
    const words = context
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
    if (!words.length) return all.slice(0, 5)
    return all
      .map((entry) => {
        const lower = entry.content.toLowerCase() + " " + entry.tags.join(" ").toLowerCase()
        const score = words.filter((w) => lower.includes(w)).length
        return { entry, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((x) => x.entry)
  }

  async function listAll(): Promise<Memory.Entry[]> {
    const keys = await Storage.list(["memory"])
    const results = await Promise.all(
      keys.map((key) => Storage.read<Memory.Entry>(key).catch(() => undefined)),
    )
    return results
      .filter((entry): entry is Memory.Entry => entry !== undefined)
      .sort((a, b) => b.time.created - a.time.created)
  }
}
