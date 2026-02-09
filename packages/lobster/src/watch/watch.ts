import { createLobsterClient, type LobsterClient } from "@lobster-ai/sdk/v2"
import { Server } from "../server/server"
import { Provider } from "../provider/provider"
import { UI } from "../cli/ui"
import { ErrorDetect } from "./detect"
import { Log } from "../util/log"
import { PermissionNext } from "../permission/next"
import { EOL } from "os"

export namespace WatchMode {
  const log = Log.create({ service: "watch" })

  export interface Options {
    test?: boolean
    build?: boolean
    command?: string
    model?: string
  }

  interface FixRecord {
    file: string
    time: number
  }

  const RATE_LIMIT_MS = 30_000

  function resolveCommand(opts: Options): string {
    if (opts.command) return opts.command
    if (opts.test) return "bun test"
    if (opts.build) return "bun run build"
    return "bun test"
  }

  function modeLabel(opts: Options): string {
    if (opts.command) return "command"
    if (opts.test) return "test"
    if (opts.build) return "build"
    return "test"
  }

  export async function start(opts: Options) {
    const cmd = resolveCommand(opts)
    const mode = modeLabel(opts)

    UI.println(UI.Style.TEXT_HIGHLIGHT_BOLD + "~", UI.Style.TEXT_NORMAL + `Watch mode (${mode}): ${cmd}`)
    UI.println(UI.Style.TEXT_DIM + "  Monitoring for errors. Press Ctrl+C to stop." + UI.Style.TEXT_NORMAL)
    UI.empty()

    const recentFixes: FixRecord[] = []

    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      return Server.App().fetch(request)
    }) as typeof globalThis.fetch
    const sdk = createLobsterClient({ baseUrl: "http://lobster.internal", fetch: fetchFn })

    let running = true
    process.on("SIGINT", () => {
      running = false
      UI.println(EOL + UI.Style.TEXT_WARNING + "Watch mode stopped." + UI.Style.TEXT_NORMAL)
      process.exit(0)
    })

    while (running) {
      const result = await runCommand(cmd)

      if (result.exitCode === 0) {
        UI.println(UI.Style.TEXT_SUCCESS + "v" + UI.Style.TEXT_NORMAL, "Command passed. Watching...")
        await sleep(3000)
        continue
      }

      const errors = ErrorDetect.parse(result.output)
      if (errors.length === 0) {
        UI.println(
          UI.Style.TEXT_WARNING + "!" + UI.Style.TEXT_NORMAL,
          `Command failed (exit ${result.exitCode}) but no parseable errors found.`,
        )
        await sleep(5000)
        continue
      }

      // Rate limit: skip files fixed recently
      const now = Date.now()
      const actionableErrors = errors.filter((e) => {
        const recent = recentFixes.find((r) => r.file === e.file && now - r.time < RATE_LIMIT_MS)
        return !recent
      })

      if (actionableErrors.length === 0) {
        UI.println(
          UI.Style.TEXT_DIM + "  Rate limited. Waiting before retrying..." + UI.Style.TEXT_NORMAL,
        )
        await sleep(RATE_LIMIT_MS)
        continue
      }

      UI.println(
        UI.Style.TEXT_DANGER + "x" + UI.Style.TEXT_NORMAL,
        `${actionableErrors.length} error(s) detected. Attempting auto-fix...`,
      )
      UI.empty()

      for (const error of actionableErrors) {
        UI.println(
          UI.Style.TEXT_DIM + `  [${error.type}]` + UI.Style.TEXT_NORMAL,
          `${error.file}:${error.line} - ${error.message}`,
        )
      }
      UI.empty()

      const fixedFiles = new Set<string>()
      await attemptFix(sdk, actionableErrors, result.output, opts, fixedFiles)

      for (const file of fixedFiles) {
        recentFixes.push({ file, time: Date.now() })
      }

      // Clean up old rate limit entries
      const cutoff = Date.now() - RATE_LIMIT_MS * 2
      while (recentFixes.length > 0 && recentFixes[0].time < cutoff) {
        recentFixes.shift()
      }

      UI.println(UI.Style.TEXT_HIGHLIGHT + "~" + UI.Style.TEXT_NORMAL, "Re-running command to verify fix...")
      UI.empty()
    }
  }

  async function attemptFix(
    sdk: LobsterClient,
    errors: ErrorDetect.ErrorInfo[],
    fullOutput: string,
    opts: Options,
    fixedFiles: Set<string>,
  ) {
    const errorSummary = ErrorDetect.formatErrors(errors)
    const cmd = resolveCommand(opts)

    const prompt = [
      `The following command failed: \`${cmd}\``,
      "",
      "Errors detected:",
      errorSummary,
      "",
      "Full output:",
      "```",
      fullOutput.slice(-4000),
      "```",
      "",
      "Please fix these errors. Focus on the source code, not test expectations (unless the tests themselves are wrong).",
      "After fixing, briefly explain what you changed.",
    ].join("\n")

    const rules: PermissionNext.Ruleset = [
      { permission: "question", action: "deny", pattern: "*" },
      { permission: "plan_enter", action: "deny", pattern: "*" },
      { permission: "plan_exit", action: "deny", pattern: "*" },
      { permission: "bash", action: "allow", pattern: "*" },
      { permission: "read", action: "allow", pattern: "*" },
      { permission: "edit", action: "allow", pattern: "*" },
      { permission: "write", action: "allow", pattern: "*" },
      { permission: "glob", action: "allow", pattern: "*" },
      { permission: "grep", action: "allow", pattern: "*" },
      { permission: "list", action: "allow", pattern: "*" },
    ]

    const session = await sdk.session.create({
      title: `Watch auto-fix: ${new Date().toISOString()}`,
      permission: rules,
    })
    const sessionID = session.data?.id
    if (!sessionID) {
      UI.println(UI.Style.TEXT_DANGER + "!" + UI.Style.TEXT_NORMAL, "Failed to create fix session")
      return
    }

    const model = opts.model ? Provider.parseModel(opts.model) : undefined
    const events = await sdk.event.subscribe()

    const eventLoop = (async () => {
      for await (const event of events.stream) {
        if (
          event.type === "session.status" &&
          event.properties.sessionID === sessionID &&
          event.properties.status.type === "idle"
        ) {
          break
        }

        if (event.type === "message.part.updated") {
          const part = event.properties.part
          if (part.sessionID !== sessionID) continue

          if (part.type === "tool" && part.state.status === "completed") {
            if (part.tool === "edit" || part.tool === "write") {
              const input = part.state.input as Record<string, unknown>
              const filePath = (input?.filePath ?? input?.file_path ?? "") as string
              if (filePath) fixedFiles.add(filePath)
            }
          }

          if (part.type === "text" && part.time?.end) {
            const text = part.text.trim()
            if (text) {
              UI.println(UI.Style.TEXT_DIM + "  agent>" + UI.Style.TEXT_NORMAL, text.slice(0, 200))
            }
          }
        }

        if (event.type === "session.error" && event.properties.sessionID === sessionID) {
          const err = event.properties.error
          log.error("watch fix error", { error: err })
          UI.println(UI.Style.TEXT_DANGER + "!" + UI.Style.TEXT_NORMAL, `Fix error: ${err?.name ?? "unknown"}`)
          break
        }

        if (event.type === "permission.asked" && event.properties.sessionID === sessionID) {
          await sdk.permission.reply({
            requestID: event.properties.id,
            reply: "always",
          })
        }
      }
    })()

    await sdk.session.prompt({
      sessionID,
      model,
      parts: [{ type: "text", text: prompt }],
    })

    await eventLoop
    UI.println(
      UI.Style.TEXT_SUCCESS + "v" + UI.Style.TEXT_NORMAL,
      `Fix attempt complete. ${fixedFiles.size} file(s) modified.`,
    )
    UI.empty()
  }

  async function runCommand(cmd: string): Promise<{ exitCode: number; output: string }> {
    const shellArgs =
      process.platform === "win32"
        ? { cmd: "cmd.exe" as const, args: ["/c", cmd] }
        : { cmd: "sh" as const, args: ["-c", cmd] }

    const proc = Bun.spawn([shellArgs.cmd, ...shellArgs.args], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    })

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])

    const exitCode = await proc.exited
    const output = stdout + "\n" + stderr

    return { exitCode, output }
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
