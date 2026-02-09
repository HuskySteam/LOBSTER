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

const plugin: Plugin = async (input) => {
  return {
    "experimental.chat.system.transform": async (_inp, output) => {
      const statePath = path.join(
        input.directory,
        ".lobster",
        "memory",
        "review-loop-state.json"
      )
      const findingsPath = path.join(
        input.directory,
        ".lobster",
        "memory",
        "review-findings.json"
      )
      validatePluginPath(input.directory, statePath)
      validatePluginPath(input.directory, findingsPath)

      const state = await Bun.file(statePath)
        .json()
        .catch(() => null)

      if (!state) {
        return
      }

      if (
        state.current_phase === "completed_pass" ||
        state.current_phase === "completed_max_iterations"
      ) {
        return
      }

      const lastVerdict = state.history && state.history.length > 0
        ? state.history.at(-1)
        : null

      const pendingIssues = lastVerdict && lastVerdict.verdict === "NEEDS_REVISION"
        ? lastVerdict.issues || []
        : []

      const block = [
        "<lobster-review-loop>",
        `Task: ${escapeXml(String(state.task ?? ""))}`,
        `Phase: ${escapeXml(String(state.current_phase ?? ""))}`,
        `Iteration: ${state.iteration} / ${state.max_iterations}`,
        `Started: ${escapeXml(String(state.started_at ?? ""))}`,
      ]

      if (lastVerdict) {
        block.push(`Last Verdict: ${lastVerdict.verdict}`)
      }

      if (pendingIssues.length > 0) {
        block.push("Pending Issues:")
        for (const issue of pendingIssues) {
          block.push(`  - ${issue}`)
        }
      }

      const allFindings: any[] = await Bun.file(findingsPath)
        .json()
        .catch(() => [])
      const openFindings = allFindings.filter((f: any) => f.status === "open")

      if (openFindings.length > 0) {
        const bySev: Record<string, number> = {}
        for (const f of openFindings) {
          bySev[f.severity] = (bySev[f.severity] || 0) + 1
        }
        block.push(`Open Findings: ${openFindings.length} (${Object.entries(bySev).map(([k, v]) => `${v} ${k}`).join(", ")})`)
      }

      block.push(
        "",
        "You are currently in an active LOBSTER review loop. Follow the review loop protocol to proceed to the next step.",
        "Use the `review_findings` tool to record structured findings during code review.",
        "</lobster-review-loop>"
      )

      output.system.push(block.join("\n"))
    },
  }
}

export default plugin
