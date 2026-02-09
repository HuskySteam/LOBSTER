import { Plugin } from "@lobster-ai/plugin"
import path from "path"

function validatePluginPath(basePath: string, filePath: string): void {
  const resolved = path.resolve(filePath)
  const allowed = path.resolve(basePath, ".lobster")
  if (!resolved.startsWith(allowed + path.sep) && resolved !== allowed) {
    throw new Error(`Plugin path validation failed: ${filePath} is outside .lobster directory`)
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

interface Subtask {
  id: number
  title: string
  assigned_to: string
  status: string
  depends_on: number[]
  priority: string
}

interface TeamSession {
  id: string
  task: string
  status: string
  subtasks: Subtask[]
  plan_id?: string
}

const plugin: Plugin = async (input) => {
  return {
    "experimental.chat.system.transform": async (_inp, output) => {
      const latestPath = path.join(
        input.directory,
        ".lobster",
        "memory",
        "team",
        "latest.json"
      )
      validatePluginPath(input.directory, latestPath)

      const latestFile = Bun.file(latestPath)
      const latestExists = await latestFile.exists()
      if (!latestExists) return

      const latest = await latestFile.json().catch(() => null)
      if (!latest?.id || !latest?.path) return

      const sessionPath = path.join(
        input.directory,
        ".lobster",
        "memory",
        "team",
        `${latest.id}.json`
      )
      validatePluginPath(input.directory, sessionPath)

      const sessionFile = Bun.file(sessionPath)
      const sessionExists = await sessionFile.exists()
      if (!sessionExists) return

      const session: TeamSession = await sessionFile.json().catch(() => null) as TeamSession
      if (!session) return

      // Only inject for active sessions
      if (session.status !== "active" && session.status !== "planning") return

      const total = session.subtasks.length
      const completed = session.subtasks.filter((s) => s.status === "completed").length
      const inProgress = session.subtasks.filter((s) => s.status === "in_progress").length

      // Find ready subtasks (all deps completed)
      const completedIds = new Set(
        session.subtasks.filter((s) => s.status === "completed").map((s) => s.id)
      )
      const ready = session.subtasks.filter((st) => {
        if (st.status === "completed" || st.status === "in_progress" || st.status === "failed") return false
        return st.depends_on.every((dep) => completedIds.has(dep))
      })

      const block: string[] = [
        "<lobster-team>",
        `  <session id="${escapeXml(session.id)}">`,
        `    <task>${escapeXml(session.task)}</task>`,
        `    <progress completed="${completed}" total="${total}" in_progress="${inProgress}"/>`,
      ]

      if (session.plan_id) {
        block.push(`    <plan-id>${escapeXml(session.plan_id)}</plan-id>`)
      }

      if (ready.length > 0) {
        block.push("    <ready-subtasks>")
        for (const st of ready) {
          block.push(`      <subtask id="${st.id}" agent="${escapeXml(st.assigned_to)}" priority="${escapeXml(st.priority)}">${escapeXml(st.title)}</subtask>`)
        }
        block.push("    </ready-subtasks>")
      }

      const working = session.subtasks.filter((s) => s.status === "in_progress")
      if (working.length > 0) {
        block.push("    <in-progress>")
        for (const st of working) {
          block.push(`      <subtask id="${st.id}" agent="${escapeXml(st.assigned_to)}">${escapeXml(st.title)}</subtask>`)
        }
        block.push("    </in-progress>")
      }

      block.push("  </session>")
      block.push("")
      block.push("An active team session exists. Use `team_status` to see full details. Use `team_complete` to mark subtasks done.")
      block.push("</lobster-team>")

      output.system.push(block.join("\n"))
    },
  }
}

export default plugin
