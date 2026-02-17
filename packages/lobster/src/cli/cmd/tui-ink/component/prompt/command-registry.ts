export type BuiltInCommandCategory = "Navigation" | "Agent" | "System" | "Lobster" | "Session"

export interface BuiltInCommand {
  name: string
  description: string
  category: BuiltInCommandCategory
  aliases?: string[]
  sessionOnly?: boolean
}

export const BUILT_IN_COMMANDS: BuiltInCommand[] = [
  { name: "connect", description: "Connect a provider", category: "Agent" },
  { name: "model", description: "Switch model", category: "Agent", aliases: ["models"] },
  { name: "agent", description: "Switch agent", category: "Agent", aliases: ["agents"] },
  { name: "mcp", description: "MCP servers", category: "Agent", aliases: ["mcps"] },
  { name: "theme", description: "Switch theme", category: "System", aliases: ["themes"] },
  {
    name: "sessions",
    description: "Browse sessions",
    category: "Navigation",
    aliases: ["resume", "continue"],
  },
  { name: "new", description: "Start a new session", category: "Navigation", aliases: ["clear"] },
  { name: "status", description: "System status", category: "System" },
  {
    name: "keybinds",
    description: "Keyboard shortcuts",
    category: "System",
    aliases: ["shortcuts", "keys"],
  },
  { name: "help", description: "Help", category: "System" },
  { name: "plugin", description: "Plugin manager", category: "System", aliases: ["plugins"] },
  {
    name: "review",
    description: "Review loop dashboard",
    category: "Lobster",
    aliases: ["dashboard", "loop"],
  },
  {
    name: "findings",
    description: "Review findings",
    category: "Lobster",
    aliases: ["results", "issues"],
  },
  {
    name: "health",
    description: "Project health dashboard",
    category: "Lobster",
    aliases: ["project", "overview"],
  },
  {
    name: "patterns",
    description: "Pattern insights",
    category: "Lobster",
    aliases: ["insights", "trends"],
  },
  { name: "share", description: "Share this session", category: "Session", sessionOnly: true },
  { name: "rename", description: "Rename this session", category: "Session", sessionOnly: true },
  {
    name: "compact",
    description: "Summarize this session",
    category: "Session",
    aliases: ["summarize"],
    sessionOnly: true,
  },
  { name: "unshare", description: "Unshare this session", category: "Session", sessionOnly: true },
  { name: "undo", description: "Undo last user message", category: "Session", sessionOnly: true },
  { name: "redo", description: "Redo reverted messages", category: "Session", sessionOnly: true },
  { name: "copy", description: "Copy session transcript", category: "Session", sessionOnly: true },
  { name: "export", description: "Export session transcript", category: "Session", sessionOnly: true },
  {
    name: "timestamps",
    description: "Toggle message timestamps",
    category: "Session",
    aliases: ["toggle-timestamps"],
    sessionOnly: true,
  },
  {
    name: "thinking",
    description: "Toggle thinking visibility",
    category: "Session",
    aliases: ["toggle-thinking"],
    sessionOnly: true,
  },
  { name: "timeline", description: "Jump to message (legacy)", category: "Session", sessionOnly: true },
  { name: "fork", description: "Fork from message", category: "Session", sessionOnly: true },
  { name: "exit", description: "Exit the app", category: "System", aliases: ["quit", "q"] },
]

const COMMAND_BY_NAME = new Map(BUILT_IN_COMMANDS.map((x) => [x.name, x]))
const COMMAND_BY_ALIAS = new Map<string, BuiltInCommand>()
for (const cmd of BUILT_IN_COMMANDS) {
  COMMAND_BY_ALIAS.set(cmd.name, cmd)
  for (const alias of cmd.aliases ?? []) {
    COMMAND_BY_ALIAS.set(alias, cmd)
  }
}

export function resolveBuiltInCommand(name: string): BuiltInCommand | undefined {
  return COMMAND_BY_ALIAS.get(name.toLowerCase())
}

export function getBuiltInCommand(name: string): BuiltInCommand | undefined {
  return COMMAND_BY_NAME.get(name)
}

export function parseSlashCommand(input: string): { name: string; args: string } | null {
  const value = input.trim()
  if (!value.startsWith("/")) return null

  const body = value.slice(1).trim()
  if (!body) return null

  const index = body.search(/\s/)
  if (index < 0) {
    return { name: body.toLowerCase(), args: "" }
  }

  return {
    name: body.slice(0, index).toLowerCase(),
    args: body.slice(index + 1).trim(),
  }
}
