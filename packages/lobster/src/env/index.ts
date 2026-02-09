import { Instance } from "../project/instance"

export namespace Env {
  const SENSITIVE_KEYS = new Set([
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "AZURE_API_KEY",
    "DATABASE_URL",
    "DB_PASSWORD",
    "NPM_TOKEN",
    "SLACK_TOKEN",
    "SLACK_BOT_TOKEN",
    "GOOGLE_API_KEY",
    "PRIVATE_KEY",
    "SECRET_KEY",
    "SSH_AUTH_SOCK",
  ])

  const state = Instance.state(() => {
    // Create a shallow copy to isolate environment per instance
    // Prevents parallel tests from interfering with each other's env vars
    return { ...process.env } as Record<string, string | undefined>
  })

  export function get(key: string) {
    const env = state()
    return env[key]
  }

  export function all() {
    const env = state()
    const filtered: Record<string, string | undefined> = {}
    for (const [key, value] of Object.entries(env)) {
      if (SENSITIVE_KEYS.has(key)) continue
      filtered[key] = value
    }
    return filtered
  }

  export function set(key: string, value: string) {
    const env = state()
    env[key] = value
  }

  export function remove(key: string) {
    const env = state()
    delete env[key]
  }
}
