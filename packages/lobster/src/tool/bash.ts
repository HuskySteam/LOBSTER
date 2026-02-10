import z from "zod"
import { spawn } from "child_process"
import { Tool } from "./tool"
import path from "path"
import DESCRIPTION from "./bash.txt"
import { Log } from "../util/log"
import { Instance } from "../project/instance"
import { lazy } from "@/util/lazy"
import { Language } from "web-tree-sitter"

import { Filesystem } from "@/util/filesystem"
import { fileURLToPath } from "url"
import { Flag } from "@/flag/flag.ts"
import { Shell } from "@/shell/shell"

import { BashArity } from "@/permission/arity"
import { Truncate } from "./truncation"
import { Plugin } from "@/plugin"

const MAX_METADATA_LENGTH = 30_000
const DEFAULT_TIMEOUT = Flag.LOBSTER_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS ?? 2 * 60 * 1000
const MAX_PROCESS_TREE_SIZE = 50
const WATCHDOG_INTERVAL_MS = 3000

export const log = Log.create({ service: "bash-tool" })

const ENV_BLOCKLIST_PATTERNS = [
  // Generic sensitive suffixes/patterns
  /KEY$/i,
  /TOKEN$/i,
  /SECRET$/i,
  /PASSWORD$/i,
  /CREDENTIAL$/i,
  /_AUTH$/i,
  /PRIVATE_KEY/i,
  /DATABASE_URL/i,
  /CONNECTION_STRING/i,
  /DSN$/i,
  /WEBHOOK/i,

  // Lobster-specific
  /^LOBSTER_SERVER_PASSWORD$/i,
  /^LOBSTER_SERVER_USERNAME$/i,

  // AI providers
  /^ANTHROPIC_/i,
  /^OPENAI_/i,

  // Cloud providers
  /^AWS_/i,
  /^AZURE_/i,
  /^GCP_/i,
  /^GOOGLE_/i,
  /^CLOUDFLARE_/i,
  /^DIGITALOCEAN_/i,
  /^LINODE_/i,

  // PaaS / hosting
  /^HEROKU_/i,
  /^NETLIFY_/i,
  /^VERCEL_/i,
  /^FIREBASE_/i,
  /^SUPABASE_/i,

  // Git / CI/CD
  /^GITHUB_TOKEN$/i,
  /^GITLAB_/i,
  /^CI_/i,

  // Package registries
  /NPM_TOKEN/i,
  /NPM_AUTH/i,
  /PYPI_TOKEN/i,

  // Security & code quality
  /^SNYK_/i,
  /^SONAR_/i,
  /^CODECOV_/i,
  /^COVERALLS_/i,

  // Secrets management
  /^DOPPLER_/i,
  /^VAULT_/i,

  // Communication / SaaS
  /^SLACK_/i,
  /^TWILIO_/i,
  /^SENDGRID_/i,
  /^STRIPE_/i,
]

const ENV_ALLOWLIST = new Set([
  "PATH",
  "HOME",
  "USER",
  "USERNAME",
  "SHELL",
  "TERM",
  "TERM_PROGRAM",
  "LANG",
  "LANGUAGE",
  "COLORTERM",
  "EDITOR",
  "VISUAL",
  "PAGER",
  "TMPDIR",
  "TMP",
  "TEMP",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "XDG_RUNTIME_DIR",
  "HOSTNAME",
  "LOGNAME",
  "DISPLAY",
  "WAYLAND_DISPLAY",
  "SSH_AUTH_SOCK",
  "GPG_TTY",
  "SHLVL",
  "PWD",
  "OLDPWD",
  "GOPATH",
  "GOROOT",
  "CARGO_HOME",
  "RUSTUP_HOME",
  "NVM_DIR",
  "NODE_PATH",
  "PYTHON",
  "VIRTUAL_ENV",
  "CONDA_PREFIX",
  "JAVA_HOME",
  "ANDROID_HOME",
  "DOTNET_ROOT",
])

export function filterEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue
    // Always allow explicitly allowlisted vars
    if (ENV_ALLOWLIST.has(key)) {
      result[key] = value
      continue
    }
    // Allow LC_* locale vars
    if (key.startsWith("LC_")) {
      result[key] = value
      continue
    }
    // Block if matches any blocklist pattern
    if (ENV_BLOCKLIST_PATTERNS.some((p) => p.test(key))) {
      continue
    }
    // Allow everything else that didn't match blocklist
    result[key] = value
  }
  return result
}

