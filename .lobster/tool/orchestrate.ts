/// <reference path="../env.d.ts" />
import { tool } from "@lobster-ai/plugin"
import description from "./orchestrate.txt"
import path from "path"

export default tool({
  description,
  args: {
    task: tool.schema.string().describe("Description of the code task to build"),
    max_iterations: tool.schema
      .number()
      .default(3)
      .describe("Maximum review loop iterations before forcing completion"),
    verdict: tool.schema.enum(["PASS", "NEEDS_REVISION"]).optional().describe("Verdict from the reviewer"),
    issues: tool.schema.array(tool.schema.string()).optional().describe("Issues found during review"),
  },
  async execute(args, context) {
    const memoryDir = path.join(context.directory, ".lobster", "memory")
    const statePath = path.join(memoryDir, "review-loop-state.json")

    const existing = await Bun.file(statePath)
      .json()
      .catch(() => null)

    const iteration = existing ? existing.iteration + 1 : 1
    const phase = existing ? "fixing" : "coding"

    if (existing && existing.iteration >= args.max_iterations) {
      const finalState = {
        ...existing,
        current_phase: "completed_max_iterations",
        completed_at: new Date().toISOString(),
      }
      await Bun.write(statePath, JSON.stringify(finalState, null, 2))
      return [
        "## Review Loop Complete (Max Iterations Reached)",
        "",
        `Reached maximum of ${args.max_iterations} iterations.`,
        `Last verdict: ${existing.history.at(-1)?.verdict || "unknown"}`,
        "",
        "### Remaining Issues",
        ...(existing.history.at(-1)?.issues || []).map(
          (i: string) => `- ${i}`
        ),
        "",
        "Proceed with the current code and note the unresolved issues.",
      ].join("\n")
    }

    if (existing && existing.history.at(-1)?.verdict === "PASS") {
      const finalState = {
        ...existing,
        current_phase: "completed_pass",
        completed_at: new Date().toISOString(),
      }
      await Bun.write(statePath, JSON.stringify(finalState, null, 2))
      return [
        "## Review Loop Complete (PASS)",
        "",
        `Code passed review after ${existing.iteration} iteration(s).`,
        "No further action needed.",
      ].join("\n")
    }

    const state = {
      task: args.task,
      max_iterations: args.max_iterations,
      current_phase: phase,
      iteration,
      started_at: existing ? existing.started_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
      history: existing ? existing.history : [],
    }

    if (args.verdict) {
      state.history.push({
        iteration: state.iteration,
        verdict: args.verdict,
        issues: args.issues || [],
        recorded_at: new Date().toISOString(),
      })
    }

    await Bun.write(statePath, JSON.stringify(state, null, 2))

    const previousIssues = existing
      ? existing.history
          .filter((h: { verdict: string }) => h.verdict === "NEEDS_REVISION")
          .flatMap((h: { issues: string[] }) => h.issues || [])
      : []

    const protocol = [
      "## LOBSTER Review Loop Protocol",
      "",
      `**Task:** ${args.task}`,
      `**Iteration:** ${iteration} / ${args.max_iterations}`,
      `**Phase:** ${phase}`,
      "",
      "### Step-by-step instructions",
      "",
      "**Step 1: Code Generation**",
      `Switch to the \`coder\` agent and ask it to: ${args.task}`,
    ]

    if (previousIssues.length > 0) {
      protocol.push(
        "",
        "Include these revision notes from prior review:",
        ...previousIssues.map((i: string) => `- ${i}`),
      )
    }

    protocol.push(
      "",
      "**Step 2: Code Review**",
      "Switch to the `reviewer` agent and ask it to review the code generated in Step 1.",
      "The reviewer MUST use the `review_findings` tool to record structured findings with severity levels.",
      "The reviewer MUST end with a verdict block: **PASS** or **NEEDS_REVISION** with issues.",
      "",
      "**Step 3: Parse Verdict**",
      "Read the reviewer's verdict:",
      "- If **PASS**: Call `review_loop` again to finalize the loop.",
      "- If **NEEDS_REVISION**: Continue to Step 4.",
      "",
      "**Step 4: Testing (on revision)**",
      "Switch to the `tester` agent and ask it to write and run tests for the generated code.",
      "The tester MUST end with a verdict block.",
      "",
      "**Step 5: Fix**",
      "Switch to the `coder` agent with all issues from reviewer and tester.",
      "Then call `review_loop` again with the same task to start the next iteration.",
      "",
      "### Verdict tracking",
      "After the reviewer responds, call `review_loop` again with the `verdict` parameter set to `PASS` or `NEEDS_REVISION`.",
      "If the verdict is `NEEDS_REVISION`, also pass the `issues` array with descriptions of each issue.",
      "The tool will automatically record the verdict in the loop state history.",
    )

    return protocol.join("\n")
  },
})
