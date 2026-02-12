import { $ } from "bun"
import { Instance } from "../project/instance"
import { Log } from "../util/log"

export namespace GitSnapshot {
  const log = Log.create({ service: "git.snapshot" })

  interface Snapshot {
    branch: string
    dirty: boolean
    status: string[]
    recentCommits: string[]
  }

  const cache = Instance.state(async () => {
    if (Instance.project.vcs !== "git") return undefined
    const [branch, status, commits] = await Promise.all([
      $`git branch --show-current`
        .cwd(Instance.worktree)
        .quiet()
        .nothrow()
        .text()
        .then((x) => x.trim())
        .catch(() => "unknown"),
      $`git status --short`
        .cwd(Instance.worktree)
        .quiet()
        .nothrow()
        .text()
        .then((x) => x.trim())
        .catch(() => ""),
      $`git log --oneline -5`
        .cwd(Instance.worktree)
        .quiet()
        .nothrow()
        .text()
        .then((x) => x.trim())
        .catch(() => ""),
    ])
    const statusLines = status ? status.split("\n").filter(Boolean) : []
    const commitLines = commits ? commits.split("\n").filter(Boolean) : []
    log.info("snapshot", { branch, dirty: statusLines.length > 0, files: statusLines.length })
    return {
      branch,
      dirty: statusLines.length > 0,
      status: statusLines,
      recentCommits: commitLines,
    } satisfies Snapshot
  })

  export async function get() {
    return cache()
  }

  export function toReminder(snapshot: Snapshot): string {
    const lines = [
      `Git branch: ${snapshot.branch} (${snapshot.dirty ? "dirty" : "clean"})`,
    ]
    if (snapshot.status.length > 0) {
      lines.push(`Modified files: ${snapshot.status.length}`)
      lines.push(...snapshot.status.slice(0, 10).map((s) => `  ${s}`))
      if (snapshot.status.length > 10) lines.push(`  ... and ${snapshot.status.length - 10} more`)
    }
    if (snapshot.recentCommits.length > 0) {
      lines.push(`Recent commits:`)
      lines.push(...snapshot.recentCommits.map((c) => `  ${c}`))
    }
    return lines.join("\n")
  }
}
