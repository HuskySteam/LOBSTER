import { create } from "zustand"
import type {
  Message,
  Agent,
  Provider,
  Session,
  Part,
  Config,
  Todo,
  Command,
  PermissionRequest,
  QuestionRequest,
  LspStatus,
  McpStatus,
  McpResource,
  FormatterStatus,
  SessionStatus,
  ProviderListResponse,
  ProviderAuthMethod,
  VcsInfo,
} from "@lobster-ai/sdk/v2"
import type { Snapshot } from "@/snapshot"
import type { Path } from "@lobster-ai/sdk"

export interface TeamInfo {
  name: string
  members: { name: string; agentId: string; agentType: string; status: string }[]
  leadSessionID: string
  time: { created: number; updated: number }
}

export interface TeamTaskSummary {
  id: string
  subject: string
  status: string
  owner: string
  blockedBy: string[]
}

export interface AppState {
  status: "loading" | "partial" | "complete"
  provider: Provider[]
  provider_default: Record<string, string>
  provider_next: ProviderListResponse
  provider_auth: Record<string, ProviderAuthMethod[]>
  agent: Agent[]
  command: Command[]
  permission: Record<string, PermissionRequest[]>
  question: Record<string, QuestionRequest[]>
  config: Config
  session: Session[]
  session_status: Record<string, SessionStatus>
  session_diff: Record<string, Snapshot.FileDiff[]>
  todo: Record<string, Todo[]>
  message: Record<string, Message[]>
  part: Record<string, Part[]>
  message_session: Record<string, string>
  session_part: Record<string, Record<string, Part[]>>
  message_text_tokens: Record<string, number>
  session_text_tokens: Record<string, number>
  lsp: LspStatus[]
  mcp: Record<string, McpStatus>
  mcp_resource: Record<string, McpResource>
  formatter: FormatterStatus[]
  vcs: VcsInfo | undefined
  path: Path
  teams: Record<string, TeamInfo>
  team_tasks: Record<string, TeamTaskSummary[]>
}

export interface AppActions {
  setStatus: (status: AppState["status"]) => void
  setProviders: (providers: Provider[]) => void
  setProviderDefault: (defaults: Record<string, string>) => void
  setProviderNext: (next: ProviderListResponse) => void
  setProviderAuth: (auth: Record<string, ProviderAuthMethod[]>) => void
  setAgents: (agents: Agent[]) => void
  setCommands: (commands: Command[]) => void
  setConfig: (config: Config) => void
  setSessions: (sessions: Session[]) => void
  setLsp: (lsp: LspStatus[]) => void
  setMcp: (mcp: Record<string, McpStatus>) => void
  setMcpResource: (resources: Record<string, McpResource>) => void
  setFormatters: (formatters: FormatterStatus[]) => void
  setVcs: (vcs: VcsInfo | undefined) => void
  setPath: (path: Path) => void
  // Granular updates
  upsertSession: (session: Session) => void
  removeSession: (sessionID: string) => void
  setSessionStatus: (sessionID: string, status: SessionStatus) => void
  setSessionDiff: (sessionID: string, diff: Snapshot.FileDiff[]) => void
  setTodo: (sessionID: string, todos: Todo[]) => void
  upsertMessage: (msg: Message) => void
  removeMessage: (sessionID: string, messageID: string) => void
  setMessages: (sessionID: string, messages: Message[]) => void
  upsertPart: (part: Part) => void
  removePart: (messageID: string, partID: string) => void
  setParts: (messageID: string, parts: Part[]) => void
  addPermission: (request: PermissionRequest) => void
  removePermission: (sessionID: string, requestID: string) => void
  addQuestion: (request: QuestionRequest) => void
  removeQuestion: (sessionID: string, requestID: string) => void
  upsertTeam: (info: TeamInfo) => void
  removeTeam: (teamName: string) => void
  upsertTeamTask: (teamName: string, task: TeamTaskSummary) => void
  reset: () => void
}

