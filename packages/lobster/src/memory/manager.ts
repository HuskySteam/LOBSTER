import { Storage } from "../storage/storage"
import { Bus } from "../bus"
import { Memory } from "./memory"
import { Log } from "../util/log"
import { ulid } from "ulid"

export namespace MemoryManager {
  const log = Log.create({ service: "memory.manager" })
  const LIST_READ_CONCURRENCY = 16
  let lastDecayTime = 0

  // In-memory cache to avoid repeated storage reads
  let _cache: Memory.Entry[] | undefined
  // Keyword index: maps lowercase keyword -> Set of entry IDs
  const _keywordIndex = new Map<string, Set<string>>()

  function invalidateCache() {
    _cache = undefined
    _keywordIndex.clear()
  }

  function extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
  }

  function indexEntry(entry: Memory.Entry) {
    const words = extractKeywords(entry.content)
    for (const tag of entry.tags) {
      words.push(...extractKeywords(tag))
    }
    for (const word of words) {
      let ids = _keywordIndex.get(word)
      if (!ids) {
        ids = new Set()
        _keywordIndex.set(word, ids)
      }
      ids.add(entry.id)
    }
  }

  function removeFromIndex(id: string) {
    for (const ids of _keywordIndex.values()) {
      ids.delete(id)
    }
  }

  function buildIndex(entries: Memory.Entry[]) {
    _keywordIndex.clear()
    for (const entry of entries) {
      indexEntry(entry)
    }
  }

  function collectCandidateIDs(words: string[]): Set<string> {
    const candidateIDs = new Set<string>()
    for (const word of words) {
      const ids = _keywordIndex.get(word)
      if (!ids) continue
      for (const id of ids) {
        candidateIDs.add(id)
      }
    }
    return candidateIDs
  }

  async function readEntries(keys: readonly (readonly string[])[]): Promise<Array<Memory.Entry | undefined>> {
    if (keys.length === 0) return []

    const results = new Array<Memory.Entry | undefined>(keys.length)
    const workerCount = Math.min(LIST_READ_CONCURRENCY, keys.length)
    let nextIndex = 0

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (true) {
          const index = nextIndex++
          if (index >= keys.length) return
          results[index] = await Storage.read<Memory.Entry>([...keys[index]!]).catch(() => undefined)
        }
      }),
    )

    return results
  }

  export async function save(input: {
    content: string
    tags: string[]
    category: Memory.Category
    sessionID: string
    confidence?: number
    source?: "manual" | "auto"
  }): Promise<Memory.Entry> {
    const id = ulid()
    const entry: Memory.Entry = {
      id,
      content: input.content,
      tags: input.tags,
      sourceSessionID: input.sessionID,
      category: input.category,
      confidence: input.confidence ?? 0.5,
      accessCount: 0,
      source: input.source ?? "manual",
      time: {
        created: Date.now(),
        updated: Date.now(),
      },
    }
    await Storage.write(["memory", id], entry)
    Bus.publish(Memory.Event.Created, { entry })
    log.info("memory saved", { id, category: input.category, source: entry.source, confidence: entry.confidence })
    // Update cache incrementally instead of full invalidation
    if (_cache) {
      _cache.push(entry)
      indexEntry(entry)
    }
    return entry
  }

  export async function touch(id: string): Promise<void> {
    const entry = await Storage.read<Memory.Entry>(["memory", id]).catch(() => undefined)
    if (!entry) return
    entry.accessCount = (entry.accessCount ?? 0) + 1
    entry.confidence = Math.min(1.0, (entry.confidence ?? 0.5) + 0.1)
    entry.time.updated = Date.now()
    await Storage.write(["memory", id], entry)
    log.info("memory touched", { id, accessCount: entry.accessCount, confidence: entry.confidence })
    // Update cached entry in-place
    if (_cache) {
      const cached = _cache.find((e) => e.id === id)
      if (cached) {
        cached.accessCount = entry.accessCount
        cached.confidence = entry.confidence
        cached.time.updated = entry.time.updated
      }
    }
  }

  export async function decay(): Promise<void> {
    const now = Date.now()
    const ONE_DAY = 24 * 60 * 60 * 1000
    const THIRTY_DAYS = 30 * ONE_DAY

    // Throttle to once per day
    if (now - lastDecayTime < ONE_DAY) return
    lastDecayTime = now

    const all = await listAll()
    for (const entry of all) {
      const age = now - entry.time.updated
      if (age > THIRTY_DAYS && (entry.accessCount ?? 0) === 0) {
        const newConfidence = Math.max(0, (entry.confidence ?? 0.5) - 0.1)
        if (newConfidence !== entry.confidence) {
          entry.confidence = newConfidence
          entry.time.updated = now
          await Storage.write(["memory", entry.id], entry)
        }
      }
    }
    log.info("memory decay completed")
  }

  export async function search(query: string, tags?: string[]): Promise<Memory.Entry[]> {
    const all = await listAll()
    const lower = query.toLowerCase()
    const words = extractKeywords(query)
    const candidateIDs = words.length > 0 ? collectCandidateIDs(words) : new Set<string>()
    const candidates = candidateIDs.size > 0
      ? all.filter((entry) => candidateIDs.has(entry.id))
      : all

    return candidates.filter((entry) => {
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
    // Remove from cache and index
    if (_cache) {
      _cache = _cache.filter((e) => e.id !== id)
      removeFromIndex(id)
    }
  }

  const STOP_WORDS = new Set([
    "the", "and", "for", "that", "this", "with", "from", "have", "been",
    "will", "what", "when", "where", "which", "their", "there", "about",
    "would", "could", "should", "into", "more", "some", "than", "them",
    "then", "also",
  ])

  export async function relevant(context: string, limit = 10): Promise<Memory.Entry[]> {
    const all = await listAll()
    if (!all.length) return []

    const rawWords = context.toLowerCase().split(/\s+/).filter(Boolean)
    const words = rawWords.filter((w) => w.length > 3 && !STOP_WORDS.has(w))
    const searchWords = words.length > 0 ? words : rawWords.filter(Boolean)
    if (!searchWords.length) return all.slice(0, 5)

    // Use keyword index to narrow candidates instead of scanning all entries
    const candidateIds = collectCandidateIDs(searchWords)

    // If no keyword matches, fall back to full scan (handles substring matches)
    const candidates = candidateIds.size > 0
      ? all.filter((e) => candidateIds.has(e.id))
      : all

    const now = Date.now()
    const ONE_DAY = 24 * 60 * 60 * 1000
    const SEVEN_DAYS = 7 * ONE_DAY
    return candidates
      .map((entry) => {
        const contentLower = entry.content.toLowerCase()
        const tagsLower = entry.tags.join(" ").toLowerCase()
        const contentScore = searchWords.filter((w) => contentLower.includes(w)).length
        const tagScore = searchWords.filter((w) => tagsLower.includes(w)).length * 2
        const age = now - entry.time.created
        const recencyBoost = age < ONE_DAY ? 2 : age < SEVEN_DAYS ? 1 : 0
        const confidenceBoost = (entry.confidence ?? 0.5) * 2
        const accessBoost = Math.min((entry.accessCount ?? 0) * 0.5, 3)
        const score = contentScore + tagScore + recencyBoost + confidenceBoost + accessBoost
        return { entry, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.entry)
  }

  async function listAll(): Promise<Memory.Entry[]> {
    if (_cache) return _cache
    const keys = await Storage.list(["memory"])
    const results = await readEntries(keys)
    const entries = results
      .filter((entry): entry is Memory.Entry => entry !== undefined)
      .map((entry) => ({
        ...entry,
        confidence: entry.confidence ?? 0.5,
        accessCount: entry.accessCount ?? 0,
        source: entry.source ?? ("manual" as const),
      }))
      .sort((a, b) => b.time.created - a.time.created)
    _cache = entries
    buildIndex(entries)
    return entries
  }
}
