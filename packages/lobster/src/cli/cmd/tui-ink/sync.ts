import { useAppStore } from "./store"
import { createLobsterClient, type Event } from "@lobster-ai/sdk/v2"
import { Log } from "@/util/log"

export type EventSource = {
  on: (handler: (event: Event) => void) => () => void
}

type TeamEvent = {
  type: "team.created" | "team.updated" | "team.deleted" | "team.task.created" | "team.task.updated"
  properties: Record<string, any>
}

const teamEventTypes = new Set([
  "team.created",
  "team.updated",
  "team.deleted",
  "team.task.created",
  "team.task.updated",
])

function isTeamEvent(event: { type: string; properties?: unknown }): event is TeamEvent {
  return teamEventTypes.has(event.type)
}

export function createSyncManager(input: {
  url: string
  directory?: string
  fetch?: typeof fetch
  headers?: RequestInit["headers"]
  events?: EventSource
  args: { continue?: boolean }
  onExit: (reason?: unknown) => Promise<void>
}) {
  const client = createLobsterClient({
    baseUrl: input.url,
    directory: input.directory,
    fetch: input.fetch,
    headers: input.headers,
  })

  const abort = new AbortController()
  const store = useAppStore.getState

  let eventQueue: Event[] = []
  let flushTimer: Timer | undefined
  let lastFlush = 0
  let lspRefreshTimer: Timer | undefined
  let lspRefreshInFlight = false
  let lspRefreshPending = false
  const fullSyncedSessions = new Set<string>()
  const LSP_REFRESH_DEBOUNCE_MS = 80

  async function refreshLspStatus() {
    if (lspRefreshInFlight) return
    if (!lspRefreshPending) return

    lspRefreshPending = false
    lspRefreshInFlight = true
    try {
      const x = await client.lsp.status()
      if (x.data) useAppStore.getState().setLsp(x.data)
    } catch {
      // best-effort refresh
    } finally {
      lspRefreshInFlight = false
      if (lspRefreshPending && !lspRefreshTimer) {
        lspRefreshTimer = setTimeout(() => {
          lspRefreshTimer = undefined
          void refreshLspStatus()
        }, LSP_REFRESH_DEBOUNCE_MS)
      }
    }
  }

  function scheduleLspRefresh() {
    lspRefreshPending = true
    if (lspRefreshInFlight) return
    if (lspRefreshTimer) return
    lspRefreshTimer = setTimeout(() => {
      lspRefreshTimer = undefined
      void refreshLspStatus()
    }, LSP_REFRESH_DEBOUNCE_MS)
  }

  function flush() {
    if (eventQueue.length === 0) return
    const events = eventQueue
    eventQueue = []
    flushTimer = undefined
    lastFlush = Date.now()
    for (const event of events) {
      handleEvent(event)
    }
  }

  function enqueue(event: Event) {
    eventQueue.push(event)
    const elapsed = Date.now() - lastFlush
    if (flushTimer) return
    if (elapsed < 16) {
      flushTimer = setTimeout(flush, 16)
      return
    }
    flush()
  }

  function handleEvent(event: Event) {
    const s = useAppStore.getState()
    switch (event.type) {
      case "server.instance.disposed":
        bootstrap()
        break

      case "permission.replied":
        useAppStore.getState().removePermission(event.properties.sessionID, event.properties.requestID)
        break

      case "permission.asked":
        useAppStore.getState().addPermission(event.properties)
        break

      case "question.replied":
      case "question.rejected":
        useAppStore.getState().removeQuestion(event.properties.sessionID, event.properties.requestID)
        break

      case "question.asked":
        useAppStore.getState().addQuestion(event.properties)
        break

      case "todo.updated":
        useAppStore.getState().setTodo(event.properties.sessionID, event.properties.todos)
        break

      case "session.diff":
        useAppStore.getState().setSessionDiff(event.properties.sessionID, event.properties.diff)
        break

      case "session.deleted":
        useAppStore.getState().removeSession(event.properties.info.id)
        break

      case "session.updated":
        useAppStore.getState().upsertSession(event.properties.info)
        break

      case "session.status":
        useAppStore.getState().setSessionStatus(event.properties.sessionID, event.properties.status)
        break

      case "message.updated":
        useAppStore.getState().upsertMessage(event.properties.info)
        break

      case "message.removed":
        useAppStore.getState().removeMessage(event.properties.sessionID, event.properties.messageID)
        break

      case "message.part.updated":
        useAppStore.getState().upsertPart(event.properties.part)
        break

      case "message.part.removed":
        useAppStore.getState().removePart(event.properties.messageID, event.properties.partID)
        break

      case "lsp.updated":
        scheduleLspRefresh()
        break

      case "vcs.branch.updated":
        useAppStore.getState().setVcs({ branch: event.properties.branch } as any)
        break
    }

    // Handle team events
    if (isTeamEvent(event)) {
      handleTeamEvent(event)
    }
  }

  function handleTeamEvent(event: TeamEvent) {
    const s = useAppStore.getState()
    switch (event.type) {
      case "team.created":
      case "team.updated":
        s.upsertTeam(event.properties.info)
        break
      case "team.deleted":
        s.removeTeam(event.properties.teamName)
        break
      case "team.task.created":
      case "team.task.updated": {
        const task = event.properties.task
        s.upsertTeamTask(task.teamName, {
          id: task.id,
          subject: task.subject,
          status: task.status,
          owner: task.owner ?? "",
          blockedBy: task.blockedBy ?? [],
        })
        break
      }
    }
  }

  async function bootstrap() {
    Log.Default.info("bootstrapping")
    const start = Date.now() - 30 * 24 * 60 * 60 * 1000
    const sessionListPromise = client.session
      .list({ start })
      .then((x) => (x.data ?? []).toSorted((a, b) => a.id.localeCompare(b.id)))

    const providersPromise = client.config.providers({}, { throwOnError: true })
    const providerListPromise = client.provider.list({}, { throwOnError: true })
    const agentsPromise = client.app.agents({}, { throwOnError: true })
    const configPromise = client.config.get({}, { throwOnError: true })

    const blockingRequests: Promise<unknown>[] = [
      providersPromise,
      providerListPromise,
      agentsPromise,
      configPromise,
      ...(input.args.continue ? [sessionListPromise] : []),
    ]

    await Promise.all(blockingRequests)
      .then(async () => {
        const [providers, providerList, agents, config] = await Promise.all([
          providersPromise.then((x) => x.data!),
          providerListPromise.then((x) => x.data!),
          agentsPromise.then((x) => x.data ?? []),
          configPromise.then((x) => x.data!),
        ])
        const sessions = input.args.continue ? await sessionListPromise : undefined

        const s = useAppStore.getState()
        s.setProviders(providers.providers)
        s.setProviderDefault(providers.default)
        s.setProviderNext(providerList)
        s.setAgents(agents)
        s.setConfig(config)
        if (sessions !== undefined) s.setSessions(sessions)
      })
      .then(async () => {
        const s = useAppStore.getState()
        if (s.status !== "complete") s.setStatus("partial")

        await Promise.all([
          ...(input.args.continue
            ? []
            : [sessionListPromise.then((sessions) => useAppStore.getState().setSessions(sessions))]),
          client.command.list().then((x) => useAppStore.getState().setCommands(x.data ?? [])),
          client.lsp.status().then((x) => useAppStore.getState().setLsp(x.data!)),
          client.mcp.status().then((x) => useAppStore.getState().setMcp(x.data!)),
          client.experimental.resource.list().then((x) => useAppStore.getState().setMcpResource(x.data ?? {})),
          client.formatter.status().then((x) => useAppStore.getState().setFormatters(x.data!)),
          client.session.status().then((x) => {
            const data = x.data!
            for (const [sessionID, status] of Object.entries(data)) {
              useAppStore.getState().setSessionStatus(sessionID, status)
            }
          }),
          client.provider.auth().then((x) => useAppStore.getState().setProviderAuth(x.data ?? {})),
          client.vcs.get().then((x) => useAppStore.getState().setVcs(x.data)),
          client.path.get().then((x) => useAppStore.getState().setPath(x.data!)),
        ]).then(() => {
          useAppStore.getState().setStatus("complete")
        })
      })
      .catch(async (e) => {
        Log.Default.error("tui bootstrap failed", {
          error: e instanceof Error ? e.message : String(e),
          name: e instanceof Error ? e.name : undefined,
          stack: e instanceof Error ? e.stack : undefined,
        })
        await input.onExit(e)
      })
  }

  async function syncSession(sessionID: string) {
    if (fullSyncedSessions.has(sessionID)) return
    const [session, messages, todo, diff] = await Promise.all([
      client.session.get({ sessionID }, { throwOnError: true }),
      client.session.messages({ sessionID, limit: 100 }),
      client.session.todo({ sessionID }),
      client.session.diff({ sessionID }),
    ])
    const s = useAppStore.getState()
    s.upsertSession(session.data!)
    s.setTodo(sessionID, todo.data ?? [])
    s.setMessages(sessionID, messages.data!.map((x) => x.info))
    for (const message of messages.data!) {
      s.setParts(message.info.id, message.parts)
    }
    s.setSessionDiff(sessionID, diff.data ?? [])
    fullSyncedSessions.add(sessionID)
  }

  async function startEventLoop() {
    if (input.events) {
      return input.events.on(enqueue)
    }

    // SSE with exponential backoff
    let backoff = 0
    const MAX_BACKOFF = 8000
    while (true) {
      if (abort.signal.aborted) break
      try {
        const events = await client.event.subscribe({}, { signal: abort.signal })
        backoff = 0
        for await (const event of events.stream) {
          enqueue(event)
        }
        if (flushTimer) clearTimeout(flushTimer)
        if (eventQueue.length > 0) flush()
      } catch {
        // Connection failed or stream ended
      }
      if (abort.signal.aborted) break
      backoff = backoff === 0 ? 1000 : Math.min(backoff * 2, MAX_BACKOFF)
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, backoff)
        const onAbort = () => {
          clearTimeout(t)
          resolve()
        }
        abort.signal.addEventListener("abort", onAbort, { once: true })
      })
    }
  }

  function dispose() {
    abort.abort()
    if (flushTimer) clearTimeout(flushTimer)
    if (lspRefreshTimer) clearTimeout(lspRefreshTimer)
  }

  return {
    client,
    bootstrap,
    startEventLoop,
    syncSession,
    dispose,
    get status() {
      return useAppStore.getState().status
    },
  }
}

export type SyncManager = ReturnType<typeof createSyncManager>
