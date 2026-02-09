import path from "path"
import fs from "fs/promises"
import { UI } from "../cli/ui"
import { EOL } from "os"

interface ProjectDetection {
  type: string
  file: string
}

const PROJECT_MARKERS: ProjectDetection[] = [
  { type: "Node.js", file: "package.json" },
  { type: "Rust", file: "Cargo.toml" },
  { type: "Go", file: "go.mod" },
  { type: "Python", file: "pyproject.toml" },
  { type: "Python", file: "setup.py" },
  { type: "Java", file: "pom.xml" },
  { type: "Java", file: "build.gradle" },
  { type: "C#/.NET", file: "*.csproj" },
  { type: "Ruby", file: "Gemfile" },
  { type: "PHP", file: "composer.json" },
  { type: "Swift", file: "Package.swift" },
  { type: "Elixir", file: "mix.exs" },
  { type: "Dart/Flutter", file: "pubspec.yaml" },
]

const PROVIDER_ENV_VARS: Record<string, string> = {
  ANTHROPIC_API_KEY: "anthropic",
  OPENAI_API_KEY: "openai",
  GOOGLE_API_KEY: "google",
  GOOGLE_GENERATIVE_AI_API_KEY: "google",
  MISTRAL_API_KEY: "mistral",
  GROQ_API_KEY: "groq",
  TOGETHER_API_KEY: "together",
  FIREWORKS_API_KEY: "fireworks",
  DEEPSEEK_API_KEY: "deepseek",
  XAI_API_KEY: "xai",
  COHERE_API_KEY: "cohere",
  PERPLEXITY_API_KEY: "perplexity",
}

async function detectProjectType(directory: string): Promise<string[]> {
  const detected: string[] = []
  for (const marker of PROJECT_MARKERS) {
    if (marker.file.includes("*")) {
      const dir = await fs.readdir(directory).catch(() => [])
      const ext = marker.file.replace("*", "")
      if (dir.some((f) => f.endsWith(ext))) {
        detected.push(marker.type)
      }
    } else {
      const exists = await Bun.file(path.join(directory, marker.file)).exists()
      if (exists) {
        detected.push(marker.type)
      }
    }
  }
  return [...new Set(detected)]
}

function detectProviders(): Record<string, string> {
  const providers: Record<string, string> = {}
  for (const [envVar, providerName] of Object.entries(PROVIDER_ENV_VARS)) {
    if (process.env[envVar]) {
      providers[providerName] = envVar
    }
  }
  return providers
}

function generateConfig(providers: Record<string, string>): Record<string, unknown> {
  const config: Record<string, unknown> = {
    $schema: "https://opencode.ai/config.json",
  }

  const providerNames = Object.keys(providers)
  if (providerNames.includes("anthropic")) {
    config.model = "anthropic/claude-sonnet-4-20250514"
    config.small_model = "anthropic/claude-haiku-4-20250414"
  } else if (providerNames.includes("openai")) {
    config.model = "openai/gpt-4o"
    config.small_model = "openai/gpt-4o-mini"
  } else if (providerNames.includes("google")) {
    config.model = "google/gemini-2.5-pro"
    config.small_model = "google/gemini-2.0-flash"
  } else if (providerNames.length > 0) {
    config.model = `${providerNames[0]}/default`
  }

  config.plugin = [] as string[]

  return config
}

export async function init(directory: string) {
  const configPath = path.join(directory, "lobster.json")
  const configPathC = path.join(directory, "lobster.jsonc")
  const lobsterDir = path.join(directory, ".lobster")

  const existingConfig =
    (await Bun.file(configPath).exists()) || (await Bun.file(configPathC).exists())
  if (existingConfig) {
    UI.println(
      UI.Style.TEXT_WARNING + "Configuration already exists. Skipping config generation." + UI.Style.TEXT_NORMAL,
    )
    UI.println(UI.Style.TEXT_DIM + "Delete lobster.json to re-initialize." + UI.Style.TEXT_NORMAL)
    return
  }

  // Detect project type
  const projectTypes = await detectProjectType(directory)

  // Detect providers
  const providers = detectProviders()

  // Generate config
  const config = generateConfig(providers)

  // Create .lobster directory structure
  await fs.mkdir(path.join(lobsterDir, "reports"), { recursive: true })
  await fs.mkdir(path.join(lobsterDir, "agent"), { recursive: true })
  await fs.mkdir(path.join(lobsterDir, "tool"), { recursive: true })
  await fs.mkdir(path.join(lobsterDir, "command"), { recursive: true })

  // Write config
  await Bun.write(configPath, JSON.stringify(config, null, 2) + EOL)

  // Print welcome message
  UI.empty()
  UI.println(UI.Style.TEXT_HIGHLIGHT_BOLD + "Welcome to Lobster!" + UI.Style.TEXT_NORMAL)
  UI.empty()

  if (projectTypes.length > 0) {
    UI.println(
      UI.Style.TEXT_SUCCESS + "Detected project type: " + UI.Style.TEXT_NORMAL + projectTypes.join(", "),
    )
  } else {
    UI.println(UI.Style.TEXT_DIM + "No specific project type detected." + UI.Style.TEXT_NORMAL)
  }

  const providerNames = Object.keys(providers)
  if (providerNames.length > 0) {
    UI.println(
      UI.Style.TEXT_SUCCESS +
        "Detected LLM providers: " +
        UI.Style.TEXT_NORMAL +
        providerNames.join(", "),
    )
  } else {
    UI.println(
      UI.Style.TEXT_WARNING +
        "No LLM providers detected. Set an API key env var (e.g. ANTHROPIC_API_KEY)." +
        UI.Style.TEXT_NORMAL,
    )
  }

  UI.empty()
  UI.println(UI.Style.TEXT_NORMAL_BOLD + "Created:" + UI.Style.TEXT_NORMAL)
  UI.println("  lobster.json         - configuration file")
  UI.println("  .lobster/            - project directory")
  UI.println("  .lobster/agent/      - custom agent definitions")
  UI.println("  .lobster/tool/       - custom tool definitions")
  UI.println("  .lobster/command/    - custom commands")
  UI.println("  .lobster/reports/    - exported reports")
  UI.empty()
  UI.println(UI.Style.TEXT_NORMAL_BOLD + "Next steps:" + UI.Style.TEXT_NORMAL)
  UI.println("  lobster              - start interactive session")
  UI.println("  lobster run          - run a one-shot task")
  UI.println("  lobster plugin search <query> - find plugins")
  UI.empty()
}
