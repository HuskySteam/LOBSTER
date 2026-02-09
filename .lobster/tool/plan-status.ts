/// <reference path="../env.d.ts" />
import { tool } from "@lobster-ai/plugin"
import DESCRIPTION from "./plan-status.txt"
import path from "path"

interface PlanStep {
  id: number
  title: string
  description: string
  files: { path: string, action: string, description: string }[]
  depends_on: number[]
  complexity: string
  status: "pending" | "in_progress" | "completed" | "skipped"
}

interface PlanRisk {
  title: string
  severity: string
  description: string
  mitigation: string
}

interface ImplementationPlan {
  id: string
  task: string
  created_at: string
  updated_at: string
  status: "draft" | "in_progress" | "completed" | "abandoned"
  summary: string
  steps: PlanStep[]
  risks: PlanRisk[]
  estimated_complexity: string
  total_files_affected: number
}

function statusIcon(status: string): string {
  switch (status) {
    case "completed": return "[DONE]"
    case "in_progress": return "[WORK]"
    case "skipped": return "[SKIP]"
    default: return "[    ]"
  }
}

export default tool({
  description: DESCRIPTION,
  args: {
    plan_id: tool.schema.string().optional().describe("Plan ID to view (default: latest)"),
    update_step: tool.schema.number().optional().describe("Step ID to update"),
    step_status: tool.schema
      .enum(["pending", "in_progress", "completed", "skipped"])
      .optional()
      .describe("New status for the step"),
    plan_status: tool.schema
      .enum(["draft", "in_progress", "completed", "abandoned"])
      .optional()
      .describe("New status for the overall plan"),
  },
  async execute(args, context) {
    const plansDir = path.join(context.directory, ".lobster", "memory", "plans")

    // Resolve plan ID
    let planId = args.plan_id
    if (!planId) {
      const latestPath = path.join(plansDir, "latest.json")
      const latestFile = Bun.file(latestPath)
      const exists = await latestFile.exists()
      if (!exists) {
        return "No plans found. Use the `implementation_plan` tool to create one."
      }
      const latest = await latestFile.json().catch(() => null)
      if (!latest?.id) {
        return "Could not read latest plan pointer."
      }
      planId = latest.id
    }

    const planPath = path.join(plansDir, `${planId}.json`)
    const planFile = Bun.file(planPath)
    const planExists = await planFile.exists()

    if (!planExists) {
      return `Plan not found: ${planId}`
    }

    const plan: ImplementationPlan | null = await planFile.json().catch(() => null)
    if (!plan) {
      return `Plan file is corrupted: ${planId}`
    }

    // Apply updates
    let updated = false

    if (args.update_step !== undefined && args.step_status) {
      const step = plan.steps.find((s) => s.id === args.update_step)
      if (!step) {
        return `Step ${args.update_step} not found in plan ${planId}.`
      }
      step.status = args.step_status
      updated = true
    }

    if (args.plan_status) {
      plan.status = args.plan_status
      updated = true
    }

    if (updated) {
      plan.updated_at = new Date().toISOString()
      await Bun.write(planPath, JSON.stringify(plan, null, 2))
    }

    // Calculate progress
    const total = plan.steps.length
    const completed = plan.steps.filter((s) => s.status === "completed").length
    const inProgress = plan.steps.filter((s) => s.status === "in_progress").length
    const skipped = plan.steps.filter((s) => s.status === "skipped").length
    const pending = total - completed - inProgress - skipped

    const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0
    const barLen = 20
    const filledLen = Math.round((progressPct / 100) * barLen)
    const progressBar = "█".repeat(filledLen) + "░".repeat(barLen - filledLen)

    // Format output
    const lines: string[] = [
      `## Plan: ${plan.id}`,
      "",
      `**Task:** ${plan.task}`,
      `**Status:** ${plan.status}`,
      `**Complexity:** ${plan.estimated_complexity}`,
      `**Progress:** ${progressBar} ${progressPct}% (${completed}/${total} steps)`,
      "",
      "### Steps",
      "",
    ]

    for (const step of plan.steps) {
      const depsStr = step.depends_on.length > 0 ? ` (after: ${step.depends_on.join(", ")})` : ""
      lines.push(`${statusIcon(step.status)} **${step.id}. ${step.title}** [${step.complexity}]${depsStr}`)
      for (const f of step.files) {
        lines.push(`     - \`${f.path}\` (${f.action})`)
      }
    }

    lines.push("")
    lines.push("### Summary")
    lines.push(`- Completed: ${completed} | In Progress: ${inProgress} | Pending: ${pending} | Skipped: ${skipped}`)

    if (plan.risks.length > 0) {
      lines.push("")
      lines.push("### Active Risks")
      for (const risk of plan.risks) {
        lines.push(`- **${risk.title}** [${risk.severity}]: ${risk.description}`)
      }
    }

    if (updated) {
      lines.push("")
      lines.push(`*Plan updated at ${plan.updated_at}*`)
    }

    return lines.join("\n")
  },
})
