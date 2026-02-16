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
      return { session: next }
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
      const result = binarySearch(sessionMessages, msg.id, (m) => m.id)
      const next = [...sessionMessages]
      if (result.found) {
        next[result.index] = msg
      } else {
        next.splice(result.index, 0, msg)
      }
      // Evict oldest if buffer exceeds 100
      const evicted = next.length > 100 ? next.slice(1) : next
      const partUpdate: Record<string, Part[]> = {}
      if (next.length > 100) {
        // Remove parts for evicted message
        const evictedMsg = next[0]
        Object.assign(partUpdate, state.part)
        delete partUpdate[evictedMsg.id]
      }
      return {
        message: { ...state.message, [msg.sessionID]: evicted },
        ...(next.length > 100 ? { part: partUpdate } : {}),
      }
    }),

  removeMessage: (sessionID, messageID) =>
    set((state) => {
      const sessionMessages = state.message[sessionID] ?? []
      const result = binarySearch(sessionMessages, messageID, (m) => m.id)
      if (!result.found) return state
      const next = [...sessionMessages]
      next.splice(result.index, 1)
      return { message: { ...state.message, [sessionID]: next } }
    }),

  setMessages: (sessionID, messages) =>
    set((state) => ({
      message: { ...state.message, [sessionID]: messages },
    })),

  upsertPart: (part) =>
    set((state) => {
      const messageParts = state.part[part.messageID] ?? []
      const result = binarySearch(messageParts, part.id, (p) => p.id)
      const next = [...messageParts]
      if (result.found) {
        next[result.index] = part
      } else {
        next.splice(result.index, 0, part)
      }
      return { part: { ...state.part, [part.messageID]: next } }
    }),

  removePart: (messageID, partID) =>
    set((state) => {
      const messageParts = state.part[messageID] ?? []
      const result = binarySearch(messageParts, partID, (p) => p.id)
      if (!result.found) return state
      const next = [...messageParts]
      next.splice(result.index, 1)
      return { part: { ...state.part, [messageID]: next } }
    }),

  setParts: (messageID, parts) =>
    set((state) => ({
      part: { ...state.part, [messageID]: parts },
    })),

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
