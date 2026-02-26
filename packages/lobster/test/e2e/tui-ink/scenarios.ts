export type ScenarioMode = "all" | "critical" | "responsive"
export type ScenarioCategory = "critical" | "responsive"

export type ScenarioExpectation = {
  required?: string[]
  oneOf?: string[][]
  forbidden?: string[]
  softRequired?: string[]
}

export type ScenarioStep =
  | {
      kind: "keys"
      keys: string[]
      note?: string
    }
  | {
      kind: "text"
      text: string
      note?: string
    }
  | {
      kind: "wait"
      ms: number
      note?: string
    }
  | {
      kind: "capture"
      label: string
      expectation?: ScenarioExpectation
      note?: string
    }

export type ScenarioDefinition = {
  id: string
  title: string
  category: ScenarioCategory
  widths: number[]
  startupWaitMs?: number
  steps: ScenarioStep[]
  finalExpectation?: ScenarioExpectation
}

const DEFAULT_RESPONSIVE_WIDTHS = [80, 100, 120] as const

type DialogMatrixEntry = {
  command: string
  openExpectation: ScenarioExpectation
}

type HotkeyMatrixEntry = {
  id: string
  key: string
  leakedPrompt: string
  openExpectation: ScenarioExpectation
}

const DIALOG_CLOSED_EXPECTATION: ScenarioExpectation = {
  required: ["Start from the workspace command palette"],
  forbidden: ["esc close"],
  softRequired: ["Ctrl+K palette"],
}

const SLASH_DIALOG_MATRIX: DialogMatrixEntry[] = [
  {
    command: "connect",
    openExpectation: {
      required: ["Connect a provider", "Search providers", "esc close"],
    },
  },
  {
    command: "model",
    openExpectation: {
      required: ["Select model", "esc close"],
    },
  },
  {
    command: "agent",
    openExpectation: {
      required: ["Select agent", "esc close"],
    },
  },
  {
    command: "sessions",
    openExpectation: {
      required: ["Sessions", "esc close"],
    },
  },
  {
    command: "status",
    openExpectation: {
      required: ["System Status", "MCP Servers", "esc close"],
    },
  },
  {
    command: "keybinds",
    openExpectation: {
      required: ["Keyboard Shortcuts", "enter/esc close", "esc close"],
    },
  },
  {
    command: "help",
    openExpectation: {
      required: ["Keyboard Shortcuts", "enter/esc close"],
    },
  },
  {
    command: "plugin",
    openExpectation: {
      required: ["Plugin Manager", "Installed", "Marketplace", "esc close"],
    },
  },
  {
    command: "mcp",
    openExpectation: {
      required: ["MCP Servers", "esc close"],
    },
  },
  {
    command: "theme",
    openExpectation: {
      required: ["Theme", "Search themes", "esc close"],
    },
  },
  {
    command: "review",
    openExpectation: {
      required: ["Review Loop Dashboard", "esc close"],
    },
  },
  {
    command: "findings",
    openExpectation: {
      required: ["Review Results", "esc close"],
    },
  },
  {
    command: "health",
    openExpectation: {
      required: ["Project Health Dashboard", "Quality Score", "esc close"],
    },
  },
  {
    command: "patterns",
    openExpectation: {
      required: ["Pattern Insights", "esc close"],
    },
  },
]

const HOTKEY_DIALOG_MATRIX: HotkeyMatrixEntry[] = [
  {
    id: "connect",
    key: "C-o",
    leakedPrompt: "> o",
    openExpectation: {
      required: ["Connect a provider", "Search providers", "esc close"],
    },
  },
  {
    id: "agent",
    key: "C-a",
    leakedPrompt: "> a",
    openExpectation: {
      required: ["Select agent", "esc close"],
    },
  },
  {
    id: "commands",
    key: "C-k",
    leakedPrompt: "> k",
    openExpectation: {
      required: ["Commands", "Search commands", "esc close"],
      softRequired: ["/connect", "/model", "/agent"],
    },
  },
]

function cloneExpectation(expectation: ScenarioExpectation): ScenarioExpectation {
  return {
    required: expectation.required ? [...expectation.required] : undefined,
    oneOf: expectation.oneOf ? expectation.oneOf.map((group) => [...group]) : undefined,
    forbidden: expectation.forbidden ? [...expectation.forbidden] : undefined,
    softRequired: expectation.softRequired ? [...expectation.softRequired] : undefined,
  }
}

function withForbidden(expectation: ScenarioExpectation, extra: string[]): ScenarioExpectation {
  const next = cloneExpectation(expectation)
  next.forbidden = [...(next.forbidden ?? []), ...extra]
  return next
}

function closeExpectationWithPromptLeak(leakedPrompt: string): ScenarioExpectation {
  return withForbidden(DIALOG_CLOSED_EXPECTATION, [leakedPrompt])
}