const resolveWasm = (asset: string) => {
  if (asset.startsWith("file://")) return fileURLToPath(asset)
  if (asset.startsWith("/") || /^[a-z]:/i.test(asset)) return asset
  const url = new URL(asset, import.meta.url)
  return fileURLToPath(url)
}

const parser = lazy(async () => {
  const { Parser } = await import("web-tree-sitter")
  const { default: treeWasm } = await import("web-tree-sitter/tree-sitter.wasm" as string, {
    with: { type: "wasm" },
  })
  const treePath = resolveWasm(treeWasm)
  await Parser.init({
    locateFile() {
      return treePath
    },
  })
  const { default: bashWasm } = await import("tree-sitter-bash/tree-sitter-bash.wasm" as string, {
    with: { type: "wasm" },
  })
  const bashPath = resolveWasm(bashWasm)
  const bashLanguage = await Language.load(bashPath)
  const p = new Parser()
  p.setLanguage(bashLanguage)
  return p
})

// TODO: we may wanna rename this tool so it works better on other shells
export const BashTool = Tool.define("bash", async () => {
  const shell = Shell.acceptable()
  log.info("bash tool using shell", { shell })

  return {
    description: DESCRIPTION.replaceAll("${directory}", Instance.directory)
      .replaceAll("${maxLines}", String(Truncate.MAX_LINES))
      .replaceAll("${maxBytes}", String(Truncate.MAX_BYTES)),
    parameters: z.object({
      command: z.string().describe("The command to execute"),
      timeout: z.number().describe("Optional timeout in milliseconds").optional(),
      workdir: z
        .string()
        .describe(
          `The working directory to run the command in. Defaults to ${Instance.directory}. Use this instead of 'cd' commands.`,
        )
        .optional(),
      description: z
        .string()
        .describe(
          "Clear, concise description of what this command does in 5-10 words. Examples:\nInput: ls\nOutput: Lists files in current directory\n\nInput: git status\nOutput: Shows working tree status\n\nInput: npm install\nOutput: Installs package dependencies\n\nInput: mkdir foo\nOutput: Creates directory 'foo'",
        ),
    }),
    async execute(params, ctx) {
      const cwd = params.workdir || Instance.directory
      if (params.timeout !== undefined && params.timeout < 0) {
        throw new Error(`Invalid timeout value: ${params.timeout}. Timeout must be a positive number.`)
      }
      const timeout = params.timeout ?? DEFAULT_TIMEOUT
      const tree = await parser().then((p) => p.parse(params.command))
      if (!tree) {
        throw new Error("Failed to parse command")
      }
      const directories = new Set<string>()
      if (!Instance.containsPath(cwd)) directories.add(cwd)
      const patterns = new Set<string>()
      const always = new Set<string>()

      for (const node of tree.rootNode.descendantsOfType("command")) {
        if (!node) continue

        // Get full command text including redirects if present
        let commandText = node.parent?.type === "redirected_statement" ? node.parent.text : node.text

        const command = []
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i)
          if (!child) continue
          if (
            child.type !== "command_name" &&
            child.type !== "word" &&
            child.type !== "string" &&
            child.type !== "raw_string" &&
            child.type !== "concatenation"
          ) {
            continue
          }
          command.push(child.text)
        }

        // not an exhaustive list, but covers most common cases
        if (["cd", "rm", "cp", "mv", "mkdir", "touch", "chmod", "chown", "cat", "ln", "rsync", "tar", "install", "dd", "unzip"].includes(command[0])) {
          for (const arg of command.slice(1)) {
            if (arg.startsWith("-") || (command[0] === "chmod" && arg.startsWith("+"))) continue
            const resolved = await import("fs/promises")
              .then((fs) => fs.realpath(path.resolve(cwd, arg)))
              .catch(() => "")
            log.info("resolved path", { arg, resolved })
            if (resolved) {
              // Git Bash on Windows returns Unix-style paths like /c/Users/...
              const normalized =
                process.platform === "win32" && resolved.match(/^\/[a-zA-Z]\//)
                  ? resolved.replace(/^\/([a-zA-Z])\//, (_, drive) => `${drive.toUpperCase()}:\\`).replace(/\//g, "\\")
                  : resolved
              if (!Instance.containsPath(normalized)) {
                const dir = (await Filesystem.isDir(normalized)) ? normalized : path.dirname(normalized)
                directories.add(dir)
              }
            }
          }
        }

        // cd covered by above check
        if (command.length && command[0] !== "cd") {
          patterns.add(commandText)
          always.add(BashArity.prefix(command).join(" ") + " *")
        }
      }

      if (directories.size > 0) {
        const globs = Array.from(directories).map((dir) => path.join(dir, "*"))
        await ctx.ask({
          permission: "external_directory",
          patterns: globs,
          always: globs,
          metadata: {},
        })
      }

      if (patterns.size > 0) {
        await ctx.ask({
          permission: "bash",
          patterns: Array.from(patterns),
          always: Array.from(always),
          metadata: {},
        })
      }

      const shellEnv = await Plugin.trigger("shell.env", { cwd }, { env: {} })
      const finalEnv = filterEnv({ ...process.env, ...shellEnv.env })
      const proc = spawn(params.command, {
        shell,
        cwd,
        env: finalEnv,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      })

      let output = ""

      // Initialize metadata with empty output
      ctx.metadata({
        metadata: {
          output: "",
          description: params.description,
        },
      })

      const append = (chunk: Buffer) => {
        output += chunk.toString()
        ctx.metadata({
          metadata: {
            // truncate the metadata to avoid GIANT blobs of data (has nothing to do w/ what agent can access)
            output: output.length > MAX_METADATA_LENGTH ? output.slice(0, MAX_METADATA_LENGTH) + "\n\n..." : output,
            description: params.description,
          },
        })
      }

      proc.stdout?.on("data", append)
      proc.stderr?.on("data", append)

      let timedOut = false
      let aborted = false
      let exited = false

      const kill = () => Shell.killTree(proc, { exited: () => exited })

      // Watchdog: periodically check process tree size to detect fork bombs
      let processLimitExceeded = false
      let watchdogStopped = false
      const runWatchdog = async () => {
        if (!proc.pid || exited || watchdogStopped) return
        const treeSize = await Shell.countProcessTree(proc.pid).catch(() => 0)
        if (exited || watchdogStopped) return
        if (treeSize > MAX_PROCESS_TREE_SIZE) {
          processLimitExceeded = true
          log.warn("process tree limit exceeded, killing", {
            pid: proc.pid,
            treeSize,
            limit: MAX_PROCESS_TREE_SIZE,
          })
          await kill()
          return
        }
        if (!exited && !watchdogStopped) watchdogTimer = setTimeout(runWatchdog, WATCHDOG_INTERVAL_MS)
      }
      let watchdogTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(runWatchdog, WATCHDOG_INTERVAL_MS)

      if (ctx.abort.aborted) {
        aborted = true
        await kill()
      }

      const abortHandler = () => {
        aborted = true
        void kill()
      }

      ctx.abort.addEventListener("abort", abortHandler, { once: true })

      // Add 100ms buffer so the spawned process has a chance to exit gracefully
      // on its own before we force-kill it (e.g. shells that set their own alarm).
      const timeoutTimer = setTimeout(() => {
        timedOut = true
        void kill()
      }, timeout + 100)

      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timeoutTimer)
          watchdogStopped = true
          clearTimeout(watchdogTimer)
          ctx.abort.removeEventListener("abort", abortHandler)
        }

        proc.once("exit", () => {
          exited = true
          cleanup()
          resolve()
        })

        proc.once("error", (error) => {
          exited = true
          cleanup()
          reject(error)
        })
      })

      const resultMetadata: string[] = []

      if (timedOut) {
        resultMetadata.push(`bash tool terminated command after exceeding timeout ${timeout} ms`)
      }

      if (aborted) {
        resultMetadata.push("User aborted the command")
      }

      if (processLimitExceeded) {
        resultMetadata.push(
          `Command terminated: spawned too many child processes (>${MAX_PROCESS_TREE_SIZE}). This appears to be a fork bomb or runaway process chain.`,
        )
      }

      if (resultMetadata.length > 0) {
        output += "\n\n<bash_metadata>\n" + resultMetadata.join("\n") + "\n</bash_metadata>"
      }

      return {
        title: params.description,
        metadata: {
          output: output.length > MAX_METADATA_LENGTH ? output.slice(0, MAX_METADATA_LENGTH) + "\n\n..." : output,
          exit: proc.exitCode,
          description: params.description,
        },
        output,
      }
    },
  }
})
