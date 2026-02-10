import { Flag } from "@/flag/flag"
import { Log } from "@/util/log"
import { lazy } from "@/util/lazy"
import path from "path"
import { exec, spawn, type ChildProcess } from "child_process"

const log = Log.create({ service: "shell" })

const SIGKILL_TIMEOUT_MS = 200

export namespace Shell {
  export async function killTree(proc: ChildProcess, opts?: { exited?: () => boolean }): Promise<void> {
    const pid = proc.pid
    if (!pid || opts?.exited?.()) return

    if (process.platform === "win32") {
      await new Promise<void>((resolve) => {
        const killer = spawn("taskkill", ["/pid", String(pid), "/f", "/t"], { stdio: "ignore" })
        killer.once("exit", (code) => {
          if (code !== 0 && code !== null) {
            log.warn("taskkill exited with non-zero code", { pid, code })
          }
          resolve()
        })
        killer.once("error", () => resolve())
      })
      return
    }

    try {
      process.kill(-pid, "SIGTERM")
      await Bun.sleep(SIGKILL_TIMEOUT_MS)
      if (!opts?.exited?.()) {
        process.kill(-pid, "SIGKILL")
      }
    } catch (_e) {
      proc.kill("SIGTERM")
      await Bun.sleep(SIGKILL_TIMEOUT_MS)
      if (!opts?.exited?.()) {
        proc.kill("SIGKILL")
      }
    }
  }
  /**
   * Count the total number of descendant processes in a process tree.
   * Used by the bash tool watchdog to detect fork bombs.
   */
  export function countProcessTree(rootPid: number): Promise<number> {
    return new Promise((resolve) => {
      const parseAndCount = (stdout: string, isWmic: boolean) => {
        const lines = stdout.trim().split(/\r?\n/).filter(Boolean)
        const childrenMap = new Map<number, number[]>()
        for (const line of lines) {
          let pid: number
          let ppid: number
          if (isWmic) {
            const parts = line.split(",")
            if (parts.length < 3) continue
            ppid = parseInt(parts[1])
            pid = parseInt(parts[2])
          } else if (process.platform === "win32") {
            // PowerShell fallback: each line is "pid,ppid"
            const parts = line.split(",")
            if (parts.length < 2) continue
            pid = parseInt(parts[0])
            ppid = parseInt(parts[1])
          } else {
            const parts = line.trim().split(/\s+/)
            pid = parseInt(parts[0])
            ppid = parseInt(parts[1])
          }
          if (isNaN(pid) || isNaN(ppid)) continue
          if (!childrenMap.has(ppid)) childrenMap.set(ppid, [])
          childrenMap.get(ppid)!.push(pid)
        }
        // BFS to count all descendants
        let count = 0
        const queue = [rootPid]
        const visited = new Set<number>()
        while (queue.length > 0) {
          const current = queue.shift()!
          if (visited.has(current)) continue
          visited.add(current)
          const kids = childrenMap.get(current) ?? []
          count += kids.length
          queue.push(...kids)
          if (count > 200) break
        }
        resolve(count)
      }

      if (process.platform === "win32") {
        exec("wmic process get ProcessId,ParentProcessId /FORMAT:CSV", { timeout: 5000 }, (err, stdout) => {
          if (!err) return parseAndCount(stdout, true)
          // wmic not available (e.g. newer Windows 11), fall back to PowerShell
          const psCmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process | ForEach-Object { \\"$($_.ProcessId),$($_.ParentProcessId)\\" }"`
          exec(psCmd, { timeout: 10000 }, (psErr, psStdout) => {
            if (psErr) return resolve(0)
            parseAndCount(psStdout, false)
          })
        })
      } else {
        exec("ps -e -o pid=,ppid=", { timeout: 5000 }, (err, stdout) => {
          if (err) return resolve(0)
          parseAndCount(stdout, false)
        })
      }
    })
  }

  const BLACKLIST = new Set(["fish", "nu"])

  function fallback() {
    if (process.platform === "win32") {
      if (Flag.LOBSTER_GIT_BASH_PATH) return Flag.LOBSTER_GIT_BASH_PATH
      const git = Bun.which("git")
      if (git) {
        // git.exe is typically at: C:\Program Files\Git\cmd\git.exe
        // bash.exe is at: C:\Program Files\Git\bin\bash.exe
        try {
          const bash = path.join(git, "..", "..", "bin", "bash.exe")
          const stat = Bun.file(bash).size
          if (typeof stat === "number" && stat > 0) return bash
        } catch {
          // bash.exe not found, fall through
        }
      }
      return process.env.COMSPEC || "cmd.exe"
    }
    if (process.platform === "darwin") return "/bin/zsh"
    const bash = Bun.which("bash")
    if (bash) return bash
    return "/bin/sh"
  }

  export const preferred = lazy(() => {
    const s = process.env.SHELL
    if (s) return s
    return fallback()
  })

  export const acceptable = lazy(() => {
    const s = process.env.SHELL
    if (s && !BLACKLIST.has(process.platform === "win32" ? path.win32.basename(s).replace(/\.exe$/i, "") : path.basename(s))) return s
    return fallback()
  })
}
