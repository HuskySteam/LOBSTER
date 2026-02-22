import { spawn } from "node:child_process"
import { type Config } from "./gen/types.gen.js"

export type ServerOptions = {
  hostname?: string
  port?: number
  signal?: AbortSignal
  timeout?: number
  config?: Config
}

export type TuiOptions = {
  project?: string
  model?: string
  session?: string
  agent?: string
  signal?: AbortSignal
  config?: Config
}

const STARTUP_OUTPUT_LIMIT = 64 * 1024

export async function createLobsterServer(options?: ServerOptions) {
  options = Object.assign(
    {
      hostname: "127.0.0.1",
      port: 4096,
      timeout: 5000,
    },
    options ?? {},
  )

  const args = [`serve`, `--hostname=${options.hostname}`, `--port=${options.port}`]
  if (options.config?.logLevel) args.push(`--log-level=${options.config.logLevel}`)

  const proc = spawn(`lobster`, args, {
    signal: options.signal,
    env: {
      ...process.env,
      LOBSTER_CONFIG_CONTENT: JSON.stringify(options.config ?? {}),
    },
  })

  const url = await new Promise<string>((resolve, reject) => {
    const timeoutMs = options.timeout ?? 5000
    let settled = false
    let output = ""
    let lineBuffer = ""

    const appendOutput = (chunk: string) => {
      output += chunk
      if (output.length > STARTUP_OUTPUT_LIMIT) {
        output = output.slice(-STARTUP_OUTPUT_LIMIT)
      }
    }

    const terminate = () => {
      if (proc.killed || (proc.exitCode !== null && proc.exitCode !== undefined)) return
      proc.kill()
    }

    const onStdoutData = (chunk: Buffer | string) => {
      if (settled) return
      const text = chunk.toString()
      appendOutput(text)
      lineBuffer += text

      const lines = lineBuffer.split(/\r?\n/)
      lineBuffer = lines.pop() ?? ""

      for (const raw of lines) {
        const line = raw.trim()
        if (!line.startsWith("lobster server listening")) continue

        const match = line.match(/on\s+(https?:\/\/[^\s]+)/)
        if (!match) {
          fail(new Error(`Failed to parse server url from output: ${line}`), true)
          return
        }

        succeed(match[1]!)
        return
      }
    }

    const onStderrData = (chunk: Buffer | string) => {
      if (settled) return
      appendOutput(chunk.toString())
    }

    const onExit = (code: number | null) => {
      if (settled) return
      let msg = `Server exited with code ${code}`
      if (output.trim()) {
        msg += `\nServer output: ${output}`
      }
      fail(new Error(msg))
    }

    const onError = (error: Error) => {
      if (settled) return
      fail(error, true)
    }

    const onAbort = () => {
      if (settled) return
      fail(new Error("Aborted"), true)
    }

    const timeoutId = setTimeout(() => {
      fail(new Error(`Timeout waiting for server to start after ${timeoutMs}ms`), true)
    }, timeoutMs)

    const cleanup = () => {
      clearTimeout(timeoutId)
      proc.stdout?.off("data", onStdoutData)
      proc.stderr?.off("data", onStderrData)
      proc.off("exit", onExit)
      proc.off("error", onError)
      options.signal?.removeEventListener("abort", onAbort)
    }

    const succeed = (nextUrl: string) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(nextUrl)
    }

    const fail = (error: Error, killProcess = false) => {
      if (settled) return
      settled = true
      cleanup()
      if (killProcess) terminate()
      reject(error)
    }

    proc.stdout?.on("data", onStdoutData)
    proc.stderr?.on("data", onStderrData)
    proc.on("exit", onExit)
    proc.on("error", onError)
    options.signal?.addEventListener("abort", onAbort, { once: true })

    if (options.signal?.aborted) {
      onAbort()
    }
  })

  return {
    url,
    close() {
      proc.kill()
    },
  }
}

export function createLobsterTui(options?: TuiOptions) {
  const args = []

  if (options?.project) {
    args.push(`--project=${options.project}`)
  }
  if (options?.model) {
    args.push(`--model=${options.model}`)
  }
  if (options?.session) {
    args.push(`--session=${options.session}`)
  }
  if (options?.agent) {
    args.push(`--agent=${options.agent}`)
  }

  const proc = spawn(`lobster`, args, {
    signal: options?.signal,
    stdio: "inherit",
    env: {
      ...process.env,
      LOBSTER_CONFIG_CONTENT: JSON.stringify(options?.config ?? {}),
    },
  })

  return {
    close() {
      proc.kill()
    },
  }
}
