import { Config } from "../config/config"
import { Instance } from "../project/instance"
import { Log } from "../util/log"
import fs from "fs/promises"
import path from "path"

export namespace Verification {
  const log = Log.create({ service: "tool.verification" })
  let cachedCommand: string | null | undefined = undefined

  export async function detectCommand(): Promise<string | null> {
    if (cachedCommand !== undefined) return cachedCommand

    const config = await Config.get()
    const verification = config.experimental?.verification

    // Explicit command string from config
    if (typeof verification === "string") {
      cachedCommand = verification
      log.info("using configured verification command", { command: verification })
      return cachedCommand
    }

    // Not enabled
    if (!verification) {
      cachedCommand = null
      return null
    }

    const root = Instance.worktree

    // Check package.json scripts
    const pkgPath = path.join(root, "package.json")
    const pkg = await fs.readFile(pkgPath, "utf-8").then(JSON.parse).catch(() => null)
    if (pkg?.scripts) {
      for (const name of ["typecheck", "tsc", "check"]) {
        if (pkg.scripts[name]) {
          cachedCommand = `npm run ${name}`
          log.info("detected verification command from package.json", { script: name, command: cachedCommand })
          return cachedCommand
        }
      }
    }

    // Fall back to tsc --noEmit if tsconfig.json exists
    const tsconfigPath = path.join(root, "tsconfig.json")
    const hasTsconfig = await fs.access(tsconfigPath).then(() => true).catch(() => false)
    if (hasTsconfig) {
      cachedCommand = "tsc --noEmit"
      log.info("falling back to tsc --noEmit")
      return cachedCommand
    }

    cachedCommand = null
    log.info("no TypeScript project detected, verification disabled")
    return null
  }

  export async function run(abort: AbortSignal): Promise<string | null> {
    const command = await detectCommand()
    if (!command) return null

    log.info("running verification", { command })
    const root = Instance.worktree

    try {
      const proc = Bun.spawn(["sh", "-c", command], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env },
      })

      const timeout = setTimeout(() => proc.kill(), 30_000)
      abort.addEventListener("abort", () => proc.kill(), { once: true })

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])
      clearTimeout(timeout)

      const exitCode = await proc.exited
      if (exitCode === 0) {
        log.info("verification passed")
        return null
      }

      const output = (stderr + "\n" + stdout).trim()
      log.info("verification found errors", { exitCode, outputLength: output.length })
      return output || null
    } catch (e: any) {
      log.warn("verification command failed", { error: e.message })
      return null
    }
  }
}
