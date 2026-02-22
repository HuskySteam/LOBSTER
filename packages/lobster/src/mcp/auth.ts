import path from "path"
import z from "zod"
import { Global } from "../global"

export namespace McpAuth {
  export const Tokens = z.object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
    expiresAt: z.number().optional(),
    scope: z.string().optional(),
  })
  export type Tokens = z.infer<typeof Tokens>

  export const ClientInfo = z.object({
    clientId: z.string(),
    clientSecret: z.string().optional(),
    clientIdIssuedAt: z.number().optional(),
    clientSecretExpiresAt: z.number().optional(),
  })
  export type ClientInfo = z.infer<typeof ClientInfo>

  export const Entry = z.object({
    tokens: Tokens.optional(),
    clientInfo: ClientInfo.optional(),
    codeVerifier: z.string().optional(),
    oauthState: z.string().optional(),
    serverUrl: z.string().optional(), // Track the URL these credentials are for
  })
  export type Entry = z.infer<typeof Entry>

  // Security model: credentials are stored as JSON on disk with file permissions
  // restricted to the current user (mode 0o600). This relies on OS-level file
  // access control. OS keychain integration (e.g. macOS Keychain, Windows
  // Credential Manager) could be added as a future improvement for stronger
  // at-rest protection.
  const filepath = path.join(Global.Path.data, "mcp-auth.json")
  const WRITE_DEBOUNCE_MS = 25

  let cache: Record<string, Entry> | undefined
  let loading: Promise<Record<string, Entry>> | undefined
  let writeTimer: ReturnType<typeof setTimeout> | undefined
  let pendingWrite: Promise<void> | undefined
  let resolvePendingWrite: (() => void) | undefined
  let rejectPendingWrite: ((error: unknown) => void) | undefined

  async function loadCache(): Promise<Record<string, Entry>> {
    if (cache) return cache
    if (loading) return loading

    const file = Bun.file(filepath)
    loading = file
      .json()
      .catch(() => ({}))
      .then((data) => {
        if (data && typeof data === "object" && !Array.isArray(data)) {
          cache = data as Record<string, Entry>
          return cache
        }
        cache = {}
        return cache
      })

    return loading
  }

  function schedulePersist(): Promise<void> {
    pendingWrite ??= new Promise<void>((resolve, reject) => {
      resolvePendingWrite = resolve
      rejectPendingWrite = reject
    })
    if (writeTimer) return pendingWrite

    writeTimer = setTimeout(async () => {
      const resolve = resolvePendingWrite
      const reject = rejectPendingWrite
      writeTimer = undefined
      pendingWrite = undefined
      resolvePendingWrite = undefined
      rejectPendingWrite = undefined

      try {
        const file = Bun.file(filepath)
        await Bun.write(file, JSON.stringify(cache ?? {}, null, 2), { mode: 0o600 })
        resolve?.()
      } catch (error) {
        reject?.(error)
      }
    }, WRITE_DEBOUNCE_MS)

    return pendingWrite
  }

  async function mutate(mcpName: string, update: (entry: Entry) => void, serverUrl?: string): Promise<void> {
    const data = await loadCache()
    const entry = { ...(data[mcpName] ?? {}) }
    update(entry)
    if (serverUrl) {
      entry.serverUrl = serverUrl
    }
    data[mcpName] = entry
    await schedulePersist()
  }

  export async function get(mcpName: string): Promise<Entry | undefined> {
    const data = await loadCache()
    const entry = data[mcpName]
    if (!entry) return undefined
    return structuredClone(entry)
  }

  /**
   * Get auth entry and validate it's for the correct URL.
   * Returns undefined if URL has changed (credentials are invalid).
   */
  export async function getForUrl(mcpName: string, serverUrl: string): Promise<Entry | undefined> {
    const entry = await get(mcpName)
    if (!entry) return undefined

    // If no serverUrl is stored, this is from an old version - consider it invalid
    if (!entry.serverUrl) return undefined

    // If URL has changed, credentials are invalid
    if (entry.serverUrl !== serverUrl) return undefined

    return entry
  }

  export async function all(): Promise<Record<string, Entry>> {
    const data = await loadCache()
    return structuredClone(data)
  }

  export async function set(mcpName: string, entry: Entry, serverUrl?: string): Promise<void> {
    const data = await loadCache()
    const next = { ...entry }
    if (serverUrl) {
      next.serverUrl = serverUrl
    }
    data[mcpName] = next
    await schedulePersist()
  }

  export async function remove(mcpName: string): Promise<void> {
    const data = await loadCache()
    delete data[mcpName]
    await schedulePersist()
  }

  export async function updateTokens(mcpName: string, tokens: Tokens, serverUrl?: string): Promise<void> {
    await mutate(
      mcpName,
      (entry) => {
        entry.tokens = tokens
      },
      serverUrl,
    )
  }

  export async function updateClientInfo(mcpName: string, clientInfo: ClientInfo, serverUrl?: string): Promise<void> {
    await mutate(
      mcpName,
      (entry) => {
        entry.clientInfo = clientInfo
      },
      serverUrl,
    )
  }

  export async function updateCodeVerifier(mcpName: string, codeVerifier: string): Promise<void> {
    await mutate(mcpName, (entry) => {
      entry.codeVerifier = codeVerifier
    })
  }

  export async function clearCodeVerifier(mcpName: string): Promise<void> {
    const data = await loadCache()
    const entry = data[mcpName]
    if (!entry) return
    delete entry.codeVerifier
    await schedulePersist()
  }

  export async function updateOAuthState(mcpName: string, oauthState: string): Promise<void> {
    await mutate(mcpName, (entry) => {
      entry.oauthState = oauthState
    })
  }

  export async function getOAuthState(mcpName: string): Promise<string | undefined> {
    const entry = await get(mcpName)
    return entry?.oauthState
  }

  export async function clearOAuthState(mcpName: string): Promise<void> {
    const data = await loadCache()
    const entry = data[mcpName]
    if (!entry) return
    delete entry.oauthState
    await schedulePersist()
  }

  /**
   * Check if stored tokens are expired.
   * Returns null if no tokens exist, false if no expiry or not expired, true if expired.
   */
  export async function isTokenExpired(mcpName: string): Promise<boolean | null> {
    const entry = await get(mcpName)
    if (!entry?.tokens) return null
    if (!entry.tokens.expiresAt) return false
    return entry.tokens.expiresAt < Date.now() / 1000
  }
}
