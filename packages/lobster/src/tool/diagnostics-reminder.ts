import path from "path"
import { LSP } from "../lsp"
import { Instance } from "../project/instance"

export namespace DiagnosticsReminder {
  export interface FormattedDiagnostic {
    file: string
    relativePath: string
    line: number
    severity: number
    message: string
  }

  export const EDIT_TOOLS = ["edit", "write", "multiedit", "apply_patch"] as const

  // Scan recent tool parts for edit/write tool completions
  export function hadRecentEdits(parts: Array<{ type: string; tool?: string; state?: { status: string } }>): boolean {
    return parts.some(
      (p) => p.type === "tool" && p.state?.status === "completed" && (EDIT_TOOLS as readonly string[]).includes(p.tool ?? ""),
    )
  }

  // Get formatted error diagnostics from LSP
  export async function getErrors(): Promise<FormattedDiagnostic[]> {
    const diags = await LSP.diagnostics().catch(() => ({}))
    const errors: FormattedDiagnostic[] = []
    for (const [file, fileDiags] of Object.entries(diags)) {
      for (const d of fileDiags) {
        if (d.severity === 1) {
          errors.push({
            file,
            relativePath: path.relative(Instance.worktree, file),
            line: d.range.start.line + 1,
            severity: d.severity,
            message: d.message,
          })
        }
      }
    }
    return errors
  }

  // Format diagnostics as a system reminder string
  export function format(errors: FormattedDiagnostic[], maxCount = 20): string {
    if (errors.length === 0) return ""
    const lines = errors.slice(0, maxCount).map((e) => `  ${e.relativePath}:${e.line}: ${e.message}`)
    const suffix = errors.length > maxCount ? `\n... and ${errors.length - maxCount} more` : ""
    return `<system-reminder>\nNew diagnostics detected after edits:\n${lines.join("\n")}${suffix}\n</system-reminder>`
  }
}
