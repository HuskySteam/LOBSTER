interface RegistryPlugin {
  name: string
  npm: string
  description: string
  category: string
}

interface Registry {
  version: number
  updated: string
  categories: string[]
  plugins: RegistryPlugin[]
}

export interface MarketplacePlugin {
  name: string
  description: string
  spec: string
  source: string
}

export interface MarketplaceLoadResult {
  plugins: MarketplacePlugin[]
  hadError: boolean
}

const DEFAULT_MARKETPLACE_SOURCE = "anthropics/claude-code"
const SOURCE_PATTERN = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/
const DEFAULT_FETCH_TIMEOUT_MS = 5000

let cacheKey = ""
let cacheValue: MarketplaceLoadResult | undefined
let inflightKey = ""
let inflight: Promise<MarketplaceLoadResult> | undefined

function isRegistryPlugin(value: unknown): value is RegistryPlugin {
  if (typeof value !== "object" || !value) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.name === "string" &&
    typeof item.npm === "string" &&
    typeof item.description === "string" &&
    typeof item.category === "string"
  )
}

function parseRegistry(json: unknown): Registry | undefined {
  if (typeof json !== "object" || !json) return
  const value = json as Record<string, unknown>
  if (typeof value.version !== "number") return
  if (!Array.isArray(value.plugins)) return
  return {
    version: value.version,
    updated: typeof value.updated === "string" ? value.updated : "",
    categories: Array.isArray(value.categories) ? value.categories.filter((c): c is string => typeof c === "string") : [],
    plugins: value.plugins.filter(isRegistryPlugin),
  }
}

function sourceLabel(source: string) {
  const parts = source.split("/")
  return parts[parts.length - 1] || source
}

function normalizedPluginName(value: string) {
  return value.trim().toLowerCase()
}

function normalizeKey(sources: string[]) {
  return getMarketplaceSources(sources).join(",")
}

function marketplaceFetchTimeoutMs() {
  const envValue = process.env.LOBSTER_PLUGIN_MARKETPLACE_FETCH_TIMEOUT_MS
  if (!envValue) return DEFAULT_FETCH_TIMEOUT_MS
  const parsed = Number.parseInt(envValue, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_FETCH_TIMEOUT_MS
  return parsed
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), marketplaceFetchTimeoutMs())
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export function dedupeMarketplaceBySpec(items: MarketplacePlugin[]) {
  const seen = new Set<string>()
  const output: MarketplacePlugin[] = []
  for (const plugin of items) {
    const key = plugin.spec.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    output.push(plugin)
  }
  return output
}

export function findMarketplaceMatchesByName(items: MarketplacePlugin[], name: string) {
  const target = normalizedPluginName(name)
  if (!target) return []
  const matches = items.filter((plugin) => normalizedPluginName(plugin.name) === target)
  return dedupeMarketplaceBySpec(matches)
}

export function normalizeMarketplaceSource(source: string) {
  return source.trim().toLowerCase()
}

function dedupeMarketplaceByIdentity(items: MarketplacePlugin[]) {
  const seen = new Set<string>()
  const output: MarketplacePlugin[] = []
  for (const plugin of items) {
    const key = `${normalizedPluginName(plugin.name)}:${plugin.spec.trim().toLowerCase()}`
    if (!plugin.spec.trim()) continue
    if (seen.has(key)) continue
    seen.add(key)
    output.push(plugin)
  }
  return output
}

async function fetchLobsterRegistry(): Promise<{ plugins: MarketplacePlugin[]; ok: boolean }> {
  try {
    const response = await fetchWithTimeout(
      "https://raw.githubusercontent.com/HuskySteam/LOBSTER/main/registry/plugins.json",
    )
    if (!response.ok) return { plugins: [], ok: false }
    const registry = parseRegistry(await response.json())
    if (!registry) return { plugins: [], ok: false }
    return {
      ok: true,
      plugins: registry.plugins.map((plugin) => ({
        name: plugin.name,
        description: plugin.description,
        spec: plugin.npm,
        source: "LOBSTER",
      })),
    }
  } catch {
    return { plugins: [], ok: false }
  }
}

async function fetchMarketplaceSource(source: string): Promise<{ plugins: MarketplacePlugin[]; ok: boolean }> {
  try {
    const response = await fetchWithTimeout(
      `https://raw.githubusercontent.com/${source}/main/.claude-plugin/marketplace.json`,
    )
    if (!response.ok) return { plugins: [], ok: false }
    const json = await response.json()
    const entries = Array.isArray(json)
      ? json
      : (typeof json === "object" && json && Array.isArray((json as { plugins?: unknown[] }).plugins))
        ? (json as { plugins: unknown[] }).plugins
        : []

    const plugins: MarketplacePlugin[] = []
    for (const entry of entries) {
      if (typeof entry !== "object" || !entry) continue
      const item = entry as Record<string, unknown>
      const name = typeof item.name === "string" ? item.name : ""
      if (!name) continue
      const description = typeof item.description === "string" ? item.description : ""
      const spec = typeof item.spec === "string" ? item.spec : ""
      const itemSource = typeof item.source === "string" ? item.source : ""
      plugins.push({
        name,
        description,
        spec: spec
          ? spec
          : itemSource.startsWith("./")
            ? `github:${source}/${itemSource.slice(2)}`
            : `github:${source}/plugins/${name}`,
        source: sourceLabel(source),
      })
    }
    return { plugins, ok: true }
  } catch {
    return { plugins: [], ok: false }
  }
}

export function clearPluginMarketplaceCache() {
  cacheKey = ""
  cacheValue = undefined
  inflightKey = ""
  inflight = undefined
}

export function isValidMarketplaceSource(source: string) {
  return SOURCE_PATTERN.test(normalizeMarketplaceSource(source))
}

export function getMarketplaceSources(configured: string[]) {
  const merged = [...configured, DEFAULT_MARKETPLACE_SOURCE]
  const deduped = Array.from(new Set(merged.map(normalizeMarketplaceSource).filter(Boolean)))
  return deduped.filter(isValidMarketplaceSource)
}

export async function loadPluginMarketplace(sources: string[]): Promise<MarketplaceLoadResult> {
  const key = normalizeKey(sources)
  if (cacheValue && cacheKey === key) return cacheValue
  if (inflight && inflightKey === key) return inflight

  inflightKey = key
  inflight = (async () => {
    const [registry, ...sourceResults] = await Promise.all([
      fetchLobsterRegistry(),
      ...getMarketplaceSources(sources).map(fetchMarketplaceSource),
    ])

    const plugins = dedupeMarketplaceByIdentity([
      ...registry.plugins,
      ...sourceResults.flatMap((result) => result.plugins),
    ])
    const hadError = !registry.ok || sourceResults.some((result) => !result.ok)
    const result = { plugins, hadError }
    cacheKey = key
    cacheValue = result
    return result
  })().finally(() => {
    inflight = undefined
    inflightKey = ""
  })

  return inflight
}

export function pluginSpecName(spec: string): string {
  if (!spec) return spec
  if (spec.startsWith("github:") || spec.startsWith("https://github.com/")) {
    const parts = spec.replace(/\.git$/, "").split("/")
    return parts[parts.length - 1] || spec
  }
  if (spec.startsWith("file://")) {
    const parts = spec.substring(7).split("/")
    const filename = parts.pop() || spec
    if (!filename.includes(".")) return filename
    const base = filename.split(".")[0]
    if (base === "index") return parts.pop() || base
    return base
  }
  const index = spec.lastIndexOf("@")
  if (index <= 0) return spec
  return spec.substring(0, index)
}