function buildSlashDialogMatrixSteps(entries: DialogMatrixEntry[]): ScenarioStep[] {
  return entries.flatMap((entry) => {
    const leakedPrompt = `> /${entry.command}`
    const steps: ScenarioStep[] = [
      { kind: "text", text: `/${entry.command}`, note: `Run /${entry.command}` },
      { kind: "keys", keys: ["Enter"] },
      { kind: "wait", ms: 700 },
      {
        kind: "capture",
        label: `${entry.command}.open`,
        expectation: withForbidden(entry.openExpectation, [leakedPrompt]),
      },
      { kind: "keys", keys: ["Escape"], note: `Close /${entry.command} dialog` },
      { kind: "wait", ms: 350 },
      {
        kind: "capture",
        label: `${entry.command}.closed`,
        expectation: closeExpectationWithPromptLeak(leakedPrompt),
      },
      { kind: "wait", ms: 150 },
    ]
    return steps
  })
}

function buildHotkeyDialogMatrixSteps(entries: HotkeyMatrixEntry[]): ScenarioStep[] {
  return entries.flatMap((entry) => {
    const steps: ScenarioStep[] = [
      { kind: "keys", keys: [entry.key], note: `Open dialog via ${entry.key}` },
      { kind: "wait", ms: 700 },
      {
        kind: "capture",
        label: `${entry.id}.open`,
        expectation: withForbidden(entry.openExpectation, [entry.leakedPrompt]),
      },
      { kind: "keys", keys: ["Escape"], note: `Close dialog opened by ${entry.key}` },
      { kind: "wait", ms: 350 },
      {
        kind: "capture",
        label: `${entry.id}.closed`,
        expectation: closeExpectationWithPromptLeak(entry.leakedPrompt),
      },
      { kind: "wait", ms: 150 },
    ]
    return steps
  })
}

