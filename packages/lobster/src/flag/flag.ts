function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

export namespace Flag {
  export const LOBSTER_AUTO_SHARE = truthy("LOBSTER_AUTO_SHARE")
  export const LOBSTER_GIT_BASH_PATH = process.env["LOBSTER_GIT_BASH_PATH"]
  export const LOBSTER_CONFIG = process.env["LOBSTER_CONFIG"]
  export declare const LOBSTER_CONFIG_DIR: string | undefined
  export const LOBSTER_CONFIG_CONTENT = process.env["LOBSTER_CONFIG_CONTENT"]
  export const LOBSTER_DISABLE_AUTOUPDATE = truthy("LOBSTER_DISABLE_AUTOUPDATE")
  export const LOBSTER_DISABLE_PRUNE = truthy("LOBSTER_DISABLE_PRUNE")
  export const LOBSTER_DISABLE_TERMINAL_TITLE = truthy("LOBSTER_DISABLE_TERMINAL_TITLE")
  export const LOBSTER_PERMISSION = process.env["LOBSTER_PERMISSION"]
  export const LOBSTER_DISABLE_DEFAULT_PLUGINS = truthy("LOBSTER_DISABLE_DEFAULT_PLUGINS")
  export const LOBSTER_DISABLE_LSP_DOWNLOAD = truthy("LOBSTER_DISABLE_LSP_DOWNLOAD")
  export const LOBSTER_ENABLE_EXPERIMENTAL_MODELS = truthy("LOBSTER_ENABLE_EXPERIMENTAL_MODELS")
  export const LOBSTER_DISABLE_AUTOCOMPACT = truthy("LOBSTER_DISABLE_AUTOCOMPACT")
  export const LOBSTER_DISABLE_MODELS_FETCH = truthy("LOBSTER_DISABLE_MODELS_FETCH")
  export const LOBSTER_DISABLE_CLAUDE_CODE = truthy("LOBSTER_DISABLE_CLAUDE_CODE")
  export const LOBSTER_DISABLE_CLAUDE_CODE_PROMPT =
    LOBSTER_DISABLE_CLAUDE_CODE || truthy("LOBSTER_DISABLE_CLAUDE_CODE_PROMPT")
  export const LOBSTER_DISABLE_CLAUDE_CODE_SKILLS =
    LOBSTER_DISABLE_CLAUDE_CODE || truthy("LOBSTER_DISABLE_CLAUDE_CODE_SKILLS")
  export const LOBSTER_DISABLE_EXTERNAL_SKILLS =
    LOBSTER_DISABLE_CLAUDE_CODE_SKILLS || truthy("LOBSTER_DISABLE_EXTERNAL_SKILLS")
  export declare const LOBSTER_DISABLE_PROJECT_CONFIG: boolean
  export const LOBSTER_FAKE_VCS = process.env["LOBSTER_FAKE_VCS"]
  export declare const LOBSTER_CLIENT: string
  export const LOBSTER_SERVER_PASSWORD = process.env["LOBSTER_SERVER_PASSWORD"]
  export const LOBSTER_SERVER_USERNAME = process.env["LOBSTER_SERVER_USERNAME"]

  // Experimental
  export const LOBSTER_EXPERIMENTAL = truthy("LOBSTER_EXPERIMENTAL")
  export const LOBSTER_EXPERIMENTAL_FILEWATCHER = truthy("LOBSTER_EXPERIMENTAL_FILEWATCHER")
  export const LOBSTER_EXPERIMENTAL_DISABLE_FILEWATCHER = truthy("LOBSTER_EXPERIMENTAL_DISABLE_FILEWATCHER")
  export const LOBSTER_EXPERIMENTAL_ICON_DISCOVERY =
    LOBSTER_EXPERIMENTAL || truthy("LOBSTER_EXPERIMENTAL_ICON_DISCOVERY")
  export const LOBSTER_EXPERIMENTAL_DISABLE_COPY_ON_SELECT = truthy("LOBSTER_EXPERIMENTAL_DISABLE_COPY_ON_SELECT")
  export const LOBSTER_ENABLE_EXA =
    truthy("LOBSTER_ENABLE_EXA") || LOBSTER_EXPERIMENTAL || truthy("LOBSTER_EXPERIMENTAL_EXA")
  export const LOBSTER_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS = number("LOBSTER_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS")
  export const LOBSTER_EXPERIMENTAL_OUTPUT_TOKEN_MAX = number("LOBSTER_EXPERIMENTAL_OUTPUT_TOKEN_MAX")
  export const LOBSTER_EXPERIMENTAL_OXFMT = LOBSTER_EXPERIMENTAL || truthy("LOBSTER_EXPERIMENTAL_OXFMT")
  export const LOBSTER_EXPERIMENTAL_LSP_TY = truthy("LOBSTER_EXPERIMENTAL_LSP_TY")
  export const LOBSTER_EXPERIMENTAL_LSP_TOOL = LOBSTER_EXPERIMENTAL || truthy("LOBSTER_EXPERIMENTAL_LSP_TOOL")
  export const LOBSTER_DISABLE_FILETIME_CHECK = truthy("LOBSTER_DISABLE_FILETIME_CHECK")
  export const LOBSTER_EXPERIMENTAL_PLAN_MODE = LOBSTER_EXPERIMENTAL || truthy("LOBSTER_EXPERIMENTAL_PLAN_MODE")
  export const LOBSTER_EXPERIMENTAL_MARKDOWN = truthy("LOBSTER_EXPERIMENTAL_MARKDOWN")
  export const LOBSTER_EXPERIMENTAL_TEAMS = LOBSTER_EXPERIMENTAL || truthy("LOBSTER_EXPERIMENTAL_TEAMS")
  export const LOBSTER_EXPERIMENTAL_MEMORY = LOBSTER_EXPERIMENTAL || truthy("LOBSTER_EXPERIMENTAL_MEMORY")
  export const LOBSTER_MODELS_URL = process.env["LOBSTER_MODELS_URL"]
  export const LOBSTER_MODELS_PATH = process.env["LOBSTER_MODELS_PATH"]

  function number(key: string) {
    const value = process.env[key]
    if (!value) return undefined
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
  }
}

// Dynamic getter for LOBSTER_DISABLE_PROJECT_CONFIG
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "LOBSTER_DISABLE_PROJECT_CONFIG", {
  get() {
    return truthy("LOBSTER_DISABLE_PROJECT_CONFIG")
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for LOBSTER_CONFIG_DIR
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "LOBSTER_CONFIG_DIR", {
  get() {
    return process.env["LOBSTER_CONFIG_DIR"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for LOBSTER_CLIENT
// This must be evaluated at access time, not module load time,
// because some commands override the client at runtime
Object.defineProperty(Flag, "LOBSTER_CLIENT", {
  get() {
    return process.env["LOBSTER_CLIENT"] ?? "cli"
  },
  enumerable: true,
  configurable: false,
})