const initialState: AppState = {
  status: "loading",
  provider: [],
  provider_default: {},
  provider_next: { all: [], default: {}, connected: [] },
  provider_auth: {},
  agent: [],
  command: [],
  permission: {},
  question: {},
  config: {},
  session: [],
  session_status: {},
  session_diff: {},
  todo: {},
  message: {},
  part: {},
  message_session: {},
  session_part: {},
  message_text_tokens: {},
  session_text_tokens: {},
  lsp: [],
  mcp: {},
  mcp_resource: {},
  formatter: [],
  vcs: undefined,
  path: { state: "", config: "", worktree: "", directory: "" },
  teams: {},
  team_tasks: {},
}

// Binary search for sorted arrays by ID
function binarySearch<T>(arr: T[], id: string, getId: (item: T) => string): { found: boolean; index: number } {
  let lo = 0
  let hi = arr.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const cmp = getId(arr[mid]).localeCompare(id)
    if (cmp === 0) return { found: true, index: mid }
    if (cmp < 0) lo = mid + 1
    else hi = mid - 1
  }
  return { found: false, index: lo }
}

const MAX_SESSION_MESSAGES = 100

function hasOwn(obj: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function textTokenEstimate(parts: Part[]): number {
  let total = 0
  for (const part of parts) {
    if (part.type !== "text") continue
    total += Math.ceil((((part as any).text as string | undefined)?.length ?? 0) / 4)
  }
  return total
}

function upsertSessionMessageBuffer(messages: Message[], msg: Message): {
  next: Message[]
  changed: boolean
  evicted?: Message
} {
  if (messages.length === 0) {
    return { next: [msg], changed: true }
  }

  const last = messages[messages.length - 1]!
  if (last.id === msg.id) {
    if (last === msg) return { next: messages, changed: false }
    const next = [...messages]
    next[next.length - 1] = msg
    return { next, changed: true }
  }

  if (last.id.localeCompare(msg.id) < 0) {
    if (messages.length < MAX_SESSION_MESSAGES) {
      return { next: [...messages, msg], changed: true }
    }
    return { next: [...messages.slice(1), msg], changed: true, evicted: messages[0] }
  }

  const result = binarySearch(messages, msg.id, (m) => m.id)
  if (result.found) {
    if (messages[result.index] === msg) return { next: messages, changed: false }
    const next = [...messages]
    next[result.index] = msg
    return { next, changed: true }
  }

  const next = [...messages]
  next.splice(result.index, 0, msg)
  if (next.length > MAX_SESSION_MESSAGES) {
    return { next: next.slice(1), changed: true, evicted: next[0] }
  }
  return { next, changed: true }
}

function upsertPartBuffer(parts: Part[], part: Part): { next: Part[]; changed: boolean } {
  if (parts.length === 0) return { next: [part], changed: true }

  const last = parts[parts.length - 1]!
  if (last.id === part.id) {
    if (last === part) return { next: parts, changed: false }
    const next = [...parts]
    next[next.length - 1] = part
    return { next, changed: true }
  }

  if (last.id.localeCompare(part.id) < 0) {
    return { next: [...parts, part], changed: true }
  }

  const result = binarySearch(parts, part.id, (p) => p.id)
  if (result.found) {
    if (parts[result.index] === part) return { next: parts, changed: false }
    const next = [...parts]
    next[result.index] = part
    return { next, changed: true }
  }

  const next = [...parts]
  next.splice(result.index, 0, part)
  return { next, changed: true }
}

function updateSessionPartMap(
  source: Record<string, Record<string, Part[]>>,
  sessionID: string,
  messageID: string,
  parts: Part[] | undefined,
) {
  const currentSessionParts = source[sessionID] ?? {}
  if (parts === undefined) {
    if (!hasOwn(currentSessionParts as Record<string, unknown>, messageID)) return source
    const nextSessionParts = { ...currentSessionParts }
    delete nextSessionParts[messageID]
    if (Object.keys(nextSessionParts).length === 0) {
      const next = { ...source }
      delete next[sessionID]
      return next
    }
    return { ...source, [sessionID]: nextSessionParts }
  }

  if (currentSessionParts[messageID] === parts) return source
  return {
    ...source,
    [sessionID]: {
      ...currentSessionParts,
      [messageID]: parts,
    },
  }
}

function setMessageTokenMap(
  source: Record<string, number>,
  messageID: string,
  tokens: number | undefined,
): Record<string, number> {
  if (tokens === undefined) {
    if (!hasOwn(source as Record<string, unknown>, messageID)) return source
    const next = { ...source }
    delete next[messageID]
    return next
  }
  if (source[messageID] === tokens) return source
  return { ...source, [messageID]: tokens }
}

function adjustSessionTokenMap(
  source: Record<string, number>,
  sessionID: string,
  delta: number,
): Record<string, number> {
  if (delta === 0) return source
  const current = source[sessionID] ?? 0
  const next = Math.max(0, current + delta)
  if (next === current) return source
  return { ...source, [sessionID]: next }
}

export const useAppStore = create<AppState & AppActions>()((set) => ({
  ...initialState,

  setStatus: (status) => set({ status }),
  setProviders: (provider) => set({ provider }),
  setProviderDefault: (provider_default) => set({ provider_default }),
  setProviderNext: (provider_next) => set({ provider_next }),
  setProviderAuth: (provider_auth) => set({ provider_auth }),
  setAgents: (agent) => set({ agent }),
  setCommands: (command) => set({ command }),
  setConfig: (config) => set({ config }),
  setSessions: (session) => set({ session }),
  setLsp: (lsp) => set({ lsp }),
  setMcp: (mcp) => set({ mcp }),
  setMcpResource: (mcp_resource) => set({ mcp_resource }),
  setFormatters: (formatter) => set({ formatter }),
  setVcs: (vcs) => set({ vcs }),
  setPath: (path) => set({ path }),

  upsertSession: (session) =>
    set((state) => {
      const result = binarySearch(state.session, session.id, (s) => s.id)
      const next = [...state.session]
      if (result.found) {
        next[result.index] = session
      } else {
        next.splice(result.index, 0, session)
      }
      return { session: next }
    }),

  removeSession: (sessionID) =>
    set((state) => {
      const result = binarySearch(state.session, sessionID, (s) => s.id)
      if (!result.found) return state
      const next = [...state.session]
      next.splice(result.index, 1)

      const sessionMessages = state.message[sessionID] ?? []

      let message = state.message
      if (hasOwn(message as Record<string, unknown>, sessionID)) {
        message = { ...message }
        delete message[sessionID]
      }

      let part = state.part
      let message_session = state.message_session
      let message_text_tokens = state.message_text_tokens
      for (const msg of sessionMessages) {
        if (hasOwn(part as Record<string, unknown>, msg.id)) {
          if (part === state.part) part = { ...part }
          delete part[msg.id]
        }
        if (hasOwn(message_session as Record<string, unknown>, msg.id)) {
          if (message_session === state.message_session) message_session = { ...message_session }
          delete message_session[msg.id]
        }
        if (hasOwn(message_text_tokens as Record<string, unknown>, msg.id)) {
          if (message_text_tokens === state.message_text_tokens) message_text_tokens = { ...message_text_tokens }
          delete message_text_tokens[msg.id]
        }
      }

      let session_part = state.session_part
      if (hasOwn(session_part as Record<string, unknown>, sessionID)) {
        session_part = { ...session_part }
        delete session_part[sessionID]
      }

      let session_text_tokens = state.session_text_tokens
      if (hasOwn(session_text_tokens as Record<string, unknown>, sessionID)) {
        session_text_tokens = { ...session_text_tokens }
        delete session_text_tokens[sessionID]
      }

      return {
        session: next,
        ...(message !== state.message ? { message } : {}),
        ...(part !== state.part ? { part } : {}),
        ...(message_session !== state.message_session ? { message_session } : {}),
        ...(message_text_tokens !== state.message_text_tokens ? { message_text_tokens } : {}),
        ...(session_part !== state.session_part ? { session_part } : {}),
        ...(session_text_tokens !== state.session_text_tokens ? { session_text_tokens } : {}),
      }
    }),

  setSessionStatus: (sessionID, status) =>
    set((state) => ({
      session_status: { ...state.session_status, [sessionID]: status },
    })),

  setSessionDiff: (sessionID, diff) =>
    set((state) => ({
      session_diff: { ...state.session_diff, [sessionID]: diff },
    })),

  setTodo: (sessionID, todos) =>
    set((state) => ({
      todo: { ...state.todo, [sessionID]: todos },
    })),

  upsertMessage: (msg) =>
    set((state) => {
      const sessionMessages = state.message[msg.sessionID] ?? []
      const buffer = upsertSessionMessageBuffer(sessionMessages, msg)

      let message = state.message
      if (buffer.changed) {
        message = { ...message, [msg.sessionID]: buffer.next }
      }

      let message_session = state.message_session
      if (message_session[msg.id] !== msg.sessionID) {
        message_session = { ...message_session, [msg.id]: msg.sessionID }
      }

      let part = state.part
      let session_part = state.session_part
      let message_text_tokens = state.message_text_tokens
      let session_text_tokens = state.session_text_tokens

      // Backfill derived state if parts arrive before message mapping.
      const knownParts = part[msg.id]
      if (knownParts) {
        session_part = updateSessionPartMap(session_part, msg.sessionID, msg.id, knownParts)
        const prevTokens = message_text_tokens[msg.id] ?? 0
        const nextTokens = textTokenEstimate(knownParts)
        if (nextTokens !== prevTokens || !hasOwn(message_text_tokens as Record<string, unknown>, msg.id)) {
          message_text_tokens = setMessageTokenMap(message_text_tokens, msg.id, nextTokens)
          session_text_tokens = adjustSessionTokenMap(session_text_tokens, msg.sessionID, nextTokens - prevTokens)
        }
      }

      if (buffer.evicted) {
        const evictedID = buffer.evicted.id
        const evictedSessionID = message_session[evictedID] ?? msg.sessionID

        if (hasOwn(message_session as Record<string, unknown>, evictedID)) {
          if (message_session === state.message_session) message_session = { ...message_session }
          delete message_session[evictedID]
        }

        if (hasOwn(part as Record<string, unknown>, evictedID)) {
          if (part === state.part) part = { ...part }
          delete part[evictedID]
        }

        session_part = updateSessionPartMap(session_part, evictedSessionID, evictedID, undefined)

        const evictedTokens = message_text_tokens[evictedID] ?? 0
        if (hasOwn(message_text_tokens as Record<string, unknown>, evictedID)) {
          message_text_tokens = setMessageTokenMap(message_text_tokens, evictedID, undefined)
        }
        if (evictedTokens !== 0) {
          session_text_tokens = adjustSessionTokenMap(session_text_tokens, evictedSessionID, -evictedTokens)
        }
      }

      if (
        message === state.message &&
        message_session === state.message_session &&
        part === state.part &&
        session_part === state.session_part &&
        message_text_tokens === state.message_text_tokens &&
        session_text_tokens === state.session_text_tokens
      ) {
        return state
      }

      return {
        ...(message !== state.message ? { message } : {}),
        ...(message_session !== state.message_session ? { message_session } : {}),
        ...(part !== state.part ? { part } : {}),
        ...(session_part !== state.session_part ? { session_part } : {}),
        ...(message_text_tokens !== state.message_text_tokens ? { message_text_tokens } : {}),
        ...(session_text_tokens !== state.session_text_tokens ? { session_text_tokens } : {}),
      }
    }),

  removeMessage: (sessionID, messageID) =>
    set((state) => {
      const sessionMessages = state.message[sessionID] ?? []
      const result = binarySearch(sessionMessages, messageID, (m) => m.id)
      if (!result.found) return state
      const next = [...sessionMessages]
      next.splice(result.index, 1)

      let part = state.part
      if (hasOwn(part as Record<string, unknown>, messageID)) {
        part = { ...part }
        delete part[messageID]
      }

      let message_session = state.message_session
      if (hasOwn(message_session as Record<string, unknown>, messageID)) {
        message_session = { ...message_session }
        delete message_session[messageID]
      }

      const prevTokens = state.message_text_tokens[messageID] ?? 0
      const message_text_tokens = setMessageTokenMap(state.message_text_tokens, messageID, undefined)
      const session_text_tokens = adjustSessionTokenMap(state.session_text_tokens, sessionID, -prevTokens)
      const session_part = updateSessionPartMap(state.session_part, sessionID, messageID, undefined)

      return {
        message: { ...state.message, [sessionID]: next },
        ...(part !== state.part ? { part } : {}),
        ...(message_session !== state.message_session ? { message_session } : {}),
        ...(message_text_tokens !== state.message_text_tokens ? { message_text_tokens } : {}),
        ...(session_text_tokens !== state.session_text_tokens ? { session_text_tokens } : {}),
        ...(session_part !== state.session_part ? { session_part } : {}),
      }
    }),

  setMessages: (sessionID, messages) =>
    set((state) => {
      const previous = state.message[sessionID] ?? []
      const nextIDs = new Set(messages.map((x) => x.id))

      let part = state.part
      let message_session = state.message_session
      let message_text_tokens = state.message_text_tokens

      for (const msg of previous) {
        if (nextIDs.has(msg.id)) continue
        if (hasOwn(part as Record<string, unknown>, msg.id)) {
          if (part === state.part) part = { ...part }
          delete part[msg.id]
        }
        if (hasOwn(message_session as Record<string, unknown>, msg.id)) {
          if (message_session === state.message_session) message_session = { ...message_session }
          delete message_session[msg.id]
        }
        if (hasOwn(message_text_tokens as Record<string, unknown>, msg.id)) {
          if (message_text_tokens === state.message_text_tokens) message_text_tokens = { ...message_text_tokens }
          delete message_text_tokens[msg.id]
        }
      }

      let nextSessionPart: Record<string, Part[]> | undefined
      let sessionTotal = 0
      for (const msg of messages) {
        if (message_session[msg.id] !== sessionID) {
          if (message_session === state.message_session) message_session = { ...message_session }
          message_session[msg.id] = sessionID
        }

        const msgParts = part[msg.id]
        if (!msgParts) {
          message_text_tokens = setMessageTokenMap(message_text_tokens, msg.id, undefined)
          continue
        }

        if (!nextSessionPart) nextSessionPart = {}
        nextSessionPart[msg.id] = msgParts

        const tokens = textTokenEstimate(msgParts)
        sessionTotal += tokens
        message_text_tokens = setMessageTokenMap(message_text_tokens, msg.id, tokens)
      }

      const session_part = (() => {
        if (nextSessionPart) return { ...state.session_part, [sessionID]: nextSessionPart }
        if (!hasOwn(state.session_part as Record<string, unknown>, sessionID)) return state.session_part
        const next = { ...state.session_part }
        delete next[sessionID]
        return next
      })()

      const session_text_tokens = { ...state.session_text_tokens, [sessionID]: sessionTotal }

      return {
        message: { ...state.message, [sessionID]: messages },
        ...(part !== state.part ? { part } : {}),
        ...(message_session !== state.message_session ? { message_session } : {}),
        ...(message_text_tokens !== state.message_text_tokens ? { message_text_tokens } : {}),
        ...(session_part !== state.session_part ? { session_part } : {}),
        ...(session_text_tokens !== state.session_text_tokens ? { session_text_tokens } : {}),
      }
    }),

  upsertPart: (part) =>
    set((state) => {
      const messageParts = state.part[part.messageID] ?? []
      const updated = upsertPartBuffer(messageParts, part)
      if (!updated.changed) return state

      const partMap = { ...state.part, [part.messageID]: updated.next }
      const sessionID = state.message_session[part.messageID]
      if (!sessionID) return { part: partMap }

      const session_part = updateSessionPartMap(state.session_part, sessionID, part.messageID, updated.next)
      const prevTokens = state.message_text_tokens[part.messageID] ?? 0
      const nextTokens = textTokenEstimate(updated.next)
      const message_text_tokens = setMessageTokenMap(state.message_text_tokens, part.messageID, nextTokens)
      const session_text_tokens = adjustSessionTokenMap(state.session_text_tokens, sessionID, nextTokens - prevTokens)

      return {
        part: partMap,
        ...(session_part !== state.session_part ? { session_part } : {}),
        ...(message_text_tokens !== state.message_text_tokens ? { message_text_tokens } : {}),
        ...(session_text_tokens !== state.session_text_tokens ? { session_text_tokens } : {}),
      }
    }),

  removePart: (messageID, partID) =>
    set((state) => {
      const messageParts = state.part[messageID] ?? []
      const result = binarySearch(messageParts, partID, (p) => p.id)
      if (!result.found) return state
      const next = [...messageParts]
      next.splice(result.index, 1)

      const partMap = { ...state.part }
      if (next.length === 0) delete partMap[messageID]
      else partMap[messageID] = next

      const sessionID = state.message_session[messageID]
      if (!sessionID) return { part: partMap }

      const session_part = updateSessionPartMap(state.session_part, sessionID, messageID, next.length > 0 ? next : undefined)
      const prevTokens = state.message_text_tokens[messageID] ?? 0
      const nextTokens = next.length > 0 ? textTokenEstimate(next) : 0
      const message_text_tokens = setMessageTokenMap(
        state.message_text_tokens,
        messageID,
        next.length > 0 ? nextTokens : undefined,
      )
      const session_text_tokens = adjustSessionTokenMap(state.session_text_tokens, sessionID, nextTokens - prevTokens)

      return {
        part: partMap,
        ...(session_part !== state.session_part ? { session_part } : {}),
        ...(message_text_tokens !== state.message_text_tokens ? { message_text_tokens } : {}),
        ...(session_text_tokens !== state.session_text_tokens ? { session_text_tokens } : {}),
      }
    }),

  setParts: (messageID, parts) =>
    set((state) => {
      const partMap = { ...state.part }
      if (parts.length === 0) delete partMap[messageID]
      else partMap[messageID] = parts

      const sessionID = state.message_session[messageID]
      if (!sessionID) return { part: partMap }

      const session_part = updateSessionPartMap(state.session_part, sessionID, messageID, parts.length > 0 ? parts : undefined)
      const prevTokens = state.message_text_tokens[messageID] ?? 0
      const nextTokens = parts.length > 0 ? textTokenEstimate(parts) : 0
      const message_text_tokens = setMessageTokenMap(
        state.message_text_tokens,
        messageID,
        parts.length > 0 ? nextTokens : undefined,
      )
      const session_text_tokens = adjustSessionTokenMap(state.session_text_tokens, sessionID, nextTokens - prevTokens)

      return {
        part: partMap,
        ...(session_part !== state.session_part ? { session_part } : {}),
        ...(message_text_tokens !== state.message_text_tokens ? { message_text_tokens } : {}),
        ...(session_text_tokens !== state.session_text_tokens ? { session_text_tokens } : {}),
      }
    }),

  addPermission: (request) =>
    set((state) => {
      const requests = state.permission[request.sessionID] ?? []
      const result = binarySearch(requests, request.id, (r) => r.id)
      const next = [...requests]
      if (result.found) {
        next[result.index] = request
      } else {
        next.splice(result.index, 0, request)
      }
      return { permission: { ...state.permission, [request.sessionID]: next } }
    }),

  removePermission: (sessionID, requestID) =>
    set((state) => {
      const requests = state.permission[sessionID] ?? []
      const result = binarySearch(requests, requestID, (r) => r.id)
      if (!result.found) return state
      const next = [...requests]
      next.splice(result.index, 1)
      return { permission: { ...state.permission, [sessionID]: next } }
    }),

  addQuestion: (request) =>
    set((state) => {
      const requests = state.question[request.sessionID] ?? []
      const result = binarySearch(requests, request.id, (r) => r.id)
      const next = [...requests]
      if (result.found) {
        next[result.index] = request
      } else {
        next.splice(result.index, 0, request)
      }
      return { question: { ...state.question, [request.sessionID]: next } }
    }),

  removeQuestion: (sessionID, requestID) =>
    set((state) => {
      const requests = state.question[sessionID] ?? []
      const result = binarySearch(requests, requestID, (r) => r.id)
      if (!result.found) return state
      const next = [...requests]
      next.splice(result.index, 1)
      return { question: { ...state.question, [sessionID]: next } }
    }),

  upsertTeam: (info) =>
    set((state) => ({
      teams: { ...state.teams, [info.name]: info },
    })),

  removeTeam: (teamName) =>
    set((state) => {
      const { [teamName]: _, ...teams } = state.teams
      const { [teamName]: __, ...team_tasks } = state.team_tasks
      return { teams, team_tasks }
    }),

  upsertTeamTask: (teamName, task) =>
    set((state) => {
      const tasks = state.team_tasks[teamName] ?? []
      const idx = tasks.findIndex((t) => t.id === task.id)
      const next = [...tasks]
      if (idx >= 0) {
        next[idx] = task
      } else {
        next.push(task)
      }
      return { team_tasks: { ...state.team_tasks, [teamName]: next } }
    }),

  reset: () => set(initialState),
}))