const SCENARIOS: ScenarioDefinition[] = [
  {
    id: "home-idle-critical",
    title: "Home screen renders baseline layout",
    category: "critical",
    widths: [100],
    startupWaitMs: 45_000,
    steps: [],
    finalExpectation: {
      required: ["LOBSTER v", "What can I help you with?", "Start from the workspace command palette"],
      softRequired: ["Welcome! Try /connect", "Ctrl+K palette"],
    },
  },
  {
    id: "palette-open-critical",
    title: "Command palette opens via hotkey",
    category: "critical",
    widths: [100],
    startupWaitMs: 45_000,
    steps: [
      { kind: "keys", keys: ["C-k"], note: "Open command palette with hotkey" },
      { kind: "wait", ms: 700 },
      {
        kind: "capture",
        label: "open",
        expectation: {
          required: ["Commands", "Search commands", "esc close"],
          forbidden: ["> k"],
          softRequired: ["/connect", "/model", "/agent"],
        },
      },
    ],
  },
  {
    id: "palette-close-critical",
    title: "Command palette closes cleanly without visual residue",
    category: "critical",
    widths: [100],
    startupWaitMs: 45_000,
    steps: [
      { kind: "keys", keys: ["C-k"] },
      { kind: "wait", ms: 700 },
      { kind: "keys", keys: ["Escape"], note: "Close palette" },
      { kind: "wait", ms: 300 },
      {
        kind: "capture",
        label: "closed",
        expectation: {
          required: ["Start from the workspace command palette"],
          forbidden: ["Commands", "Search commands", "esc close", "> k"],
        },
      },
    ],
  },
  {
    id: "prompt-trigger-backspace-critical",
    title: "Prompt clears slash and mention triggers immediately on backspace",
    category: "critical",
    widths: [100],
    startupWaitMs: 45_000,
    steps: [
      { kind: "text", text: "/", note: "Open slash autocomplete" },
      { kind: "wait", ms: 250 },
      {
        kind: "capture",
        label: "slash-open",
        expectation: {
          required: ["enter/tab select"],
          forbidden: ["Ctrl+K palette"],
        },
      },
      { kind: "keys", keys: ["BSpace"], note: "Delete slash trigger" },
      { kind: "wait", ms: 450 },
      {
        kind: "capture",
        label: "slash-cleared",
        expectation: {
          required: ["Start from the workspace command palette", "Ctrl+K palette"],
          forbidden: ["> /", "enter/tab select"],
        },
      },
      { kind: "text", text: "@", note: "Open mention autocomplete" },
      { kind: "wait", ms: 250 },
      {
        kind: "capture",
        label: "mention-open",
        expectation: {
          required: ["enter/tab select"],
          forbidden: ["Ctrl+K palette"],
        },
      },
      { kind: "keys", keys: ["BSpace"], note: "Delete mention trigger" },
      { kind: "wait", ms: 450 },
      {
        kind: "capture",
        label: "mention-cleared",
        expectation: {
          required: ["Start from the workspace command palette", "Ctrl+K palette"],
          forbidden: ["> @", "enter/tab select"],
        },
      },
    ],
  },
  {
    id: "command-search-session-critical",
    title: "Command search filters session-related entries",
    category: "critical",
    widths: [100],
    startupWaitMs: 45_000,
    steps: [
      { kind: "keys", keys: ["C-k"] },
      { kind: "wait", ms: 600 },
      { kind: "text", text: "session", note: "Type query in command search input" },
      { kind: "wait", ms: 450 },
      {
        kind: "capture",
        label: "search",
        expectation: {
          required: ["Commands", "session"],
          oneOf: [["/sessions", "Browse sessions"]],
          forbidden: ["> k"],
        },
      },
    ],
  },
  {
    id: "session-list-empty-keybind-critical",
    title: "Session list keybinds do not leak text when list is empty",
    category: "critical",
    widths: [100],
    startupWaitMs: 45_000,
    steps: [
      { kind: "text", text: "/sessions", note: "Open sessions dialog" },
      { kind: "keys", keys: ["Enter"] },
      { kind: "wait", ms: 700 },
      {
        kind: "capture",
        label: "open",
        expectation: {
          required: ["Sessions", "No results found", "delete ctrl+d", "rename ctrl+r"],
        },
      },
      { kind: "keys", keys: ["C-d"], note: "Delete hotkey with empty options" },
      { kind: "wait", ms: 300 },
      {
        kind: "capture",
        label: "after-delete-hotkey",
        expectation: {
          required: ["Sessions", "No results found"],
          forbidden: ["> d"],
        },
      },
      { kind: "keys", keys: ["C-r"], note: "Rename hotkey with empty options" },
      { kind: "wait", ms: 300 },
      {
        kind: "capture",
        label: "after-rename-hotkey",
        expectation: {
          required: ["Sessions", "No results found"],
          forbidden: ["> d", "> r", "> dr"],
        },
      },
      { kind: "keys", keys: ["Escape"] },
      { kind: "wait", ms: 300 },
      {
        kind: "capture",
        label: "closed",
        expectation: {
          required: ["Start from the workspace command palette"],
          forbidden: ["Sessions", "No results found", "> d", "> r", "> dr"],
        },
      },
    ],
  },
  {
    id: "dialog-matrix-slash-critical",
    title: "All slash-command dialogs open and close cleanly",
    category: "critical",
    widths: [100],
    startupWaitMs: 45_000,
    steps: buildSlashDialogMatrixSteps(SLASH_DIALOG_MATRIX),
  },
  {
    id: "dialog-matrix-hotkey-critical",
    title: "Hotkey dialogs open without leaking keypress into prompt",
    category: "critical",
    widths: [100],
    startupWaitMs: 45_000,
    steps: buildHotkeyDialogMatrixSteps(HOTKEY_DIALOG_MATRIX),
  },
  {
    id: "plugin-marketplace-critical",
    title: "Plugin marketplace opens and closes cleanly from slash command",
    category: "critical",
    widths: [100],
    startupWaitMs: 45_000,
    steps: [
      { kind: "text", text: "/plugin marketplace", note: "Open marketplace tab directly" },
      { kind: "keys", keys: ["Enter"] },
      { kind: "wait", ms: 700 },
      {
        kind: "capture",
        label: "open",
        expectation: {
          required: ["Marketplace", "Filter marketplace", "esc close"],
          oneOf: [["Plugin Manager", "[MARKETPLACE]"]],
          forbidden: ["> /plugin marketplace"],
        },
      },
      { kind: "keys", keys: ["Escape"], note: "Close plugin manager" },
      { kind: "wait", ms: 300 },
      {
        kind: "capture",
        label: "closed",
        expectation: {
          required: ["Start from the workspace command palette"],
          forbidden: ["Plugin Manager", "esc close", "> /plugin marketplace"],
        },
      },
    ],
  },
  {
    id: "home-idle-responsive",
    title: "Home screen remains readable across widths",
    category: "responsive",
    widths: [...DEFAULT_RESPONSIVE_WIDTHS],
    startupWaitMs: 45_000,
    steps: [],
    finalExpectation: {
      required: ["LOBSTER v", "What can I help you with?"],
      softRequired: ["Welcome! Try /connect", "Ctrl+K palette"],
    },
  },
  {
    id: "palette-open-responsive",
    title: "Command palette layout remains stable across widths",
    category: "responsive",
    widths: [...DEFAULT_RESPONSIVE_WIDTHS],
    startupWaitMs: 45_000,
    steps: [
      { kind: "keys", keys: ["C-k"] },
      { kind: "wait", ms: 700 },
      {
        kind: "capture",
        label: "open",
        expectation: {
          required: ["Commands", "Search commands", "esc close"],
          forbidden: ["> k"],
          softRequired: ["/connect", "/model", "/agent"],
        },
      },
    ],
  },
]

export function getScenarios(mode: ScenarioMode) {
  if (mode === "all") return [...SCENARIOS]
  return SCENARIOS.filter((scenario) => scenario.category === mode)
}

export function listScenarioIDs() {
  return SCENARIOS.map((scenario) => scenario.id)
}
