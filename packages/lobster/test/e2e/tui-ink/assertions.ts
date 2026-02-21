import type { ScenarioExpectation } from "./scenarios"

const ANSI_ESCAPE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g

export type AssertionIssue = {
  severity: "error" | "warning"
  message: string
}

export type AssertionResult = {
  errors: AssertionIssue[]
  warnings: AssertionIssue[]
}

export function normalizeCapture(input: string) {
  const withoutAnsi = input.replace(ANSI_ESCAPE, "")
  const normalizedNewline = withoutAnsi.replace(/\r\n?/g, "\n")
  const trimmedLines = normalizedNewline
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return trimmedLines.length > 0 ? trimmedLines + "\n" : ""
}

export function assertCapture(normalizedCapture: string, expectation: ScenarioExpectation): AssertionResult {
  const errors: AssertionIssue[] = []
  const warnings: AssertionIssue[] = []

  for (const requiredNeedle of expectation.required ?? []) {
    if (!normalizedCapture.includes(requiredNeedle)) {
      errors.push({
        severity: "error",
        message: `Missing required text: "${requiredNeedle}"`,
      })
    }
  }

  for (const group of expectation.oneOf ?? []) {
    const matched = group.some((candidate) => normalizedCapture.includes(candidate))
    if (matched) continue
    errors.push({
      severity: "error",
      message: `Missing one-of requirement. Expected one of: ${group.map((x) => `"${x}"`).join(", ")}`,
    })
  }

  for (const forbiddenNeedle of expectation.forbidden ?? []) {
    if (!normalizedCapture.includes(forbiddenNeedle)) continue
    errors.push({
      severity: "error",
      message: `Found forbidden text: "${forbiddenNeedle}"`,
    })
  }

  for (const softNeedle of expectation.softRequired ?? []) {
    if (normalizedCapture.includes(softNeedle)) continue
    warnings.push({
      severity: "warning",
      message: `Missing soft-required text: "${softNeedle}"`,
    })
  }

  return {
    errors,
    warnings,
  }
}

export function makeUnifiedDiff(expectedText: string, actualText: string, maxChanges = 80) {
  const expectedLines = expectedText.replace(/\r\n?/g, "\n").split("\n")
  const actualLines = actualText.replace(/\r\n?/g, "\n").split("\n")
  const max = Math.max(expectedLines.length, actualLines.length)

  const chunks: string[] = []
  let changeCount = 0

  for (let idx = 0; idx < max; idx++) {
    const left = expectedLines[idx]
    const right = actualLines[idx]
    if (left === right) continue

    chunks.push(`@@ line ${idx + 1} @@`)
    chunks.push(`- ${left ?? "<missing>"}`)
    chunks.push(`+ ${right ?? "<missing>"}`)
    changeCount++

    if (changeCount >= maxChanges) {
      chunks.push(`... diff truncated after ${maxChanges} changed lines ...`)
      break
    }
  }

  return chunks.join("\n") + (chunks.length > 0 ? "\n" : "")
}
